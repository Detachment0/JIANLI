import { createRoot } from "react-dom/client";
import type { ExtensionMessage } from "../../lib/schema";
import type { FillResult } from "../../lib/fillResult";
import {
  fillCurrentForm,
  isAllowedJobPage,
  isTopPageWithEmbeddedJobForm,
  queueTrackCurrentApplication,
  watchSubmit
} from "./engine";
import { getProfile, getSettings } from "../../lib/storage";
import { initCardBadges } from "./cardBadges";
import ErrorBoundary from "./ErrorBoundary";
import Widget from "./Widget";
import "../../lib/design-tokens.css";
import "../../lib/primitives.css";
import "./widget.css";

export default defineContentScript({
  matches: ["https://*/*", "http://*/*"],
  allFrames: true,
  runAt: "document_idle",
  cssInjectionMode: "ui",
  async main(ctx) {
    const allowedJobPage = isAllowedJobPage();
    const isTopWithEmbedded = isTopPageWithEmbeddedJobForm();
    console.log(`[autofill-content] init, url=${location.href.slice(0,80)}, allowedJobPage=${allowedJobPage}, isTopWithEmbedded=${isTopWithEmbedded}, isTop=${window.self === window.top}`);

    // 监听器无条件注册：content script 已在所有页面加载（matches: https://*/*），
    // 若页面无表单，fillCurrentForm 返回 total=0 即可，不视为错误。
    // 历史条件 allowedJobPage || isTopWithEmbedded 会在非白名单页面（如字节跳动 jobs.bytedance.com）
    // 导致监听器不注册，Widget 发出的消息找不到接收端。
    console.log(`[autofill-content] Registering autofill listeners on frame ${window.self === window.top ? 'TOP' : 'IFRAME'}`);
    {
      chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
        console.log(`[autofill-content] Received message: kind=${message.kind}`);
        if (message.kind === "AUTOFILL_CURRENT_FORM") {
          console.log(`[autofill-content] AUTOFILL_CURRENT_FORM: calling fillCurrentForm()`);
          fillCurrentForm()
            .then((result) => {
              console.log(`[autofill-content] fillCurrentForm done: ok=${result.ok}, total=${result.summary.total}`);
              injectFillNotification(result);
              void chrome.storage.session.set({ lastFillResult: result });
              sendResponse(result);
            })
            .catch((error: unknown) => {
              const detail = error instanceof Error ? error.message : String(error);
              console.error(`[autofill-content] fillCurrentForm FAILED:`, detail);
              sendResponse({ ok: false, error: detail });
            });
          return true;
        }

        if (message.kind === "PREVIEW_FILL") {
          console.log(`[autofill-content] PREVIEW_FILL: calling fillCurrentForm(true)`);
          fillCurrentForm(true)
            .then((preview) => {
              console.log(`[autofill-content] preview done: ok=${preview.ok}, total=${preview.summary.total}`);
              injectPreviewModal(preview, sendResponse);
            })
            .catch((error: unknown) => {
              const detail = error instanceof Error ? error.message : String(error);
              console.error(`[autofill-content] preview FAILED:`, detail);
              sendResponse({ ok: false, error: detail });
            });
          return true;
        }

        if (message.kind === "TRACK_CURRENT_APPLICATION") {
          sendResponse({ ok: true, pending: queueTrackCurrentApplication() });
          return false;
        }

        return false;
      });
    }

    if (allowedJobPage) watchSubmit();

    if (window.self !== window.top) return;

    const ui = await createShadowRootUi(ctx, {
      name: "jobtracker-widget",
      position: "overlay",
      anchor: "body",
      onMount(container) {
        const root = createRoot(container);
        root.render(
          <ErrorBoundary>
            <Widget showFab={allowedJobPage} />
          </ErrorBoundary>
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      }
    });
    ui.mount();

    if (allowedJobPage && (await getSettings()).cardBadges) {
      initCardBadges(await getProfile());
    }

    // 注入浮动侧边按钮
    injectFloatingFab(ui);
  }
});

/** 注入浮动侧边按钮 */
function injectFloatingFab(_ui: any): void {
  const existing = document.getElementById("jaf-fab");
  if (existing) return;

  const fab = document.createElement("div");
  fab.id = "jaf-fab";
  fab.title = "打开求职自动填表工具";
  fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
  Object.assign(fab.style, {
    position: "fixed",
    right: "0px",
    top: "200px",
    zIndex: "2147483646",
    width: "38px",
    height: "48px",
    background: "#059669",
    color: "#fff",
    border: "none",
    borderRadius: "8px 0 0 8px",
    cursor: "grab",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    transition: "right 0.2s ease",
    fontSize: "0",
    userSelect: "none"
  } as Record<string, string | number>);
  fab.onmouseenter = () => { fab.style.right = "4px"; };
  fab.onmouseleave = () => { fab.style.right = "0px"; };

  // 拖拽
  let dragging = false;
  let startY = 0;
  let startTop = 0;
  fab.onmousedown = (e) => {
    dragging = true;
    startY = e.clientY;
    startTop = fab.offsetTop;
    fab.style.cursor = "grabbing";
    fab.style.transition = "none";
    e.preventDefault();
  };
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const newTop = Math.max(0, Math.min(window.innerHeight - 48, startTop + dy));
    fab.style.top = `${newTop}px`;
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    fab.style.cursor = "grab";
    fab.style.transition = "right 0.2s ease";
  });

  fab.onclick = () => {
    if (dragging) return;
    window.dispatchEvent(new CustomEvent("jaf-toggle-widget"));
  };
  document.body.appendChild(fab);
}

/** 注入填充结果浮动通知条 */
function injectFillNotification(result: FillResult): void {
  const { summary, moduleStats } = result;
  const existing = document.getElementById("job-autofill-notification");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.id = "job-autofill-notification";
  container.style.cssText = `
    position:fixed;bottom:20px;right:20px;z-index:2147483647;
    width:360px;max-height:480px;overflow-y:auto;
    font-family:system-ui,-apple-system,sans-serif;
    background:#fff;border:1px solid #e2e8f0;border-radius:12px;
    box-shadow:0 8px 32px rgba(0,0,0,0.15);
    padding:16px;font-size:13px;color:#1e293b;
    animation:jaf-fade-in 0.3s ease;
  `;

  // 关闭按钮
  const close = document.createElement("button");
  close.textContent = "✕";
  close.style.cssText = `
    position:absolute;top:8px;right:12px;border:none;background:none;
    font-size:16px;cursor:pointer;color:#94a3b8;padding:2px 6px;border-radius:4px;
  `;
  close.onmouseenter = () => { close.style.background = "#f1f5f9"; };
  close.onmouseleave = () => { close.style.background = "none"; };
  close.onclick = () => container.remove();
  container.appendChild(close);

  // 标题
  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;font-size:15px;margin-bottom:10px;padding-right:20px;";
  title.textContent = `📋 自动填充完成`;
  container.appendChild(title);

  // 填充率
  const rate = document.createElement("div");
  rate.style.cssText = "margin-bottom:10px;";
  rate.innerHTML = `<span style="font-size:24px;font-weight:700;color:${summary.percentage >= 60 ? "#059669" : "#d97706"};">${summary.percentage}%</span> <span style="color:#64748b;">填充率</span>`;
  container.appendChild(rate);

  // 汇总数字
  const stats = document.createElement("div");
  stats.style.cssText = "display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap;";
  stats.innerHTML = `
    <span style="background:#ecfdf5;color:#059669;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">✓ ${summary.filled} 已填充</span>
    ${summary.partial > 0 ? `<span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">⚠ ${summary.partial} 部分</span>` : ""}
    ${summary.skipped > 0 ? `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">⊘ ${summary.skipped} 跳过</span>` : ""}
    ${summary.no_match > 0 ? `<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">? ${summary.no_match} 未匹配</span>` : ""}
    ${summary.no_data > 0 ? `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">- ${summary.no_data} 无数据</span>` : ""}
  `;
  container.appendChild(stats);

  // 按模块展开
  if (moduleStats.length > 0) {
    const details = document.createElement("details");
    details.style.cssText = "margin-top:6px;";
    const detailsSummary = document.createElement("summary");
    detailsSummary.style.cssText = "cursor:pointer;font-weight:600;font-size:12px;color:#475569;padding:4px 0;";
    detailsSummary.textContent = `按模块查看 (${moduleStats.length} 个模块)`;
    details.appendChild(detailsSummary);

    for (const mod of moduleStats) {
      const modDiv = document.createElement("div");
      modDiv.style.cssText = "display:flex;justify-content:space-between;padding:4px 8px;border-radius:4px;font-size:12px;";
      modDiv.innerHTML = `<span>${mod.module}</span><span style="font-weight:600;color:${mod.filled === mod.total ? "#059669" : "#d97706"};">${mod.filled}/${mod.total}</span>`;
      details.appendChild(modDiv);
    }
    container.appendChild(details);
  }

  // 全部详情
  const allDetails = document.createElement("details");
  allDetails.style.cssText = "margin-top:6px;";
  const allSummary = document.createElement("summary");
  allSummary.style.cssText = "cursor:pointer;font-weight:600;font-size:12px;color:#475569;padding:4px 0;";
  allSummary.textContent = `全部字段 (${summary.total})`;
  allDetails.appendChild(allSummary);

  const statusLabels: Record<string, string> = { filled: "✅ 已填充", skipped: "⊘ 已跳过", no_match: "❓ 未匹配", no_data: "➖ 无数据", fill_error: "❌ 填充异常", partial: "⚠️ 部分填充", custom_component: "✋ 需手动" };
  for (const entry of result.entries) {
    const label = statusLabels[entry.status] ?? entry.status;
    const entryDiv = document.createElement("div");
    entryDiv.style.cssText = "padding:3px 8px;font-size:11px;border-bottom:1px solid #f1f5f9;display:flex;gap:4px;";
    entryDiv.innerHTML = `<span style="white-space:nowrap;">${label}</span><span style="color:#475569;flex:1;">${entry.label}</span><span style="color:#94a3b8;font-size:10px;">${entry.reason === "legal_skip" ? "法律确认" : entry.reason === "ok" ? "" : entry.reason}</span>`;
    allDetails.appendChild(entryDiv);
  }
  container.appendChild(allDetails);

  // 自动消失
  document.body.appendChild(container);
  setTimeout(() => {
    if (document.body.contains(container)) {
      container.style.transition = "opacity 0.5s";
      container.style.opacity = "0";
      setTimeout(() => { if (document.body.contains(container)) container.remove(); }, 500);
    }
  }, 8000);
}

/** 注入预览填充确认弹窗 */
function injectPreviewModal(preview: FillResult, sendResponse: (response: unknown) => void): void {
  const existing = document.getElementById("job-autofill-preview");
  if (existing) existing.remove();

  // 遮罩层
  const overlay = document.createElement("div");
  overlay.id = "job-autofill-preview";
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:2147483647;
    background:rgba(0,0,0,0.3);
    display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,sans-serif;
    animation:jaf-fade-in 0.2s ease;
  `;

  // 弹窗
  const modal = document.createElement("div");
  modal.style.cssText = `
    width:480px;max-height:90vh;overflow-y:auto;
    background:#fff;border-radius:16px;
    box-shadow:0 16px 48px rgba(0,0,0,0.2);
    padding:24px;font-size:13px;color:#1e293b;
  `;

  const { summary, moduleStats } = preview;

  // 标题
  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;font-size:17px;margin-bottom:12px;";
  title.textContent = "🔍 即将自动填充";
  modal.appendChild(title);

  // 填充率
  const rate = document.createElement("div");
  rate.style.cssText = "margin-bottom:12px;";
  rate.innerHTML = `<span style="font-size:28px;font-weight:700;color:${summary.percentage >= 60 ? "#059669" : "#d97706"};">${summary.percentage}%</span> <span style="color:#64748b;">字段将填充</span>`;
  modal.appendChild(rate);

  // 汇总数字
  const stats = document.createElement("div");
  stats.style.cssText = "display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;";
  stats.innerHTML = `
    <span style="background:#ecfdf5;color:#059669;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">✓ ${summary.filled} 已匹配</span>
    ${summary.skipped > 0 ? `<span style="background:#f1f5f9;color:#64748b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">⊘ ${summary.skipped} 跳过</span>` : ""}
    ${summary.no_match > 0 ? `<span style="background:#fef2f2;color:#dc2626;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">❓ ${summary.no_match} 未匹配</span>` : ""}
    ${summary.no_data > 0 ? `<span style="background:#f1f5f9;color:#64748b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">➖ ${summary.no_data} 无数据</span>` : ""}
  `;
  modal.appendChild(stats);

  // 按模块展示
  if (moduleStats.length > 0) {
    const moduleSection = document.createElement("div");
    moduleSection.style.cssText = "margin-bottom:14px;";
    for (const mod of moduleStats) {
      const modDiv = document.createElement("div");
      modDiv.style.cssText = "display:flex;justify-content:space-between;padding:5px 8px;border-radius:4px;font-size:12px;background:#f8fafc;margin-bottom:2px;";
      modDiv.innerHTML = `<span>${mod.module}</span><span style="font-weight:600;color:${mod.filled === mod.total ? "#059669" : "#d97706"};">${mod.filled}/${mod.total}</span>`;
      moduleSection.appendChild(modDiv);
    }
    modal.appendChild(moduleSection);
  }

  // 全部字段详情
  const allDetails = document.createElement("details");
  const allSummary = document.createElement("summary");
  allSummary.style.cssText = "cursor:pointer;font-weight:600;font-size:12px;color:#475569;padding:4px 0;";
  allSummary.textContent = `查看全部字段 (${summary.total})`;
  allDetails.appendChild(allSummary);

  const statusLabels: Record<string, string> = { filled: "✅", skipped: "⊘", no_match: "❓", no_data: "➖", fill_error: "❌", partial: "⚠️", custom_component: "✋" };
  for (const entry of preview.entries) {
    const label = statusLabels[entry.status] ?? "·";
    const entryDiv = document.createElement("div");
    entryDiv.style.cssText = "padding:3px 8px;font-size:11px;border-bottom:1px solid #f1f5f9;";
    const reason = entry.reason === "legal_skip" ? "法律确认" : entry.reason === "ok" ? entry.value : entry.reason;
    entryDiv.innerHTML = `${label} <span style="color:#475569;">${entry.label}</span> <span style="color:#94a3b8;font-size:10px;float:right;">${reason}</span>`;
    allDetails.appendChild(entryDiv);
  }
  modal.appendChild(allDetails);

  // 按钮区域
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:10px;margin-top:16px;justify-content:flex-end;";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.style.cssText = `
    padding:8px 20px;border:1px solid #e2e8f0;border-radius:8px;
    background:#fff;cursor:pointer;font-size:13px;color:#475569;
    font-weight:500;
  `;
  cancelBtn.onmouseenter = () => { cancelBtn.style.background = "#f8fafc"; };
  cancelBtn.onmouseleave = () => { cancelBtn.style.background = "#fff"; };
  cancelBtn.onclick = () => {
    overlay.remove();
    sendResponse({ ok: false, error: "用户取消了填充" });
  };
  btnRow.appendChild(cancelBtn);

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = `确认填充 (${summary.filled} 项)`;
  confirmBtn.style.cssText = `
    padding:8px 20px;border:none;border-radius:8px;
    background:#059669;color:#fff;cursor:pointer;font-size:13px;
    font-weight:600;
  `;
  confirmBtn.onmouseenter = () => { confirmBtn.style.background = "#047857"; };
  confirmBtn.onmouseleave = () => { confirmBtn.style.background = "#059669"; };
  confirmBtn.onclick = async () => {
    confirmBtn.textContent = "填充中...";
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      const result = await fillCurrentForm(false);
      injectFillNotification(result);
      void chrome.storage.session.set({ lastFillResult: result });
      overlay.remove();
      sendResponse(result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      overlay.remove();
      sendResponse({ ok: false, error: detail });
    }
  };
  btnRow.appendChild(confirmBtn);

  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}