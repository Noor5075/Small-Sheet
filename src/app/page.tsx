"use client";

import { useEffect, useCallback, useState } from "react";
import { useSheetStore } from "@/lib/store";
import { getDefaultSheets } from "@/lib/fixtures";
import { useTheme } from "@/lib/theme";
import { Grid } from "@/components/Grid";
import { FormulaBar } from "@/components/FormulaBar";
import { SheetTabs } from "@/components/SheetTabs";
import { StatusBar } from "@/components/StatusBar";
import { Toolbar } from "@/components/Toolbar";

export default function HomePage() {
  const store = useSheetStore();
  const { theme, toggleTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/sheets/all");
      if (res.ok) {
        const data = await res.json();
        if (data.sheets?.length) {
          store.loadSheets(data.sheets, data.activeSheetId);
          setReady(true);
          return;
        }
      }
    } catch {
      // fall through to fixtures
    }
    store.init(getDefaultSheets());
    setReady(true);
  }, [store]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onReset = useCallback(async () => {
    try {
      await fetch("/api/reset", { method: "POST" });
    } catch {
      /* ignore */
    }
    store.init(getDefaultSheets());
  }, [store]);

  if (loadError) {
    return (
      <div className="app">
        <div className="center-msg">
          <h2>Could not load</h2>
          <p>{loadError}</p>
          <button className="tb-btn primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!ready || !store.activeSheet) {
    return (
      <div className="app">
        <div className="center-msg">
          <h2>Loading sheet…</h2>
          <p>Preparing fixtures and grid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Toolbar
        store={store}
        onReset={onReset}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <FormulaBar store={store} />
      <div className="sheet-area">
        <Grid
          sheet={store.activeSheet}
          selection={store.selection}
          editing={store.editing}
          editValue={store.editValue}
          store={store}
        />
      </div>
      <div className="bottom-bar">
        <SheetTabs store={store} />
        <StatusBar store={store} />
      </div>
    </div>
  );
}
