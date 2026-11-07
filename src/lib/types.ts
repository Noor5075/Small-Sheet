export type CellAddress = { col: number; row: number };

export type CellValue = string | number | null;

export type CellData = {
  /** Raw input the user typed (or pasted). Formulas start with "=". */
  raw: string;
  /** Display value after evaluation (string or number). */
  display: string | number;
  /** Error message if the formula is broken. */
  error?: string;
};

export type SheetId = string;

export type Sheet = {
  id: SheetId;
  name: string;
  /** Sparse map: key = `${col},${row}` */
  cells: Record<string, CellData>;
  /** Column widths in px, keyed by col index. */
  colWidths: Record<number, number>;
  rowCount: number;
  colCount: number;
  /** When true, missing cells are filled by fixtures.resolveCell */
  virtual?: boolean;
};

export type Selection = {
  /** Active (focus) cell */
  active: CellAddress;
  /** Selection range (inclusive). May equal active for single cell. */
  start: CellAddress;
  end: CellAddress;
};

export type SaveStatus = "saved" | "saving" | "dirty" | "failed";

export type AppState = {
  sheets: Record<SheetId, Sheet>;
  sheetOrder: SheetId[];
  activeSheetId: SheetId;
  selection: Selection;
  /** Whether the formula bar / cell is in edit mode */
  editing: boolean;
  /** Current edit buffer when editing */
  editValue: string;
  saveStatus: SaveStatus;
  lastError?: string;
};

export type Change = {
  type: "setCells" | "renameSheet" | "addSheet" | "deleteSheet" | "setColWidth";
  sheetId: SheetId;
  before: Record<string, CellData | undefined> | { name?: string } | { col?: number; width?: number };
  after: Record<string, CellData | undefined> | { name?: string } | { col?: number; width?: number };
  label?: string;
};

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function parseCellKey(key: string): CellAddress {
  const [c, r] = key.split(",").map(Number);
  return { col: c, row: r };
}

export function colToLetter(col: number): string {
  let n = col + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function letterToCol(letter: string): number {
  let n = 0;
  const s = letter.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

export function addressToString(a: CellAddress): string {
  return `${colToLetter(a.col)}${a.row + 1}`;
}

export function parseAddress(str: string): CellAddress | null {
  const m = str.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const col = letterToCol(m[1]);
  const row = parseInt(m[2], 10) - 1;
  if (col < 0 || row < 0) return null;
  return { col, row };
}

export function normalizeRange(a: CellAddress, b: CellAddress): { start: CellAddress; end: CellAddress } {
  return {
    start: { col: Math.min(a.col, b.col), row: Math.min(a.row, b.row) },
    end: { col: Math.max(a.col, b.col), row: Math.max(a.row, b.row) },
  };
}

export function isInRange(addr: CellAddress, start: CellAddress, end: CellAddress): boolean {
  const r = normalizeRange(start, end);
  return (
    addr.col >= r.start.col &&
    addr.col <= r.end.col &&
    addr.row >= r.start.row &&
    addr.row <= r.end.row
  );
}
