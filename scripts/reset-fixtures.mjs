import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Minimal reset: delete saved data so next load uses in-code fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = join(__dirname, "..", "data", "sheets.json");

try {
  mkdirSync(join(__dirname, "..", "data"), { recursive: true });
  // Empty / remove
  writeFileSync(dataFile, JSON.stringify({ sheets: [], activeSheetId: null }));
  console.log("Fixtures reset. Run `npm run dev` and open the app — default fixtures will load.");
} catch (e) {
  console.error(e);
  process.exit(1);
}
