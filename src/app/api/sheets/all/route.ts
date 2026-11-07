import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getDefaultSheets } from "@/lib/fixtures";

const DATA_FILE = path.join(process.cwd(), "data", "sheets.json");

export async function GET() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    const sheets = getDefaultSheets();
    // Don't write on GET — only on explicit save / reset
    return NextResponse.json({
      sheets,
      activeSheetId: sheets[0]?.id ?? "budget",
    });
  }
}
