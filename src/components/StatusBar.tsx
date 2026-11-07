"use client";

import { useMemo } from "react";
import { cellKey, normalizeRange } from "@/lib/types";
import { resolveCell } from "@/lib/fixtures";
import { SheetStore } from "@/lib/store";

type Props = { store: SheetStore };

export function StatusBar({ store }: Props) {
  const { activeSheet, selection } = store;
  const stats = useMemo(() => {
    if (!activeSheet) return null;
    const r = normalizeRange(selection.start, selection.end);
    let sum = 0;
    let count = 0;
    let numericCount = 0;
    for (let row = r.start.row; row <= r.end.row; row++) {
      for (let col = r.start.col; col <= r.end.col; col++) {
        count++;
        const cell = resolveCell(activeSheet, col, row);
        if (!cell || cell.error) continue;
        const n = typeof cell.display === "number" ? cell.display : Number(cell.display);
        if (!isNaN(n) && cell.display !== "" && cell.display !== null) {
          sum += n;
          numericCount++;
        }
      }
    }
    const avg = numericCount > 0 ? sum / numericCount : 0;
    return { sum, avg, count, numericCount };
  }, [activeSheet, selection]);

  if (!stats) return null;

  return (
    <div className="status-bar" aria-live="polite">
      <span>Count <b>{stats.count}</b></span>
      {stats.numericCount > 0 && (
        <>
          <span>Sum <b>{formatNum(stats.sum)}</b></span>
          <span>Avg <b>{formatNum(stats.avg)}</b></span>
        </>
      )}
    </div>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 100) / 100).toLocaleString();
}
