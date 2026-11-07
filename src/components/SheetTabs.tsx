"use client";

import { useState } from "react";
import { SheetStore } from "@/lib/store";

type Props = { store: SheetStore };

export function SheetTabs({ store }: Props) {
  const { sheetOrder, sheets, activeSheetId } = store;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");

  return (
    <div className="sheet-tabs" role="tablist" aria-label="Sheets">
      {sheetOrder.map((id) => {
        const sheet = sheets[id];
        if (!sheet) return null;
        const isActive = id === activeSheetId;
        if (renaming === id) {
          return (
            <div key={id} className="sheet-tab active">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if (name.trim()) store.renameSheet(id, name.trim());
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (name.trim()) store.renameSheet(id, name.trim());
                    setRenaming(null);
                  } else if (e.key === "Escape") setRenaming(null);
                }}
                aria-label="Rename sheet"
              />
            </div>
          );
        }
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            className={`sheet-tab${isActive ? " active" : ""}`}
            onClick={() => store.switchSheet(id)}
            onDoubleClick={() => { setRenaming(id); setName(sheet.name); }}
          >
            {sheet.name}
          </button>
        );
      })}
      <button
        className="tb-btn"
        onClick={() => store.addSheet()}
        aria-label="Add sheet"
        title="Add sheet"
        style={{ marginLeft: 4, padding: "2px 8px" }}
      >
        +
      </button>
    </div>
  );
}
