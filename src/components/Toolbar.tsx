"use client";

import { SheetStore } from "@/lib/store";
import { Theme } from "@/lib/theme";

type Props = {
  store: SheetStore;
  onReset: () => void;
  theme: Theme;
  onToggleTheme: () => void;
};

export function Toolbar({ store, onReset, theme, onToggleTheme }: Props) {
  const { saveStatus, lastError, canUndo, canRedo } = store;

  const statusLabel =
    saveStatus === "saved"
      ? "Saved"
      : saveStatus === "saving"
        ? "Saving…"
        : saveStatus === "dirty"
          ? "Unsaved"
          : saveStatus === "failed"
            ? `Failed${lastError ? `: ${lastError}` : ""}`
            : "";

  return (
    <header className="toolbar">
      <div className="brand">
        Small <em>Sheet</em>
      </div>
      <button
        className="tb-btn"
        onClick={() => store.undo()}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        Undo
      </button>
      <button
        className="tb-btn"
        onClick={() => store.redo()}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        Redo
      </button>
      <button className="tb-btn" onClick={onReset} title="Reset fixtures">
        Reset fixtures
      </button>

      <button
        className="tb-btn theme-toggle"
        onClick={onToggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={theme === "dark"}
      >
        {theme === "dark" ? (
          <span className="theme-icon" aria-hidden="true">
            {/* sun */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </span>
        ) : (
          <span className="theme-icon" aria-hidden="true">
            {/* moon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z" />
            </svg>
          </span>
        )}
        <span className="theme-label">{theme === "dark" ? "Light" : "Dark"}</span>
      </button>

      <div
        className={`save-status ${saveStatus}`}
        role="status"
        aria-live="polite"
      >
        <span className="dot" />
        {statusLabel}
      </div>
    </header>
  );
}
