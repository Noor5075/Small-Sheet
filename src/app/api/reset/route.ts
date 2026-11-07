import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getDefaultSheets } from "@/lib/fixtures";

const DATA_FILE = path.join(process.cwd(), "data", "sheets.json");

export async function POST() {
  const sheets = getDefaultSheets();
  const payload = {
    sheets,
    activeSheetId: sheets[0]?.id ?? "budget",
  };
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch {
    /* ignore write errors on reset */
  }
  return NextResponse.json(payload);
}
