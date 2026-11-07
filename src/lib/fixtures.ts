import { Sheet, cellKey, CellData } from "./types";
import { recalculateSheet } from "./formula";
import { BIG_ROWS, BIG_COLS, bigCellValue } from "./bigData";

export { bigCellValue } from "./bigData";

function cell(raw: string): CellData {
  return { raw, display: raw };
}

function num(n: number): CellData {
  return { raw: String(n), display: n };
}

function formula(raw: string): CellData {
  return { raw, display: "", error: undefined };
}

/** Budget sheet: nested totals, ≥4 formula levels deep */
export function createBudgetSheet(): Sheet {
  const cells: Record<string, CellData> = {};

  cells[cellKey(0, 0)] = cell("Category");
  cells[cellKey(1, 0)] = cell("Item");
  cells[cellKey(2, 0)] = cell("Q1");
  cells[cellKey(3, 0)] = cell("Q2");
  cells[cellKey(4, 0)] = cell("Q3");
  cells[cellKey(5, 0)] = cell("Q4");
  cells[cellKey(6, 0)] = cell("Total");
  cells[cellKey(7, 0)] = cell("Notes");

  cells[cellKey(0, 1)] = cell("Revenue");
  cells[cellKey(1, 2)] = cell("Product A");
  cells[cellKey(2, 2)] = num(12000);
  cells[cellKey(3, 2)] = num(13500);
  cells[cellKey(4, 2)] = num(14200);
  cells[cellKey(5, 2)] = num(15000);
  cells[cellKey(6, 2)] = formula("=SUM(C3:F3)");

  cells[cellKey(1, 3)] = cell("Product B");
  cells[cellKey(2, 3)] = num(8000);
  cells[cellKey(3, 3)] = num(8200);
  cells[cellKey(4, 3)] = num(9100);
  cells[cellKey(5, 3)] = num(9800);
  cells[cellKey(6, 3)] = formula("=SUM(C4:F4)");

  cells[cellKey(1, 4)] = cell("Services");
  cells[cellKey(2, 4)] = num(4500);
  cells[cellKey(3, 4)] = num(4800);
  cells[cellKey(4, 4)] = num(5200);
  cells[cellKey(5, 4)] = num(5500);
  cells[cellKey(6, 4)] = formula("=SUM(C5:F5)");

  cells[cellKey(1, 5)] = cell("Subtotal Revenue");
  cells[cellKey(6, 5)] = formula("=G3+G4+G5");

  cells[cellKey(0, 7)] = cell("Expenses");
  cells[cellKey(1, 8)] = cell("Salaries");
  cells[cellKey(2, 8)] = num(18000);
  cells[cellKey(3, 8)] = num(18000);
  cells[cellKey(4, 8)] = num(18500);
  cells[cellKey(5, 8)] = num(19000);
  cells[cellKey(6, 8)] = formula("=SUM(C9:F9)");

  cells[cellKey(1, 9)] = cell("Marketing");
  cells[cellKey(2, 9)] = num(3000);
  cells[cellKey(3, 9)] = num(3500);
  cells[cellKey(4, 9)] = num(3200);
  cells[cellKey(5, 9)] = num(4000);
  cells[cellKey(6, 9)] = formula("=SUM(C10:F10)");

  cells[cellKey(1, 10)] = cell("Operations");
  cells[cellKey(2, 10)] = num(2200);
  cells[cellKey(3, 10)] = num(2100);
  cells[cellKey(4, 10)] = num(2400);
  cells[cellKey(5, 10)] = num(2300);
  cells[cellKey(6, 10)] = formula("=SUM(C11:F11)");

  cells[cellKey(1, 11)] = cell("Subtotal Expenses");
  cells[cellKey(6, 11)] = formula("=G9+G10+G11");

  cells[cellKey(1, 13)] = cell("Net Income");
  cells[cellKey(6, 13)] = formula("=G6-G12");

  cells[cellKey(1, 15)] = cell("Avg Quarterly Revenue");
  cells[cellKey(6, 15)] = formula("=AVG(G3:G5)");

  cells[cellKey(1, 16)] = cell("Margin %");
  cells[cellKey(6, 16)] = formula("=G14/G6*100");

  cells[cellKey(1, 17)] = cell("Target Net");
  cells[cellKey(6, 17)] = num(15000);
  cells[cellKey(1, 18)] = cell("Gap to Target");
  cells[cellKey(6, 18)] = formula("=G18-G14");

  const sheet: Sheet = {
    id: "budget",
    name: "Budget",
    cells,
    colWidths: { 0: 120, 1: 160, 2: 90, 3: 90, 4: 90, 5: 90, 6: 100, 7: 140 },
    rowCount: 30,
    colCount: 10,
  };
  return recalculateSheet(sheet);
}


export function createBigSheet(): Sheet {
  const cells: Record<string, CellData> = {};
  // Only store formulas for the first 50 rows; the rest resolve via bigCellValue
  for (let r = 1; r <= 50; r++) {
    const v = bigCellValue(11, r);
    cells[cellKey(11, r)] = {
      raw: `=SUM(B${r + 1}:K${r + 1})`,
      display: v ? v.display : 0,
    };
  }

  return {
    id: "big",
    name: "Big (10k)",
    cells,
    colWidths: { 0: 72 },
    rowCount: BIG_ROWS,
    colCount: BIG_COLS,
    virtual: true,
  };
}


/** Resolve a cell: user edit wins, otherwise virtual big-sheet value */
export function resolveCell(
  sheet: Sheet,
  col: number,
  row: number
): CellData | undefined {
  const key = cellKey(col, row);
  if (sheet.cells[key]) return sheet.cells[key];
  if (sheet.id === "big") return bigCellValue(col, row);
  return undefined;
}

/** Broken sheet: cycle, #REF, /0, dependent on broken */
export function createBrokenSheet(): Sheet {
  const cells: Record<string, CellData> = {};

  cells[cellKey(0, 0)] = cell("Label");
  cells[cellKey(1, 0)] = cell("Value");

  cells[cellKey(0, 1)] = cell("Cycle A");
  cells[cellKey(1, 1)] = formula("=B3");
  cells[cellKey(0, 2)] = cell("Cycle B");
  cells[cellKey(1, 2)] = formula("=B2");

  cells[cellKey(0, 4)] = cell("Bad ref");
  cells[cellKey(1, 4)] = formula("=ZZ999");

  cells[cellKey(0, 5)] = cell("Div zero");
  cells[cellKey(1, 5)] = num(0);
  cells[cellKey(0, 6)] = cell("Result /0");
  cells[cellKey(1, 6)] = formula("=100/B6");

  cells[cellKey(0, 8)] = cell("Depends on cycle");
  cells[cellKey(1, 8)] = formula("=B2+10");

  cells[cellKey(0, 9)] = cell("Depends on /0");
  cells[cellKey(1, 9)] = formula("=B7*2");

  const sheet: Sheet = {
    id: "broken",
    name: "Broken",
    cells,
    colWidths: { 0: 160, 1: 120 },
    rowCount: 20,
    colCount: 6,
  };
  return recalculateSheet(sheet);
}

export function createEmptySheet(id: string, name: string): Sheet {
  return {
    id,
    name,
    cells: {},
    colWidths: {},
    rowCount: 100,
    colCount: 26,
  };
}

export function getDefaultSheets(): Sheet[] {
  return [createBudgetSheet(), createBigSheet(), createBrokenSheet()];
}
