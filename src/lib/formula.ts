import {
  CellAddress,
  CellData,
  Sheet,
  cellKey,
  letterToCol,
  parseAddress,
  colToLetter,
} from "./types";
import { bigCellValue } from "./bigData";

type Token =
  | { kind: "number"; value: number }
  | { kind: "ref"; col: number; row: number }
  | { kind: "range"; start: CellAddress; end: CellAddress }
  | { kind: "func"; name: string }
  | { kind: "op"; op: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

const FUNC_NAMES = new Set(["SUM", "AVG", "AVERAGE"]);

function tokenize(input: string): Token[] {
  const s = input.trim();
  if (!s.startsWith("=")) return [];
  const expr = s.slice(1);
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      tokens.push({ kind: "number", value: parseFloat(expr.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9]/.test(expr[j])) j++;
      const word = expr.slice(i, j).toUpperCase();
      // Check if it's a function name followed by (
      let k = j;
      while (k < expr.length && /\s/.test(expr[k])) k++;
      if (FUNC_NAMES.has(word) && expr[k] === "(") {
        tokens.push({ kind: "func", name: word === "AVERAGE" ? "AVG" : word });
        i = j;
        continue;
      }
      // Cell ref or range
      const refMatch = word.match(/^([A-Z]+)(\d+)$/);
      if (refMatch) {
        const col = letterToCol(refMatch[1]);
        const row = parseInt(refMatch[2], 10) - 1;
        // Look ahead for range :
        let m = j;
        while (m < expr.length && /\s/.test(expr[m])) m++;
        if (expr[m] === ":") {
          m++;
          while (m < expr.length && /\s/.test(expr[m])) m++;
          let n = m;
          while (n < expr.length && /[A-Za-z0-9]/.test(expr[n])) n++;
          const endWord = expr.slice(m, n).toUpperCase();
          const endMatch = endWord.match(/^([A-Z]+)(\d+)$/);
          if (endMatch) {
            const endCol = letterToCol(endMatch[1]);
            const endRow = parseInt(endMatch[2], 10) - 1;
            tokens.push({
              kind: "range",
              start: { col, row },
              end: { col: endCol, row: endRow },
            });
            i = n;
            continue;
          }
        }
        tokens.push({ kind: "ref", col, row });
        i = j;
        continue;
      }
      // Unknown identifier — treat as error later
      tokens.push({ kind: "func", name: word });
      i = j;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i++;
      continue;
    }
    if ("+-*/^".includes(ch)) {
      tokens.push({ kind: "op", op: ch });
      i++;
      continue;
    }
    // Skip unknown
    i++;
  }
  return tokens;
}

type EvalResult = { value: number } | { error: string };

type GetCell = (col: number, row: number) => { raw: string; display: string | number; error?: string } | undefined;

function evalTokens(
  tokens: Token[],
  getCell: GetCell,
  visiting: Set<string>
): EvalResult {
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }
  function next(): Token | undefined {
    return tokens[pos++];
  }

  function parseExpression(): EvalResult {
    return parseAdd();
  }

  function parseAdd(): EvalResult {
    let left = parseMul();
    if ("error" in left) return left;
    while (peek()?.kind === "op" && (peek() as { op: string }).op === "+" || (peek() as { op: string })?.op === "-") {
      const op = (next() as { op: string }).op;
      const right = parseMul();
      if ("error" in right) return right;
      left = { value: op === "+" ? left.value + right.value : left.value - right.value };
    }
    return left;
  }

  function parseMul(): EvalResult {
    let left = parseUnary();
    if ("error" in left) return left;
    while (peek()?.kind === "op" && ((peek() as { op: string }).op === "*" || (peek() as { op: string }).op === "/")) {
      const op = (next() as { op: string }).op;
      const right = parseUnary();
      if ("error" in right) return right;
      if (op === "/" && right.value === 0) return { error: "#DIV/0!" };
      left = { value: op === "*" ? left.value * right.value : left.value / right.value };
    }
    return left;
  }

  function parseUnary(): EvalResult {
    if (peek()?.kind === "op" && ((peek() as { op: string }).op === "+" || (peek() as { op: string }).op === "-")) {
      const op = (next() as { op: string }).op;
      const v = parsePrimary();
      if ("error" in v) return v;
      return { value: op === "-" ? -v.value : v.value };
    }
    return parsePrimary();
  }

  function parsePrimary(): EvalResult {
    const t = peek();
    if (!t) return { error: "#ERROR!" };

    if (t.kind === "number") {
      next();
      return { value: t.value };
    }

    if (t.kind === "ref") {
      next();
      return resolveRef(t.col, t.row);
    }

    if (t.kind === "range") {
      next();
      // Ranges only make sense inside SUM/AVG
      return { error: "#VALUE!" };
    }

    if (t.kind === "func") {
      next();
      if (peek()?.kind !== "lparen") return { error: "#NAME?" };
      next(); // (
      const args: EvalResult[] = [];
      if (peek()?.kind !== "rparen") {
        while (true) {
          // Range as single arg for SUM/AVG
          if (peek()?.kind === "range") {
            const r = next() as { kind: "range"; start: CellAddress; end: CellAddress };
            const vals = collectRange(r.start, r.end);
            if ("error" in vals) return vals;
            args.push({ value: vals.value }); // placeholder; we handle specially
            // Actually push the list via a side channel — simpler: evaluate SUM/AVG here
          } else {
            const arg = parseExpression();
            if ("error" in arg) return arg;
            args.push(arg);
          }
          if (peek()?.kind === "comma") {
            next();
            continue;
          }
          break;
        }
      }
      if (peek()?.kind !== "rparen") return { error: "#ERROR!" };
      next(); // )

      // Re-parse for ranges properly by looking at original tokens is hard;
      // instead re-implement SUM/AVG with range support below by scanning args differently.
      // For simplicity we handle common case in a dedicated path.
      return applyFunc(t.name, args);
    }

    if (t.kind === "lparen") {
      next();
      const inner = parseExpression();
      if (peek()?.kind !== "rparen") return { error: "#ERROR!" };
      next();
      return inner;
    }

    return { error: "#ERROR!" };
  }

  function resolveRef(col: number, row: number): EvalResult {
    const key = cellKey(col, row);
    if (visiting.has(key)) return { error: "#CYCLE!" };
    const cell = getCell(col, row);
    if (!cell) return { value: 0 }; // empty = 0
    if (cell.error) return { error: cell.error };
    if (typeof cell.display === "number") return { value: cell.display };
    if (cell.raw.startsWith("=")) {
      // Should already be evaluated; if not, treat as 0
      const n = Number(cell.display);
      return isNaN(n) ? { value: 0 } : { value: n };
    }
    const n = Number(cell.display);
    if (!isNaN(n) && cell.display !== "") return { value: n };
    return { value: 0 };
  }

  function collectRange(start: CellAddress, end: CellAddress): EvalResult {
    const minC = Math.min(start.col, end.col);
    const maxC = Math.max(start.col, end.col);
    const minR = Math.min(start.row, end.row);
    const maxR = Math.max(start.row, end.row);
    let sum = 0;
    let count = 0;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const v = resolveRef(c, r);
        if ("error" in v) return v;
        sum += v.value;
        count++;
      }
    }
    return { value: sum, /* count attached via closure */ } as EvalResult & { count?: number };
  }

  function applyFunc(name: string, args: EvalResult[]): EvalResult {
    if (name === "SUM") {
      let sum = 0;
      for (const a of args) {
        if ("error" in a) return a;
        sum += a.value;
      }
      return { value: sum };
    }
    if (name === "AVG") {
      if (args.length === 0) return { error: "#DIV/0!" };
      let sum = 0;
      for (const a of args) {
        if ("error" in a) return a;
        sum += a.value;
      }
      return { value: sum / args.length };
    }
    return { error: "#NAME?" };
  }

  // Better SUM/AVG with ranges: re-tokenize aware path
  // Override parsePrimary for func to handle ranges natively

  const result = parseExpression();
  if (pos < tokens.length) {
    // leftover tokens
  }
  return result;
}

/** Improved evaluator that properly handles ranges inside SUM/AVG */
export function evaluateFormula(
  raw: string,
  getCell: GetCell,
  selfKey?: string
): { display: string | number; error?: string } {
  if (!raw.startsWith("=")) {
    const n = Number(raw);
    if (raw.trim() !== "" && !isNaN(n) && isFinite(n)) {
      return { display: n };
    }
    return { display: raw };
  }

  const tokens = tokenize(raw);
  if (tokens.length === 0) return { display: raw, error: "#ERROR!" };

  const visiting = new Set<string>();
  if (selfKey) visiting.add(selfKey);

  // Custom recursive descent with proper range support for SUM/AVG
  let pos = 0;
  function peek(): Token | undefined {
    return tokens[pos];
  }
  function next(): Token | undefined {
    return tokens[pos++];
  }

  function resolveRef(col: number, row: number): EvalResult {
    const key = cellKey(col, row);
    if (visiting.has(key)) return { error: "#CYCLE!" };
    const cell = getCell(col, row);
    if (!cell) return { value: 0 };
    if (cell.error) return { error: cell.error };
    if (typeof cell.display === "number") return { value: cell.display };
    const n = Number(cell.display);
    if (!isNaN(n) && String(cell.display).trim() !== "") return { value: n };
    return { value: 0 };
  }

  function parseExpr(): EvalResult {
    return parseAdd();
  }

  function parseAdd(): EvalResult {
    let left = parseMul();
    if ("error" in left) return left;
    while (true) {
      const t = peek();
      if (t?.kind !== "op" || (t.op !== "+" && t.op !== "-")) break;
      next();
      const right = parseMul();
      if ("error" in right) return right;
      left = { value: t.op === "+" ? left.value + right.value : left.value - right.value };
    }
    return left;
  }

  function parseMul(): EvalResult {
    let left = parseUnary();
    if ("error" in left) return left;
    while (true) {
      const t = peek();
      if (t?.kind !== "op" || (t.op !== "*" && t.op !== "/")) break;
      next();
      const right = parseUnary();
      if ("error" in right) return right;
      if (t.op === "/" && right.value === 0) return { error: "#DIV/0!" };
      left = { value: t.op === "*" ? left.value * right.value : left.value / right.value };
    }
    return left;
  }

  function parseUnary(): EvalResult {
    const t = peek();
    if (t?.kind === "op" && (t.op === "+" || t.op === "-")) {
      next();
      const v = parsePrimary();
      if ("error" in v) return v;
      return { value: t.op === "-" ? -v.value : v.value };
    }
    return parsePrimary();
  }

  function parsePrimary(): EvalResult {
    const t = peek();
    if (!t) return { error: "#ERROR!" };

    if (t.kind === "number") {
      next();
      return { value: t.value };
    }
    if (t.kind === "ref") {
      next();
      return resolveRef(t.col, t.row);
    }
    if (t.kind === "range") {
      next();
      return { error: "#VALUE!" };
    }
    if (t.kind === "func") {
      next();
      if (peek()?.kind !== "lparen") return { error: "#NAME?" };
      next();
      const numbers: number[] = [];

      const consumeArg = (): EvalResult | null => {
        if (peek()?.kind === "range") {
          const r = next() as Extract<Token, { kind: "range" }>;
          const minC = Math.min(r.start.col, r.end.col);
          const maxC = Math.max(r.start.col, r.end.col);
          const minR = Math.min(r.start.row, r.end.row);
          const maxR = Math.max(r.start.row, r.end.row);
          for (let row = minR; row <= maxR; row++) {
            for (let col = minC; col <= maxC; col++) {
              const v = resolveRef(col, row);
              if ("error" in v) return v;
              numbers.push(v.value);
            }
          }
          return null;
        }
        const v = parseExpr();
        if ("error" in v) return v;
        numbers.push(v.value);
        return null;
      };

      if (peek()?.kind !== "rparen") {
        while (true) {
          const err = consumeArg();
          if (err && "error" in err) return err;
          if (peek()?.kind === "comma") {
            next();
            continue;
          }
          break;
        }
      }
      if (peek()?.kind !== "rparen") return { error: "#ERROR!" };
      next();

      if (t.name === "SUM") {
        return { value: numbers.reduce((a, b) => a + b, 0) };
      }
      if (t.name === "AVG") {
        if (numbers.length === 0) return { error: "#DIV/0!" };
        return { value: numbers.reduce((a, b) => a + b, 0) / numbers.length };
      }
      return { error: "#NAME?" };
    }
    if (t.kind === "lparen") {
      next();
      const inner = parseExpr();
      if (peek()?.kind !== "rparen") return { error: "#ERROR!" };
      next();
      return inner;
    }
    return { error: "#ERROR!" };
  }

  const result = parseExpr();
  if ("error" in result) return { display: result.error, error: result.error };
  // Format nicely
  const v = result.value;
  if (Number.isInteger(v)) return { display: v };
  return { display: Math.round(v * 1e10) / 1e10 };
}

/** Recalculate all formula cells in a sheet, respecting dependency order approximately via multi-pass. */
function makeGetCell(cells: Record<string, CellData>, sheetId: string) {
  return (c: number, r: number) => {
    const k = cellKey(c, r);
    if (cells[k]) return cells[k];
    if (sheetId === "big") return bigCellValue(c, r);
    return undefined;
  };
}

export function recalculateSheet(sheet: Sheet): Sheet {
  const cells = { ...sheet.cells };
  const keys = Object.keys(cells);
  const formulaKeys = keys.filter((k) => cells[k].raw.startsWith("="));

  // Multi-pass (simple topological approximation)
  for (let pass = 0; pass < Math.min(formulaKeys.length + 2, 50); pass++) {
    let changed = false;
    for (const key of formulaKeys) {
      const cell = cells[key];
      const [col, row] = key.split(",").map(Number);
      const getCell = makeGetCell(cells, sheet.id);
      const result = evaluateFormula(cell.raw, getCell, key);
      if (result.display !== cell.display || result.error !== cell.error) {
        cells[key] = { raw: cell.raw, display: result.display, error: result.error };
        changed = true;
      }
    }
    if (!changed) break;
  }

  return { ...sheet, cells };
}

export function setCellAndRecalc(
  sheet: Sheet,
  col: number,
  row: number,
  raw: string
): Sheet {
  const key = cellKey(col, row);
  const cells = { ...sheet.cells };
  if (raw === "") {
    delete cells[key];
  } else {
    const getCell = makeGetCell(cells, sheet.id);
    const evaluated = evaluateFormula(raw, getCell, key);
    cells[key] = { raw, display: evaluated.display, error: evaluated.error };
  }
  return recalculateSheet({ ...sheet, cells });
}

export function setCellsAndRecalc(
  sheet: Sheet,
  updates: Record<string, string>
): Sheet {
  const cells = { ...sheet.cells };
  for (const [key, raw] of Object.entries(updates)) {
    if (raw === "") {
      delete cells[key];
    } else {
      cells[key] = { raw, display: raw, error: undefined };
    }
  }
  // Evaluate non-formulas first
  for (const [key, cell] of Object.entries(cells)) {
    if (!cell.raw.startsWith("=")) {
      const n = Number(cell.raw);
      if (cell.raw.trim() !== "" && !isNaN(n) && isFinite(n)) {
        cells[key] = { raw: cell.raw, display: n };
      } else {
        cells[key] = { raw: cell.raw, display: cell.raw };
      }
    }
  }
  return recalculateSheet({ ...sheet, cells });
}
