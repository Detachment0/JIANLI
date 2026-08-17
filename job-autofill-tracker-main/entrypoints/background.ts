import { analyzeJobFit, draftApplicationFromJobPosting, draftSingleAnswer, enrichProfileFromText } from "../lib/ai";
import { db } from "../lib/db";
import { createDemoApplications } from "../lib/demo";
import { RESUME_PROFILE } from "../lib/resumeData";
import { canonicalJobUrl, isFollowUpDue, localTodayISO } from "../lib/jobs";
import { deterministicValue, memoryValue, rememberAnswer } from "../lib/mapping";
import { bumpApplicationsRev, getProfile, getSettings, queuePendingApplication, removePendingApplication, setDashboardLaunch, setDueCount } from "../lib/storage";
import type { ExtensionMessage, FieldFill } from "../lib/schema";

export default defineBackground({
  main() {
    chrome.action.onClicked.addListener(() => {
      void chrome.tabs.create({ url: chrome.runtime.getURL("options.html"), active: true });
    });

    chrome.commands.onCommand.addListener((command) => {
      if (command !== "toggle-widget") return;
      void (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined) return;
        try {
          await chrome.tabs.sendMessage(tab.id, { kind: "TOGGLE_WIDGET" } satisfies ExtensionMessage);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          // The widget only exists on job pages; the shortcut is a no-op elsewhere.
          if (!detail.includes("Receiving end does not exist")) throw error;
        }
      })();
    });

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
      handleMessage(message, sender)
        .then(sendResponse)
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          sendResponse({ ok: false, error: detail });
        });
      return true;
    });

    void refreshDueBadge();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.applicationsRev || changes.settings) void refreshDueBadge();
    });
    chrome.alarms.create("dueCheck", { periodInMinutes: 60 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "dueCheck") void refreshDueBadge();
    });
  }
});

async function refreshDueBadge(): Promise<void> {
  const settings = await getSettings();
  const applications = settings.demoMode ? createDemoApplications() : await db.applications.toArray();
  const today = localTodayISO();
  const count = applications.filter((application) => isFollowUpDue(application, today)).length;
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await setDueCount(count);
}

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (message.kind === "LOG_APPLICATION") {
    if ((await getSettings()).demoMode) return { ok: true };
    await db.applications.add(message.application);
    await bumpApplicationsRev();
    return { ok: true };
  }

  if (message.kind === "QUEUE_PENDING_APPLICATION") {
    await queuePendingApplication(message.pending);
    return { ok: true };
  }

  if (message.kind === "REMOVE_PENDING_APPLICATION") {
    await removePendingApplication(message.id);
    return { ok: true };
  }

  if (message.kind === "APPLICATION_SUBMITTED") {
    if (sender.tab?.id === undefined) throw new Error("Submission events must come from a page tab.");
    await queuePendingApplication(message.pending);
    await chrome.tabs.sendMessage(sender.tab.id, { kind: "SHOW_TRACK_CONFIRM", pending: message.pending } satisfies ExtensionMessage);
    return { ok: true };
  }

  if (message.kind === "AUTOFILL_TAB") {
    console.log(`[autofill-bg] AUTOFILL_TAB received, tabId=${sender.tab?.id}, url=${sender.tab?.url}`);
    if (sender.tab?.id === undefined) throw new Error("Autofill must be requested from a page tab.");
    return await sendAutofillToTab(sender.tab.id);
  }

  if (message.kind === "AUTOFILL_ACTIVE_TAB") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error("No active page tab was found.");
    return await sendAutofillToTab(tab.id);
  }

  if (message.kind === "OPEN_WIDGET_ACTIVE_TAB") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error("No active page tab was found.");
    return await sendMessageToTabWithInjection(tab.id, { kind: "TOGGLE_WIDGET" } satisfies ExtensionMessage);
  }

  if (message.kind === "UPDATE_APPLICATION") {
    if ((await getSettings()).demoMode) return { ok: true };
    await db.applications.update(message.id, message.patch);
    await bumpApplicationsRev();
    return { ok: true };
  }

  if (message.kind === "LIST_APPLICATIONS") {
    if ((await getSettings()).demoMode) return { ok: true, applications: createDemoApplications() };
    return { ok: true, applications: await db.applications.orderBy("dateApplied").reverse().toArray() };
  }

  if (message.kind === "DELETE_APPLICATION") {
    if ((await getSettings()).demoMode) return { ok: true };
    await db.applications.delete(message.id);
    await bumpApplicationsRev();
    return { ok: true };
  }

  if (message.kind === "AI_DRAFT_APPLICATION") {
    const draft = await draftApplicationFromJobPosting(message.postingText, await getSettings());
    return { ok: true, draft };
  }

  if (message.kind === "AI_ENRICH_PROFILE") {
    const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
    const enriched = await enrichProfileFromText(message.text, profile, settings);
    return { ok: true, profile: enriched };
  }

  if (message.kind === "REMEMBER_ANSWER") {
    await rememberAnswer(message.question, message.answer, (await getSettings()).demoMode);
    return { ok: true };
  }

  if (message.kind === "INJECT_RESUME_PROFILE") {
    await chrome.storage.local.set({ profile: RESUME_PROFILE });
    return { ok: true };
  }

  if (message.kind === "CLEAR_RESUME_PROFILE") {
    await chrome.storage.local.remove("profile");
    return { ok: true };
  }

  if (message.kind === "TOGGLE_WIDGET") {
    return { ok: false, error: "Widget toggling must be sent to a page tab." };
  }

  if (message.kind === "GET_TRACKED_JOB") {
    if ((await getSettings()).demoMode) return { ok: true, tracked: undefined };
    const canonical = canonicalJobUrl(message.url);
    const applications = await db.applications.toArray();
    const found = applications.find((application) => canonicalJobUrl(application.jobUrl) === canonical);
    return { ok: true, tracked: found };
  }

  if (message.kind === "OPEN_DASHBOARD") {
    await setDashboardLaunch({
      tab: "tracker",
      pendingId: message.pendingId,
      applicationId: message.applicationId,
      createdAt: new Date().toISOString()
    });
    await chrome.tabs.create({ url: chrome.runtime.getURL("options.html"), active: true });
    return { ok: true };
  }

  if (message.kind === "AI_JOB_FIT") {
    const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
    const analysis = await analyzeJobFit(message.jobDescription, message.page, profile, settings);
    return { ok: true, analysis };
  }

  if (message.kind === "AI_DRAFT_ANSWER") {
    const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
    const answer = await draftSingleAnswer(message.question, profile, settings);
    return { ok: true, answer };
  }

  if (message.kind === "AUTOFILL_CURRENT_FORM") {
    return { ok: false, error: "Autofill must be sent to a page tab." };
  }

  if (message.kind === "PREVIEW_FILL") {
    const tabId = sender.tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId === undefined) throw new Error("No active page tab was found.");
    return await sendMessageToTabWithInjection(tabId, { kind: "PREVIEW_FILL" } satisfies ExtensionMessage);
  }

  if (message.kind === "TRACK_CURRENT_APPLICATION") {
    return { ok: false, error: "Tracking must be sent to a page tab." };
  }

  if (message.kind === "MAP_FIELDS") {
    const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
    const fills: FieldFill[] = [];
    for (const field of message.fields) {
      const deterministic = await deterministicValue(field, profile);
      if (deterministic) {
        fills.push(deterministic);
        continue;
      }

      const memory = await memoryValue(field, settings.demoMode);
      if (memory) {
        fills.push(memory);
        continue;
      }
    }
    return { ok: true, fills };
  }

  throw new Error(`Unexpected message for the background worker: ${message.kind}`);
}

async function sendAutofillToTab(tabId: number): Promise<unknown> {
  const request = { kind: "AUTOFILL_CURRENT_FORM" } satisfies ExtensionMessage;
  return await sendMessageToTabWithInjection(tabId, request);
}

async function sendMessageToTabWithInjection(tabId: number, request: ExtensionMessage): Promise<unknown> {
  console.log(`[autofill-bg] sendMessageToTabWithInjection tabId=${tabId} kind=${request.kind}`);
  const result = await tryBroadcastToAllFrames(tabId, request);
  console.log(`[autofill-bg] broadcast result received=${result.received}`);
  if (result.received) {
    console.log(`[autofill-bg] response:`, result.response);
    return result.response;
  }
  throw new Error("当前页面没有响应填充请求，请刷新页面后重试。");
}

/** 遍历 tab 的所有 frame，逐一发送消息，返回第一个有接收端的响应。 */
async function tryBroadcastToAllFrames(tabId: number, request: ExtensionMessage): Promise<{ received: boolean; response: unknown }> {
  let frames: chrome.webNavigation.GetAllFrameResultDetails[];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  } catch (err) {
    console.log(`[autofill-bg] getAllFrames failed:`, err);
    frames = [{ frameId: 0, errorOccurred: false, url: "", parentFrameId: -1 } as chrome.webNavigation.GetAllFrameResultDetails];
  }
  console.log(`[autofill-bg] frames:`, frames.map(f => ({frameId: f.frameId, url: f.url?.slice(0,80)})));

  const orderedFrameIds = [...new Set(frames.map((f) => f.frameId))]
    .sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
  console.log(`[autofill-bg] orderedFrameIds:`, orderedFrameIds);

  for (const frameId of orderedFrameIds) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, request, { frameId });
      console.log(`[autofill-bg] frame ${frameId} response:`, response);
      if (response !== undefined) return { received: true, response };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!detail.includes("Receiving end does not exist")) {
        console.error(`[autofill-bg] Frame ${frameId} send error:`, detail);
      } else {
        console.log(`[autofill-bg] Frame ${frameId} no receiver: ${detail}`);
      }
    }
  }
  console.log(`[autofill-bg] No frame responded for tabId=${tabId}`);
  return { received: false, response: undefined };
}
