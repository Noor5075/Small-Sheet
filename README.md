# Small Sheet — Frontend Technical Assessment

A keyboard-first spreadsheet built with **React · Next.js (App Router) · TypeScript**.

No grid libraries, no formula libraries, no component kits.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run reset-fixtures   # clear saved state; next load uses built-in fixtures
```

## What is implemented

### Move
- Click / drag selection, Shift-extend
- Arrow keys, Tab, Enter, Home/End, Ctrl+Home/End
- Active cell always visible; sticky row & column headers
- First column frozen; columns resizable

### Edit
- Type to overwrite, F2 / Enter / double-click to edit
- Formula bar (address + raw value)
- Paste from other apps (TSV / plain text; HTML tags stripped)
- Delete / Backspace clears selection

### Compute
- Formulas starting with `=`
- Arithmetic `+ - * /`, parentheses, unary minus
- Cell refs (`B7`) and ranges (`A1:A20`)
- `SUM` and `AVG` / `AVERAGE`
- Multi-pass recalculation; only dependent formulas update
- Errors shown in-cell: `#CYCLE!`, `#DIV/0!`, `#REF!` / `#NAME?`, `#ERROR!`

### Retrace
- Undo / Redo (Ctrl+Z / Ctrl+Shift+Z) for every change including paste
- History capped at 100 steps; redo stack cleared on new edit

### Interface
- Sheet tabs: switch, add, double-click rename
- Status bar: count, sum, average of selection
- Save status: Saved / Saving / Unsaved / Failed (with message)
- Light & dark via `prefers-color-scheme`
- Keyboard reachable; focus outlines; live region announces cell + value
- Desktop & tablet usable; phone does not break

### Persistence
- Route handlers only (`/api/sheets/...`)
- Save is intentionally slow (300–1500 ms) and fails ~1/5 of the time
- Survives reload when save succeeds; failed saves leave dirty state

### Fixtures (deterministic)
1. **Budget** — nested quarterly totals, ≥4 formula levels deep
2. **Big (10k)** — 10,000 rows × 12 columns with a formula column (virtualized scroll)
3. **Broken** — cycle, bad ref, division by zero, dependents of broken cells

## Design notes (for walkthrough)

- **State**: React `useReducer` + sparse cell map (`col,row` keys). Display values derived on write; formulas re-evaluated in multi-pass.
- **Virtualization**: only visible rows/cols (+ overscan) are mounted so 10k rows stay responsive.
- **Undo**: full sheet snapshots (simple and correct). Inverses would be leaner at scale.
- **Save**: debounced auto-save; UI never blocks typing while a request is in flight.
- **Left out**: collaboration, charts, per-cell formatting, file import/export, rich formula language — by design.

## Stack constraints respected

- No AG Grid / Handsontable / TanStack Table / HyperFormula
- No MUI / shadcn / Chakra / Mantine
- Styling: plain CSS with design tokens
