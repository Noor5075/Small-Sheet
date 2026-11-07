import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "sheets.json");

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Intentional latency: 300–1500 ms (assessment requirement)
  const wait = 300 + Math.floor(Math.random() * 1200);
  await delay(wait);

  // Intentional failure ~1 in 20 while testing (use 0.2 for final submission)
  if (Math.random() < 0.05) {
    return NextResponse.json(
      { error: "Simulated save failure — try again" },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();

    // Strip virtual bulk: for the big sheet only persist user edits (cells map is already sparse)
    if (Array.isArray(body.sheets)) {
      body.sheets = body.sheets.map(
        (s: { id: string; cells?: Record<string, unknown> }) => {
          if (s.id === "big" && s.cells && Object.keys(s.cells).length > 500) {
            // Keep at most 500 explicit overrides
            const keys = Object.keys(s.cells).slice(0, 500);
            const trimmed: Record<string, unknown> = {};
            for (const k of keys) trimmed[k] = s.cells[k];
            return { ...s, cells: trimmed };
          }
          return s;
        }
      );
    }

    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(body), "utf-8");
    return NextResponse.json({ ok: true, sheetId: params.id });
  } catch (e) {
    console.error("Save error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Write failed" },
      { status: 500 }
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(raw);
    const sheet = data.sheets?.find((s: { id: string }) => s.id === params.id);
    if (!sheet) {
      return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
    }
    return NextResponse.json(sheet);
  } catch {
    return NextResponse.json({ error: "No saved data" }, { status: 404 });
  }
}
