"use client";

import { useRef } from "react";
import { addressToString, cellKey } from "@/lib/types";
import { resolveCell } from "@/lib/fixtures";
import { SheetStore } from "@/lib/store";

type Props = { store: SheetStore };

export function FormulaBar({ store }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeSheet, selection, editing, editValue } = store;
  if (!activeSheet) return null;

  const addr = addressToString(selection.active);
  const key = cellKey(selection.active.col, selection.active.row);
  const cell = resolveCell(activeSheet, selection.active.col, selection.active.row);
  const displayValue = editing ? editValue : cell ? cell.raw : "";

  return (
    <div className="formula-bar">
      <div className="addr" aria-label="Active cell address">
        {addr}
      </div>
      <div className="fx-label" aria-hidden="true">
        fx
      </div>
      <input
        ref={inputRef}
        value={displayValue}
        placeholder="Enter value or formula (=SUM(A1:A5))"
        onChange={(e) => {
          if (!editing) store.startEdit(e.target.value);
          else store.updateEdit(e.target.value);
        }}
        onFocus={() => {
          if (!editing) store.startEdit();
        }}
        onBlur={() => {
          if (editing) store.commitEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            store.commitEdit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            store.cancelEdit();
          }
        }}
        aria-label="Formula bar"
        spellCheck={false}
      />
    </div>
  );
}
