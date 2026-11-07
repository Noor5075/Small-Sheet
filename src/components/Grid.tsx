"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CellAddress,
  Sheet,
  Selection,
  cellKey,
  colToLetter,
  addressToString,
  isInRange,
  normalizeRange,
} from "@/lib/types";
import { SheetStore } from "@/lib/store";
import { resolveCell } from "@/lib/fixtures";

const ROW_H = 30;
const DEFAULT_COL_W = 104;
const CORNER_W = 52;
const OVERSCAN = 6;

type Props = {
  sheet: Sheet;
  selection: Selection;
  editing: boolean;
  editValue: string;
  store: SheetStore;
};

export function Grid({ sheet, selection, editing, editValue, store }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [viewportW, setViewportW] = useState(800);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<CellAddress | null>(null);
  // Prevent blur-commit when focus moves to formula bar or another cell intentionally
  const skipBlurCommit = useRef(false);

  const colCount = sheet.colCount;
  const rowCount = sheet.rowCount;

  const getColW = useCallback(
    (c: number) => sheet.colWidths[c] ?? DEFAULT_COL_W,
    [sheet.colWidths]
  );

  const colOffsets = useMemo(() => {
    const offsets: number[] = [0];
    let x = 0;
    for (let c = 0; c < colCount; c++) {
      x += getColW(c);
      offsets.push(x);
    }
    return offsets;
  }, [colCount, getColW]);

  const totalWidth = colOffsets[colCount] ?? 0;
  const totalHeight = rowCount * ROW_H;

  const startRow = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endRow = Math.min(
    rowCount - 1,
    Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN
  );

  let startCol = 0;
  let endCol = colCount - 1;
  for (let c = 0; c < colCount; c++) {
    if (colOffsets[c + 1] > scrollLeft) {
      startCol = Math.max(0, c - 1);
      break;
    }
  }
  for (let c = startCol; c < colCount; c++) {
    if (colOffsets[c] > scrollLeft + viewportW) {
      endCol = Math.min(colCount - 1, c + 1);
      break;
    }
  }
  startCol = Math.max(0, startCol - OVERSCAN);
  endCol = Math.min(colCount - 1, endCol + OVERSCAN);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight);
      setViewportW(el.clientWidth);
    });
    ro.observe(el);
    setViewportH(el.clientHeight);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setScrollLeft(el.scrollLeft);
  }, []);

  // Focus the in-cell editor when editing starts
  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      // Place caret at end when starting with a typed character
      const len = editInputRef.current.value.length;
      editInputRef.current.setSelectionRange(len, len);
    }
  }, [editing, selection.active.col, selection.active.row]);

  // Keep active cell in view
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || editing) return;
    const { col, row } = selection.active;
    const top = row * ROW_H;
    const left = colOffsets[col] ?? 0;
    const right = colOffsets[col + 1] ?? left + DEFAULT_COL_W;
    const bottom = top + ROW_H;
    let st = el.scrollTop;
    let sl = el.scrollLeft;
    if (top < st) st = top;
    if (bottom > st + el.clientHeight - ROW_H) st = bottom - el.clientHeight + ROW_H;
    if (left < sl) sl = left;
    if (right > sl + el.clientWidth - CORNER_W) sl = right - el.clientWidth + CORNER_W;
    if (st !== el.scrollTop || sl !== el.scrollLeft) {
      el.scrollTo({ top: st, left: sl });
    }
  }, [selection.active, colOffsets, editing]);

  const focusGrid = useCallback(() => {
    viewportRef.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { active, start, end } = selection;
      const maxR = rowCount - 1;
      const maxC = colCount - 1;

      if (editing) {
        // Let the input handle most keys; only intercept navigation
        if (e.key === "Enter") {
          e.preventDefault();
          skipBlurCommit.current = true;
          store.commitEdit();
          const next = { col: active.col, row: Math.min(maxR, active.row + 1) };
          store.select({ active: next, start: next, end: next });
          requestAnimationFrame(focusGrid);
        } else if (e.key === "Escape") {
          e.preventDefault();
          skipBlurCommit.current = true;
          store.cancelEdit();
          requestAnimationFrame(focusGrid);
        } else if (e.key === "Tab") {
          e.preventDefault();
          skipBlurCommit.current = true;
          store.commitEdit();
          const next = {
            col: e.shiftKey ? Math.max(0, active.col - 1) : Math.min(maxC, active.col + 1),
            row: active.row,
          };
          store.select({ active: next, start: next, end: next });
          requestAnimationFrame(focusGrid);
        }
        return;
      }

      // Not editing — grid navigation / start edit
      if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        store.startEdit();
        return;
      }

      // Printable character → start editing with that character
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        store.startEdit(e.key);
        return;
      }

      let next = { ...active };
      let extend = e.shiftKey;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        next.row = Math.max(0, active.row - 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        next.row = Math.min(maxR, active.row + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        next.col = Math.max(0, active.col - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next.col = Math.min(maxC, active.col + 1);
      } else if (e.key === "Tab") {
        e.preventDefault();
        next.col = e.shiftKey
          ? Math.max(0, active.col - 1)
          : Math.min(maxC, active.col + 1);
        extend = false;
      } else if (e.key === "Home") {
        e.preventDefault();
        next.col = 0;
        if (e.ctrlKey) next.row = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        next.col = maxC;
        if (e.ctrlKey) next.row = maxR;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const r = normalizeRange(start, end);
        const updates: Record<string, string> = {};
        for (let row = r.start.row; row <= r.end.row; row++) {
          for (let col = r.start.col; col <= r.end.col; col++) {
            updates[cellKey(col, row)] = "";
          }
        }
        store.setCells(updates);
        return;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
        return;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
        return;
      } else {
        return;
      }

      if (extend) {
        store.select({ active: next, start, end: next });
      } else {
        store.select({ active: next, start: next, end: next });
      }
    },
    [selection, editing, store, rowCount, colCount, focusGrid]
  );

  const copySelection = useCallback(() => {
    const r = normalizeRange(selection.start, selection.end);
    const lines: string[] = [];
    for (let row = r.start.row; row <= r.end.row; row++) {
      const cells: string[] = [];
      for (let col = r.start.col; col <= r.end.col; col++) {
        const c = resolveCell(sheet, col, row);
        cells.push(c ? String(c.display) : "");
      }
      lines.push(cells.join("\t"));
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  }, [selection, sheet.cells]);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const rows = cleaned.split("\n");
      const maxRows = Math.min(rows.length, 500);
      const updates: Record<string, string> = {};
      const { col: sc, row: sr } = selection.active;
      for (let r = 0; r < maxRows; r++) {
        const cols = rows[r].split("\t");
        const maxCols = Math.min(cols.length, 50);
        for (let c = 0; c < maxCols; c++) {
          const tc = sc + c;
          const tr = sr + r;
          if (tc >= colCount || tr >= rowCount) continue;
          updates[cellKey(tc, tr)] = cols[c].replace(/<[^>]*>/g, "").trim();
        }
      }
      if (Object.keys(updates).length > 0) store.setCells(updates);
    },
    [selection.active, store, colCount, rowCount]
  );

  const onMouseDown = useCallback(
    (col: number, row: number, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // Don't preventDefault on the whole event — we need the grid to be able to take focus
      e.preventDefault();
      if (editing) {
        skipBlurCommit.current = true;
        store.commitEdit();
      }
      const addr = { col, row };
      if (e.shiftKey) {
        store.select({ active: addr, start: selection.start, end: addr });
      } else {
        store.select({ active: addr, start: addr, end: addr });
        dragStart.current = addr;
        setIsDragging(true);
      }
      // Critical: return keyboard focus to the grid so typing works
      requestAnimationFrame(focusGrid);
    },
    [editing, store, selection.start, focusGrid]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const el = viewportRef.current;
      if (!el || !dragStart.current) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft - CORNER_W;
      const y = e.clientY - rect.top + el.scrollTop - ROW_H;
      let col = 0;
      for (let c = 0; c < colCount; c++) {
        if (colOffsets[c + 1] > x) {
          col = c;
          break;
        }
        col = c;
      }
      const row = Math.max(0, Math.min(rowCount - 1, Math.floor(y / ROW_H)));
      col = Math.max(0, Math.min(colCount - 1, col));
      store.select({
        active: { col, row },
        start: dragStart.current,
        end: { col, row },
      });
    };
    const onUp = () => {
      setIsDragging(false);
      dragStart.current = null;
      focusGrid();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, colOffsets, colCount, rowCount, store, focusGrid]);

  const resizing = useRef<{ col: number; startX: number; startW: number } | null>(null);
  const onResizeStart = (col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { col, startX: e.clientX, startW: getColW(col) };
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const dx = ev.clientX - resizing.current.startX;
      store.setColWidth(resizing.current.col, Math.max(48, resizing.current.startW + dx));
    };
    const onUp = () => {
      resizing.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const range = normalizeRange(selection.start, selection.end);

  const ariaLabel = useMemo(() => {
    const addr = addressToString(selection.active);
    const cell = resolveCell(sheet, selection.active.col, selection.active.row);
    const val = cell?.error ? cell.error : cell ? String(cell.display) : "empty";
    return `${addr}, ${val}`;
  }, [selection.active, sheet.cells]);

  const handleEditorBlur = () => {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false;
      return;
    }
    // Small delay so click on formula bar / another control can take over
    setTimeout(() => {
      if (skipBlurCommit.current) {
        skipBlurCommit.current = false;
        return;
      }
      store.commitEdit();
    }, 0);
  };

  return (
    <div
      className="grid-viewport"
      ref={viewportRef}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      tabIndex={0}
      role="grid"
      aria-label={`Spreadsheet ${sheet.name}`}
      aria-activedescendant={`cell-${selection.active.col}-${selection.active.row}`}
    >
      <div
        className="grid-canvas"
        style={{
          width: totalWidth + CORNER_W,
          height: totalHeight + ROW_H,
        }}
      >
        <div
          className="col-headers"
          style={{ width: totalWidth + CORNER_W, height: ROW_H }}
        >
          <div className="corner" style={{ height: ROW_H }} />
          {Array.from({ length: endCol - startCol + 1 }, (_, i) => {
            const c = startCol + i;
            return (
              <div
                key={c}
                className="col-header"
                style={{
                  width: getColW(c),
                  position: "absolute",
                  left: CORNER_W + colOffsets[c],
                  top: 0,
                }}
              >
                {colToLetter(c)}
                <div
                  className="resize-handle"
                  onMouseDown={(e) => onResizeStart(c, e)}
                />
              </div>
            );
          })}
        </div>

        {Array.from({ length: endRow - startRow + 1 }, (_, i) => {
          const r = startRow + i;
          return (
            <div
              key={r}
              className="grid-row"
              style={{
                position: "absolute",
                top: ROW_H + r * ROW_H,
                left: 0,
                width: totalWidth + CORNER_W,
                height: ROW_H,
              }}
              role="row"
            >
              <div className="row-header">{r + 1}</div>
              {Array.from({ length: endCol - startCol + 1 }, (_, j) => {
                const c = startCol + j;
                const key = cellKey(c, r);
                const cell = resolveCell(sheet, c, r);
                const isActive =
                  selection.active.col === c && selection.active.row === r;
                const isSelected = isInRange(
                  { col: c, row: r },
                  range.start,
                  range.end
                );
                const isEditing = isActive && editing;
                const isBroken = !!cell?.error;
                const isNumber =
                  cell && typeof cell.display === "number" && !cell.error;
                const isFrozen = c === 0;

                let className = "cell";
                if (isSelected) className += " selected";
                if (isActive) className += " active";
                if (isEditing) className += " editing";
                if (isBroken) className += " broken";
                if (isNumber) className += " number";
                if (isFrozen) className += " frozen";
                if (cell?.raw.startsWith("=") && !cell.error)
                  className += " computed";

                return (
                  <div
                    key={c}
                    id={`cell-${c}-${r}`}
                    className={className}
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-colindex={c + 1}
                    style={{
                      width: getColW(c),
                      position: isFrozen ? "sticky" : "absolute",
                      left: isFrozen ? CORNER_W : CORNER_W + colOffsets[c],
                      top: 0,
                      height: ROW_H,
                    }}
                    onMouseDown={(e) => onMouseDown(c, r, e)}
                    onDoubleClick={() => {
                      store.select({
                        active: { col: c, row: r },
                        start: { col: c, row: r },
                        end: { col: c, row: r },
                      });
                      store.startEdit();
                    }}
                  >
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        className="cell-editor"
                        value={editValue}
                        onChange={(e) => store.updateEdit(e.target.value)}
                        onBlur={handleEditorBlur}
                        onKeyDown={(e) => {
                          // Stop grid from also handling when typing in editor
                          if (
                            e.key !== "Enter" &&
                            e.key !== "Escape" &&
                            e.key !== "Tab"
                          ) {
                            e.stopPropagation();
                          }
                        }}
                        aria-label={`Edit ${addressToString({ col: c, row: r })}`}
                      />
                    ) : cell?.error ? (
                      cell.error
                    ) : cell ? (
                      String(cell.display)
                    ) : (
                      ""
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaLabel}
      </div>
    </div>
  );
}
