"use client";

import { useCallback, useReducer, useRef, useEffect } from "react";
import {
  AppState,
  CellAddress,
  CellData,
  Selection,
  Sheet,
  SheetId,
  cellKey,
  normalizeRange,
  addressToString,
  SaveStatus,
} from "./types";
import { setCellAndRecalc, setCellsAndRecalc, recalculateSheet } from "./formula";
import { getDefaultSheets, createEmptySheet } from "./fixtures";

const MAX_UNDO = 100;

type HistoryEntry = {
  sheets: Record<SheetId, Sheet>;
  sheetOrder: SheetId[];
  activeSheetId: SheetId;
  selection: Selection;
};

type Action =
  | { type: "INIT"; sheets: Sheet[] }
  | { type: "SELECT"; selection: Selection; editing?: boolean }
  | { type: "START_EDIT"; value?: string }
  | { type: "UPDATE_EDIT"; value: string }
  | { type: "COMMIT_EDIT" }
  | { type: "CANCEL_EDIT" }
  | { type: "SET_CELL"; col: number; row: number; raw: string }
  | { type: "SET_CELLS"; updates: Record<string, string> }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "ADD_SHEET" }
  | { type: "RENAME_SHEET"; id: SheetId; name: string }
  | { type: "SWITCH_SHEET"; id: SheetId }
  | { type: "SET_COL_WIDTH"; col: number; width: number }
  | { type: "SET_SAVE_STATUS"; status: SaveStatus; error?: string }
  | { type: "LOAD_SHEETS"; sheets: Sheet[]; activeId?: SheetId }
  | { type: "REPLACE_SHEET"; sheet: Sheet };

function pushHistory(
  past: HistoryEntry[],
  state: AppState
): HistoryEntry[] {
  const entry: HistoryEntry = {
    sheets: structuredClone(state.sheets),
    sheetOrder: [...state.sheetOrder],
    activeSheetId: state.activeSheetId,
    selection: { ...state.selection, active: { ...state.selection.active }, start: { ...state.selection.start }, end: { ...state.selection.end } },
  };
  const next = [...past, entry];
  if (next.length > MAX_UNDO) next.shift();
  return next;
}

type FullState = AppState & {
  past: HistoryEntry[];
  future: HistoryEntry[];
};

function reducer(state: FullState, action: Action): FullState {
  switch (action.type) {
    case "INIT": {
      const map: Record<SheetId, Sheet> = {};
      action.sheets.forEach((s) => (map[s.id] = s));
      return {
        ...state,
        sheets: map,
        sheetOrder: action.sheets.map((s) => s.id),
        activeSheetId: action.sheets[0]?.id ?? "budget",
        selection: {
          active: { col: 0, row: 0 },
          start: { col: 0, row: 0 },
          end: { col: 0, row: 0 },
        },
        editing: false,
        editValue: "",
        saveStatus: "saved",
        past: [],
        future: [],
      };
    }
    case "LOAD_SHEETS": {
      const map: Record<SheetId, Sheet> = {};
      action.sheets.forEach((s) => (map[s.id] = s));
      return {
        ...state,
        sheets: map,
        sheetOrder: action.sheets.map((s) => s.id),
        activeSheetId: action.activeId ?? action.sheets[0]?.id ?? "budget",
        saveStatus: "saved",
        past: [],
        future: [],
      };
    }
    case "SELECT":
      return {
        ...state,
        selection: action.selection,
        editing: action.editing ?? false,
        editValue: action.editing ? state.editValue : "",
      };
    case "START_EDIT": {
      const sheet = state.sheets[state.activeSheetId];
      const key = cellKey(state.selection.active.col, state.selection.active.row);
      const existing = sheet?.cells[key];
      return {
        ...state,
        editing: true,
        editValue: action.value ?? existing?.raw ?? "",
      };
    }
    case "UPDATE_EDIT":
      return { ...state, editValue: action.value };
    case "CANCEL_EDIT":
      return { ...state, editing: false, editValue: "" };
    case "COMMIT_EDIT": {
      if (!state.editing) return state;
      const { col, row } = state.selection.active;
      const past = pushHistory(state.past, state);
      const sheet = state.sheets[state.activeSheetId];
      const nextSheet = setCellAndRecalc(sheet, col, row, state.editValue);
      return {
        ...state,
        sheets: { ...state.sheets, [nextSheet.id]: nextSheet },
        editing: false,
        editValue: "",
        saveStatus: "dirty",
        past,
        future: [],
      };
    }
    case "SET_CELL": {
      const past = pushHistory(state.past, state);
      const sheet = state.sheets[state.activeSheetId];
      const nextSheet = setCellAndRecalc(sheet, action.col, action.row, action.raw);
      return {
        ...state,
        sheets: { ...state.sheets, [nextSheet.id]: nextSheet },
        saveStatus: "dirty",
        past,
        future: [],
      };
    }
    case "SET_CELLS": {
      const past = pushHistory(state.past, state);
      const sheet = state.sheets[state.activeSheetId];
      const nextSheet = setCellsAndRecalc(sheet, action.updates);
      return {
        ...state,
        sheets: { ...state.sheets, [nextSheet.id]: nextSheet },
        saveStatus: "dirty",
        past,
        future: [],
      };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      const futureEntry: HistoryEntry = {
        sheets: structuredClone(state.sheets),
        sheetOrder: [...state.sheetOrder],
        activeSheetId: state.activeSheetId,
        selection: state.selection,
      };
      return {
        ...state,
        sheets: prev.sheets,
        sheetOrder: prev.sheetOrder,
        activeSheetId: prev.activeSheetId,
        selection: prev.selection,
        editing: false,
        editValue: "",
        saveStatus: "dirty",
        past: state.past.slice(0, -1),
        future: [...state.future, futureEntry],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[state.future.length - 1];
      const pastEntry: HistoryEntry = {
        sheets: structuredClone(state.sheets),
        sheetOrder: [...state.sheetOrder],
        activeSheetId: state.activeSheetId,
        selection: state.selection,
      };
      return {
        ...state,
        sheets: next.sheets,
        sheetOrder: next.sheetOrder,
        activeSheetId: next.activeSheetId,
        selection: next.selection,
        editing: false,
        editValue: "",
        saveStatus: "dirty",
        past: [...state.past, pastEntry],
        future: state.future.slice(0, -1),
      };
    }
    case "ADD_SHEET": {
      const past = pushHistory(state.past, state);
      const id = `sheet-${Date.now()}`;
      const sheet = createEmptySheet(id, `Sheet ${state.sheetOrder.length + 1}`);
      return {
        ...state,
        sheets: { ...state.sheets, [id]: sheet },
        sheetOrder: [...state.sheetOrder, id],
        activeSheetId: id,
        selection: {
          active: { col: 0, row: 0 },
          start: { col: 0, row: 0 },
          end: { col: 0, row: 0 },
        },
        saveStatus: "dirty",
        past,
        future: [],
      };
    }
    case "RENAME_SHEET": {
      const past = pushHistory(state.past, state);
      const sheet = state.sheets[action.id];
      if (!sheet) return state;
      return {
        ...state,
        sheets: {
          ...state.sheets,
          [action.id]: { ...sheet, name: action.name },
        },
        saveStatus: "dirty",
        past,
        future: [],
      };
    }
    case "SWITCH_SHEET":
      if (!state.sheets[action.id]) return state;
      return {
        ...state,
        activeSheetId: action.id,
        selection: {
          active: { col: 0, row: 0 },
          start: { col: 0, row: 0 },
          end: { col: 0, row: 0 },
        },
        editing: false,
        editValue: "",
      };
    case "SET_COL_WIDTH": {
      const sheet = state.sheets[state.activeSheetId];
      if (!sheet) return state;
      return {
        ...state,
        sheets: {
          ...state.sheets,
          [sheet.id]: {
            ...sheet,
            colWidths: { ...sheet.colWidths, [action.col]: action.width },
          },
        },
        saveStatus: "dirty",
      };
    }
    case "SET_SAVE_STATUS":
      return {
        ...state,
        saveStatus: action.status,
        lastError: action.error,
      };
    case "REPLACE_SHEET":
      return {
        ...state,
        sheets: { ...state.sheets, [action.sheet.id]: action.sheet },
      };
    default:
      return state;
  }
}

const initial: FullState = {
  sheets: {},
  sheetOrder: [],
  activeSheetId: "",
  selection: {
    active: { col: 0, row: 0 },
    start: { col: 0, row: 0 },
    end: { col: 0, row: 0 },
  },
  editing: false,
  editValue: "",
  saveStatus: "saved",
  past: [],
  future: [],
};

export function useSheetStore() {
  const [state, dispatch] = useReducer(reducer, initial);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeSheet = state.sheets[state.activeSheetId];

  const select = useCallback((selection: Selection, editing?: boolean) => {
    dispatch({ type: "SELECT", selection, editing });
  }, []);

  const startEdit = useCallback((value?: string) => {
    dispatch({ type: "START_EDIT", value });
  }, []);

  const updateEdit = useCallback((value: string) => {
    dispatch({ type: "UPDATE_EDIT", value });
  }, []);

  const commitEdit = useCallback(() => {
    dispatch({ type: "COMMIT_EDIT" });
  }, []);

  const cancelEdit = useCallback(() => {
    dispatch({ type: "CANCEL_EDIT" });
  }, []);

  const setCell = useCallback((col: number, row: number, raw: string) => {
    dispatch({ type: "SET_CELL", col, row, raw });
  }, []);

  const setCells = useCallback((updates: Record<string, string>) => {
    dispatch({ type: "SET_CELLS", updates });
  }, []);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const addSheet = useCallback(() => dispatch({ type: "ADD_SHEET" }), []);
  const renameSheet = useCallback((id: SheetId, name: string) => {
    dispatch({ type: "RENAME_SHEET", id, name });
  }, []);
  const switchSheet = useCallback((id: SheetId) => {
    dispatch({ type: "SWITCH_SHEET", id });
  }, []);
  const setColWidth = useCallback((col: number, width: number) => {
    dispatch({ type: "SET_COL_WIDTH", col, width });
  }, []);

  const init = useCallback((sheets: Sheet[]) => {
    dispatch({ type: "INIT", sheets });
  }, []);

  const loadSheets = useCallback((sheets: Sheet[], activeId?: SheetId) => {
    dispatch({ type: "LOAD_SHEETS", sheets, activeId });
  }, []);

  // Auto-save when dirty (debounced, one retry on network error)
  useEffect(() => {
    if (state.saveStatus !== "dirty") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      dispatch({ type: "SET_SAVE_STATUS", status: "saving" });

      const payload = {
        sheets: state.sheetOrder.map((id) => state.sheets[id]),
        activeSheetId: state.activeSheetId,
      };

      const attempt = async (): Promise<Response> => {
        return fetch(`/api/sheets/${state.activeSheetId || "budget"}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      };

      try {
        let res = await attempt();
        // One automatic retry on hard network failure
        if (!res.ok && res.status >= 500) {
          await new Promise((r) => setTimeout(r, 400));
          res = await attempt();
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as { error?: string }));
          dispatch({
            type: "SET_SAVE_STATUS",
            status: "failed",
            error: body.error || `Save failed (${res.status})`,
          });
          return;
        }
        dispatch({ type: "SET_SAVE_STATUS", status: "saved" });
      } catch (e) {
        // Retry once on fetch throw (Failed to fetch)
        try {
          await new Promise((r) => setTimeout(r, 500));
          const res = await attempt();
          if (!res.ok) {
            const body = await res.json().catch(() => ({} as { error?: string }));
            dispatch({
              type: "SET_SAVE_STATUS",
              status: "failed",
              error: body.error || `Save failed (${res.status})`,
            });
            return;
          }
          dispatch({ type: "SET_SAVE_STATUS", status: "saved" });
        } catch (e2) {
          dispatch({
            type: "SET_SAVE_STATUS",
            status: "failed",
            error: e2 instanceof Error ? e2.message : "Network error",
          });
        }
      }
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state.saveStatus, state.sheets, state.sheetOrder, state.activeSheetId]);

  return {
    ...state,
    activeSheet,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    select,
    startEdit,
    updateEdit,
    commitEdit,
    cancelEdit,
    setCell,
    setCells,
    undo,
    redo,
    addSheet,
    renameSheet,
    switchSheet,
    setColWidth,
    init,
    loadSheets,
    dispatch,
  };
}

export type SheetStore = ReturnType<typeof useSheetStore>;
