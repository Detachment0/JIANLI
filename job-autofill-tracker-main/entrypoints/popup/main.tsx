import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings } from "../../lib/storage";
import type { ExtensionMessage } from "../../lib/schema";
import type { FillResult } from "../../lib/fillResult";
import { setLocale, getLocale, t } from "../../lib/i18n";
import "../../lib/design-tokens.css";
import "../../lib/primitives.css";
import "./styles.css";

/**
 * Popup — Context-aware Job Assistant
 *
 * Instead of 6 equal-weight buttons, the popup identifies the current page
 * and prioritizes the most likely action. Secondary actions are still available
 * but visually de-emphasized.
 */

type PageContext = "job" | "other" | "unknown";

function detectPageContext(): PageContext {
  const host = location.hostname;
  const url = location.href;
  // Simple detection: known job boards
  if (
    host.includes("greenhouse.io") ||
    host.includes("lever.co") ||
    host.includes("ashbyhq.com") ||
    host.includes("linkedin.com") ||
    host.includes("indeed.com") ||
    host.includes("upwork.com") ||
    host.includes("glassdoor.com") ||
    host.includes("monster.com") ||
    host.includes("ziprecruiter.com")
  ) {
    return "job";
  }
  // Check if URL looks like a job posting
  if (url.includes("/job") || url.includes("/careers") || url.includes("/career") || url.includes("/apply")) {
    return "job";
  }
  return "other";
}

function Popup() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [lastResult, setLastResult] = useState<FillResult | null>(null);
  const [pageContext, setPageContext] = useState<PageContext>("unknown");
  const [lang, setLang] = useState(getLocale());

  useEffect(() => {
    void getSettings().then((settings) => {
      document.documentElement.dataset.theme = settings.theme;
    });
    void chrome.storage.session.get("lastFillResult").then((data) => {
      if (data.lastFillResult) setLastResult(data.lastFillResult as FillResult);
    });
    // Detect page context from the active tab
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      if (tab?.url) {
        try {
          const url = new URL(tab.url);
          setPageContext(detectPageContext());
        } catch {
          setPageContext("unknown");
        }
      } else {
        setPageContext("unknown");
      }
    });
  }, []);

  const toggleLang = () => {
    const next = lang === "zh-CN" ? "en" : "zh-CN";
    setLang(next);
    setLocale(next);
  };

  async function autofill() {
    setBusy(true);
    setStatus("");
    try {
      const response = await chrome.runtime.sendMessage({ kind: "AUTOFILL_ACTIVE_TAB" } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? t("popup.autofill"));
      const result = response as FillResult;
      setLastResult(result);
      const { summary } = result;
      const parts = [`${summary.filled}/${summary.total} ${t("fill.completed")} (${summary.percentage}%)`];
      if (summary.skipped > 0) parts.push(`${summary.skipped} ${t("fill.skipped")}`);
      if (summary.no_data > 0) parts.push(`${summary.no_data} ${t("fill.couldNotComplete")}`);
      if (summary.no_match > 0) parts.push(`${summary.no_match} ${t("common.error")}`);
      setStatus(parts.join(" · "));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function previewFill() {
    setBusy(true);
    setStatus("");
    try {
      const response = await chrome.runtime.sendMessage({ kind: "PREVIEW_FILL" } satisfies ExtensionMessage);
      if (!response?.ok && response?.error !== "用户取消了填充") throw new Error(response?.error ?? t("popup.preview"));
      if (response?.ok) {
        const result = response as FillResult;
        setLastResult(result);
        setStatus(`${t("fill.completed")}: ${result.summary.filled}/${result.summary.total}`);
      } else {
        setStatus("Preview cancelled");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function openDashboard() {
    setStatus("");
    const response = await chrome.runtime.sendMessage({ kind: "OPEN_DASHBOARD" } satisfies ExtensionMessage);
    if (!response?.ok) {
      setStatus(response?.error ?? "Failed to open dashboard");
      return;
    }
    window.close();
  }

  async function openWidget() {
    setBusy(true);
    setStatus("");
    try {
      const response = await chrome.runtime.sendMessage({ kind: "OPEN_WIDGET_ACTIVE_TAB" } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "Failed to open widget");
      window.close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  function showLastResult() {
    if (!lastResult) { setStatus(t("popup.noResult")); return; }
    const { summary, moduleStats } = lastResult;
    const lines = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ` ${t("popup.lastResult")}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ` ${t("fill.percentage", { percentage: summary.percentage })}`,
      ` ✅ ${t("fill.completed")}: ${summary.filled}`,
    ];
    if (summary.partial > 0) lines.push(` ⚠️ Partial: ${summary.partial}`);
    if (summary.skipped > 0) lines.push(` ⊘ ${t("fill.skipped")}: ${summary.skipped}`);
    if (summary.no_match > 0) lines.push(` ❓ Unmatched: ${summary.no_match}`);
    if (summary.no_data > 0) lines.push(` ➖ No data: ${summary.no_data}`);
    lines.push(` ───────────────────────────────`);
    lines.push(` By module:`);
    for (const mod of moduleStats) {
      lines.push(`   ${mod.module}: ${mod.filled}/${mod.total}`);
    }
    const un = lastResult.entries.filter((e) => e.status !== "filled");
    if (un.length > 0) {
      lines.push(` Pending fields:`);
      for (const e of un.slice(0, 10)) {
        const reason = e.reason === "legal_skip" ? "Legal confirmation" : e.reason === "no_data" ? "No data" : e.reason === "no_match" ? "No match" : e.reason;
        lines.push(`   ${e.label}: ${reason}`);
      }
      if (un.length > 10) lines.push(`   ... and ${un.length - 10} more`);
    }
    setStatus(lines.join("\n"));
  }

  // Determine primary action
  const isJobPage = pageContext === "job";

  return (
    <main className="jat popup">
      <header className="popup-header">
        <div className="popup-title">
          <span className="popup-logo">JT</span>
          <div>
            <p className="text-caption text-secondary">{t("popup.title")}</p>
            <h1 className="text-title fw-semibold">{t("popup.subtitle")}</h1>
          </div>
        </div>
        <button
          className="lang-toggle"
          onClick={toggleLang}
          title={lang === "zh-CN" ? "Switch to English" : "切换到中文"}
          aria-label="Toggle language"
        >
          {lang === "zh-CN" ? "EN" : "中"}
        </button>
      </header>

      {/* Primary action — context-aware */}
      <section className="popup-primary">
        {isJobPage ? (
          <button className="btn btn-primary btn-lg popup-primary-btn" onClick={() => void autofill()} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            {busy ? t("popup.autofill.busy") : t("popup.autofill")}
          </button>
        ) : (
          <button className="btn btn-primary btn-lg popup-primary-btn" onClick={() => void openWidget()} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            {t("popup.widget")}
          </button>
        )}
        <p className="text-caption text-secondary popup-hint">
          {isJobPage ? t("popup.autofill.desc") : t("popup.widget.desc")}
        </p>
      </section>

      {/* Secondary actions */}
      <div className="divider" />

      <section className="popup-secondary">
        {isJobPage && (
          <button className="btn btn-ghost btn-sm" onClick={() => void previewFill()} disabled={busy}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {t("popup.preview")}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => void openDashboard()} disabled={busy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          {t("popup.dashboard")}
        </button>
        {!isJobPage && (
          <button className="btn btn-ghost btn-sm" onClick={() => void autofill()} disabled={busy}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            {t("popup.autofill")}
          </button>
        )}
      </section>

      {/* Last result (if available) */}
      {lastResult && (
        <>
          <div className="divider" />
          <section className="popup-secondary">
            <button className="btn btn-ghost btn-sm" onClick={showLastResult} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              {t("popup.lastResult")} ({lastResult.summary.filled}/{lastResult.summary.total})
            </button>
          </section>
        </>
      )}

      {status && <p className="popup-status text-caption" role="status" style={{ whiteSpace: "pre-line" }}>{status}</p>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);