import { CellData } from "./types";

export const BIG_ROWS = 10000;
export const BIG_COLS = 12;

function cell(raw: string): CellData {
  return { raw, display: raw };
}

function num(n: number): CellData {
  return { raw: String(n), display: n };
}

/** Deterministic virtual cell for the 10k-row sheet */
export function bigCellValue(col: number, row: number): CellData | undefined {
  if (row === 0) {
    if (col === 0) return cell("Row");
    if (col === 11) return cell("Row Total");
    return cell(`Col ${col + 1}`);
  }
  if (row >= 1 && row < BIG_ROWS) {
    if (col === 0) return num(row);
    if (col >= 1 && col <= 10) {
      const v = ((row * 17 + col * 31) % 1000) + (col + 1) * 10;
      return num(v);
    }
    if (col === 11) {
      let sum = 0;
      for (let c = 1; c <= 10; c++) {
        sum += ((row * 17 + c * 31) % 1000) + (c + 1) * 10;
      }
      return { raw: `=SUM(B${row + 1}:K${row + 1})`, display: sum };
    }
  }
  return undefined;
}
