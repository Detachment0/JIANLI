import { useCallback, useEffect, useRef, useState } from "react";
import { scoreAffinity, type AffinityResult } from "../../lib/affinity";
import type { JobFitAnalysis, JobPostingDraft } from "../../lib/ai";
import { isJobDetailUrl } from "../../lib/jobs";
import { getDueCount, getProfile, getSettings, saveProfile } from "../../lib/storage";
import { changeUpworkStatus, UPWORK_PROPOSAL_STATUSES } from "../../lib/upwork";
import type { FillResult } from "../../lib/fillResult";
import { t } from "../../lib/i18n";
import {
  type Application,
  type ExtensionMessage,
  type PageContext,
  type PendingApplication,
  type Profile,
  type Settings,
  type TrackingEntryMode,
  type UpworkProposalDetails,
  type UpworkProposalStatus
} from "../../lib/schema";
import { buildCurrentApplication, extractJobDescription, extractUpworkProposalDetails, getPageContext, hasJobDescriptionSurface } from "./engine";
import ProfileTab from "./ProfileTab";
import TrackerTab from "./TrackerTab";

type JobState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "scored"; affinity: AffinityResult }
  | { phase: "error"; message: string };

type TabId = "match" | "autofill" | "answer" | "upwork" | "tracker" | "profile";

const JOB_DESCRIPTION_TIMEOUT_MS = 10_000;

const TAB_LABELS: Record<TabId, string> = {
  match: "匹配",
  autofill: "自动填表",
  answer: "答案",
  upwork: "Upwork",
  tracker: "跟踪器",
  profile: "资料"
};

export default function Widget({ showFab = true }: { showFab?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>();
  const [settings, setSettings] = useState<Settings>();
  const [url, setUrl] = useState(location.href);
  const [page, setPage] = useState<PageContext>();
  const [job, setJob] = useState<JobState>({ phase: "idle" });
  const [tracked, setTracked] = useState<Application>();
  const [trackNotice, setTrackNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [trackFormOpen, setTrackFormOpen] = useState(false);
  const [trackEntryMode, setTrackEntryMode] = useState<TrackingEntryMode>("manual");
  const [postingText, setPostingText] = useState("");
  const [trackDraft, setTrackDraft] = useState<Application>();
  const [readingPosting, setReadingPosting] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingApplication>();
  const [activeTab, setActiveTab] = useState<TabId>("autofill");
  const [dueCount, setDueCount] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState("");

  const isDetail = isJobDetailUrl(url);
  const isUpwork = location.hostname.includes("upwork.com");
  const tabs: TabId[] = [
    ...(isDetail ? (["match"] as const) : []),
    "autofill",
    "answer",
    ...(isUpwork ? (["upwork"] as const) : []),
    "tracker",
    "profile"
  ];

  useEffect(() => {
    void getProfile().then(setProfile);
    void getSettings().then(setSettings);
    void getDueCount().then(setDueCount);
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (changes.profile || changes.settings) {
        void getProfile().then(setProfile);
        void getSettings().then(setSettings);
      }
      if (changes.dueCount) setDueCount((changes.dueCount.newValue as number | undefined) ?? 0);
    };
    chrome.storage.onChanged.addListener(onStorage);
    // SPA navigation (LinkedIn/Indeed/Upwork) never reloads the page, so poll the URL.
    const urlWatcher = window.setInterval(() => {
      setUrl((current) => (current === location.href ? current : location.href));
    }, 1000);
    const onMessage = (message: ExtensionMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
      if (message.kind === "SHOW_TRACK_CONFIRM") {
        setPendingConfirm(message.pending);
        setOpen(true);
        sendResponse({ ok: true });
      }
      if (message.kind === "TOGGLE_WIDGET") {
        setOpen((value) => !value);
        sendResponse({ ok: true });
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(onMessage);
    const onToggleWidget = () => setOpen((v) => !v);
    window.addEventListener("jaf-toggle-widget", onToggleWidget);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
      window.removeEventListener("jaf-toggle-widget", onToggleWidget);
      window.clearInterval(urlWatcher);
    };
  }, []);

  useEffect(() => {
    setTrackNotice("");
    setActiveTab(isJobDetailUrl(url) ? "match" : "autofill");
    if (!profile) return;
    if (!isJobDetailUrl(url)) {
      setPage(getPageContext());
      setJob({ phase: "idle" });
      return;
    }
    setJob({ phase: "loading" });
    let cancelled = false;
    let timer = 0;
    const startedAt = Date.now();
    const attempt = () => {
      if (cancelled) return;
      if (hasJobDescriptionSurface()) {
        setPage(getPageContext());
        setJob({ phase: "scored", affinity: scoreAffinity(profile, extractJobDescription()) });
        return;
      }
      if (Date.now() - startedAt >= JOB_DESCRIPTION_TIMEOUT_MS) {
        setPage(getPageContext());
        setJob({ phase: "error", message: "无法读取此页面的职位描述。" });
        return;
      }
      timer = window.setTimeout(attempt, 500);
    };
    timer = window.setTimeout(attempt, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url, profile]);

  useEffect(() => {
    setTrackFormOpen(false);
    setPostingText("");
    setTrackDraft(undefined);
  }, [url]);

  useEffect(() => {
    setTracked(undefined);
    let cancelled = false;
    void chrome.runtime
      .sendMessage({ kind: "GET_TRACKED_JOB", url } satisfies ExtensionMessage)
      .then((response) => {
        if (!cancelled && response?.ok) setTracked(response.tracked);
      });
    return () => {
      cancelled = true;
    };
  }, [url, open]);

  const readPosting = useCallback(async () => {
    setReadingPosting(true);
    setTrackNotice("");
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "AI_DRAFT_APPLICATION",
        postingText
      } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "AI 无法读取职位文本。");
      const draft = response.draft as JobPostingDraft;
      setTrackDraft({
        company: draft.company,
        role: draft.role,
        jobUrl: draft.jobUrl,
        source: draft.source,
        dateApplied: new Date().toISOString(),
        status: "Applied",
        location: draft.location,
        workMode: draft.workMode,
        compensation: draft.compensation,
        jobDescription: draft.jobDescription,
        answersUsed: [],
        notes: "",
        upwork: draft.upwork
      });
      setTrackNotice("AI 已填充跟踪器字段。保存前请检查。");
    } catch (error) {
      setTrackNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setReadingPosting(false);
    }
  }, [postingText]);

  const trackJob = useCallback(async () => {
    if (!trackDraft) return;
    if (!trackDraft.company.trim() || !trackDraft.role.trim()) {
      setTrackNotice("公司和职位为必填项。");
      return;
    }
    setSaving(true);
    setTrackNotice("");
    try {
      const application = { ...trackDraft, status: "Applied" as const };
      const response = await chrome.runtime.sendMessage({ kind: "LOG_APPLICATION", application } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "跟踪失败。");
      if (settings?.demoMode) {
        setTrackNotice("演示模式：未保存。");
      } else {
        setTracked(application);
        setTrackFormOpen(false);
        setPostingText("");
        setTrackDraft(undefined);
        setTrackNotice("已跟踪为「已申请」。");
      }
    } catch (error) {
      setTrackNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [settings, trackDraft]);

  const openTrackForm = () => {
    const mode = settings?.trackingEntryMode ?? "manual";
    setTrackEntryMode(mode);
    setPostingText("");
    setTrackDraft(mode === "manual" ? emptyTrackingApplication() : undefined);
    setTrackNotice("");
    setTrackFormOpen(true);
  };

  const changeTrackEntryMode = (mode: TrackingEntryMode) => {
    setTrackEntryMode(mode);
    setPostingText("");
    setTrackDraft(mode === "manual" ? emptyTrackingApplication() : undefined);
    setTrackNotice("");
  };

  const openDashboard = (applicationId?: number) => {
    void chrome.runtime.sendMessage({ kind: "OPEN_DASHBOARD", applicationId } satisfies ExtensionMessage);
  };

  const addSkill = useCallback(
    async (term: string) => {
      if (!profile) return;
      try {
        await saveProfile({ ...profile, skills: { ...profile.skills, [term]: { years: 0, note: "" } } });
        setTrackNotice(`"${term}" 已添加到你的个人资料技能中。`);
      } catch (error) {
        setTrackNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [profile]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // ===== 操作按钮处理（与 Popup 一致） =====
  const actionMessages: Record<string, ExtensionMessage> = {
    AUTOFILL_TAB: { kind: "AUTOFILL_TAB" },
    INJECT_RESUME_PROFILE: { kind: "INJECT_RESUME_PROFILE" },
    CLEAR_RESUME_PROFILE: { kind: "CLEAR_RESUME_PROFILE" },
  };

  const doAction = async (kind: string) => {
    setActionBusy(true);
    setActionStatus("");
    try {
      const msg = actionMessages[kind];
      if (!msg) throw new Error(`未知操作: ${kind}`);
      const response = await chrome.runtime.sendMessage(msg);
      if (!response?.ok) throw new Error(response?.error ?? "操作失败。");
      if (kind === "AUTOFILL_TAB") {
        const r = response as FillResult;
        const parts = [`${r.summary.filled}/${r.summary.total} 已填充 (${r.summary.percentage}%)`];
        if (r.summary.skipped > 0) parts.push(`${r.summary.skipped} 跳过`);
        if (r.summary.no_data > 0) parts.push(`${r.summary.no_data} 无数据`);
        if (r.summary.no_match > 0) parts.push(`${r.summary.no_match} 未匹配`);
        setActionStatus(parts.join(" · "));
      } else if (kind === "INJECT_RESUME_PROFILE") {
        setActionStatus("简历已注入，可开始自动填充。");
      } else if (kind === "CLEAR_RESUME_PROFILE") {
        setActionStatus("简历数据已清除。");
      }
    } catch (caught) {
      setActionStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setActionBusy(false);
    }
  };

  const doPreview = async () => {
    setActionBusy(true);
    setActionStatus("");
    try {
      const response = await chrome.runtime.sendMessage({ kind: "PREVIEW_FILL" } satisfies ExtensionMessage);
      if (!response?.ok && response?.error !== "用户取消了填充") throw new Error(response?.error ?? "预览填充失败。");
      if (response?.ok) {
        const r = response as FillResult;
        setActionStatus(`填充完成: ${r.summary.filled}/${r.summary.total} 已填充`);
      } else {
        setActionStatus("预览已取消");
      }
    } catch (caught) {
      setActionStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setActionBusy(false);
    }
  };

  const theme = settings?.theme ?? "light";
  const score = job.phase === "scored" && job.affinity.jobTermCount > 0 ? job.affinity.score : undefined;

  return (
    <div className="jtRoot jat" data-theme={theme}>
      {open && (
        <section className="jtDrawer">
          <header className="jtHeader">
            <div>
              <p className="jtKicker">{page?.source ?? "职位页面"}</p>
              <h1 className="jtTitle">{page?.role ?? "当前页面"}</h1>
              {page?.company && <p className="jtCompany">{page.company}</p>}
            </div>
            <button className="jtIconButton" onClick={() => setOpen(false)} aria-label={t("widget.close")}>
              ✕
            </button>
          </header>
          {settings?.demoMode && <p className="jtDemoBadge">{t("widget.demoMode")}</p>}
          {pendingConfirm ? (
            <div className="jtDrawerBody">
              <TrackConfirm
                pending={pendingConfirm}
                demoMode={settings?.demoMode ?? false}
                defaultMode={settings?.trackingEntryMode ?? "manual"}
                onDone={(application, notice) => {
                  setPendingConfirm(undefined);
                  if (application) setTracked(application);
                  setTrackNotice(notice);
                }}
              />
            </div>
          ) : (
            <>
              {/* 顶部主操作入口：填充 / 预览 / 进入控制台 */}
              <div className="jtPrimaryActions">
                <button className="jtButton" onClick={() => void doAction("AUTOFILL_TAB")} disabled={actionBusy}>
                  {t("widget.primaryFill")}
                </button>
                <button className="jtButton jtButtonGhost" onClick={() => void doPreview()} disabled={actionBusy}>
                  {t("widget.primaryPreview")}
                </button>
                <button className="jtButton jtButtonGhost" onClick={() => openDashboard()} disabled={actionBusy}>
                  {t("widget.primaryDashboard")}
                </button>
              </div>

              {/* 状态驱动的主要操作区域 */}
              <div className="drawer-state">
                {actionStatus && <p className="state-action-status">{actionStatus}</p>}
                {job.phase === "loading" && (
                  <div className="state-card">
                    <span className="text-secondary">{t("widget.scanning")}</span>
                  </div>
                )}
                {job.phase === "error" && (
                  <div className="state-card">
                    <span className="text-secondary">{job.message}</span>
                  </div>
                )}
                {job.phase === "scored" && isDetail && score !== undefined && (
                  <div className="state-card">
                    <span className="state-score">{score}</span>
                    <span className="text-secondary">{t("widget.matchScore")}</span>
                  </div>
                )}
                {tracked && !trackFormOpen && !pendingConfirm && (
                  <div className="state-card">
                    <span className="state-tracked">{t("widget.tracked")}: {tracked.status}</span>
                  </div>
                )}
                {!tracked && trackFormOpen && !pendingConfirm && (
                  <div className="state-card">
                    <span className="text-secondary">{t("widget.trackThisJob")}</span>
                  </div>
                )}
                {job.phase === "idle" && !isDetail && !tracked && !trackFormOpen && !pendingConfirm && (
                  <div className="state-card">
                    <span className="text-secondary">{t("widget.ready")}</span>
                  </div>
                )}
              </div>

              {/* 紧凑导航 Tabs */}
              <nav className="drawer-nav">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    className={`btn btn-ghost btn-sm${tab === activeTab ? " btn-tab-active" : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </nav>

              <div className="jtDrawerBody">
                {activeTab === "match" && (
                  <>
                    {job.phase === "loading" && <p className="jtMuted">正在读取职位描述...</p>}
                    {job.phase === "error" && <p className="jtError">{job.message}</p>}
                    {job.phase === "scored" && page && (
                      <MatchTab affinity={job.affinity} page={page} url={url} onAddSkill={(term) => void addSkill(term)} />
                    )}
                  </>
                )}
                {activeTab === "autofill" && <AutofillTab />}
                {activeTab === "answer" && <AnswerTab />}
                {activeTab === "upwork" && (
                  <UpworkTab
                    url={url}
                    tracked={tracked}
                    demoMode={settings?.demoMode ?? false}
                    onTracked={setTracked}
                    onPatched={(patch) => setTracked((current) => (current ? { ...current, ...patch } : current))}
                  />
                )}
                {activeTab === "tracker" && <TrackerTab demoMode={settings?.demoMode ?? false} onOpenDashboard={openDashboard} />}
                {activeTab === "profile" && <ProfileTab demoMode={settings?.demoMode ?? false} onOpenDashboard={openDashboard} />}
              </div>
              <footer className="jtDrawerFooter">
                {!tracked && trackFormOpen && (
                  <div className="jtTrackForm">
                    <TrackingModeSwitch mode={trackEntryMode} onChange={changeTrackEntryMode} />
                    {trackEntryMode === "ai" && !trackDraft ? (
                      <>
                        <label htmlFor="jt-job-posting">供 AI 处理的职位文本</label>
                        <textarea
                          id="jt-job-posting"
                          value={postingText}
                          onChange={(event) => setPostingText(event.target.value)}
                          placeholder="粘贴职位信息或任何你希望 AI 用来填充跟踪器的文本。"
                          rows={5}
                          autoFocus
                        />
                        <p>只有此粘贴的文本会发送给 AI。不会自动读取当前页面的任何内容。</p>
                      </>
                    ) : trackDraft ? (
                      <TrackDraftForm draft={trackDraft} mode={trackEntryMode} onChange={setTrackDraft} />
                    ) : null}
                  </div>
                )}
                <div className="jtFooter">
                  {activeTab === "tracker" ? (
                    <p className="jtTracked">正在编辑跟踪的职位</p>
                  ) : tracked ? (
                    <p className="jtTracked">已跟踪：{tracked.status}</p>
                  ) : trackFormOpen ? (
                    <>
                      <button
                        className="jtButton"
                        onClick={() => void (trackDraft ? trackJob() : readPosting())}
                        disabled={saving || readingPosting || (!trackDraft && !postingText.trim())}
                      >
                        {saving ? "正在保存..." : readingPosting ? "正在使用 AI 读取..." : trackDraft ? "保存为已申请" : "使用 AI 填充跟踪器"}
                      </button>
                      <button
                        className="jtButtonGhost"
                        onClick={() => {
                          if (trackEntryMode === "ai" && trackDraft) {
                            setTrackDraft(undefined);
                            setTrackNotice("");
                          } else {
                            setTrackFormOpen(false);
                          }
                        }}
                        disabled={saving || readingPosting}
                      >
                        {trackEntryMode === "ai" && trackDraft ? "返回" : t("common.cancel")}
                      </button>
                    </>
                  ) : (
                    <button className="jtButton" onClick={openTrackForm}>
                      {t("widget.trackThisJob")}
                    </button>
                  )}
                  <button className="jtButtonGhost" onClick={() => openDashboard()}>
                    {t("widget.openDashboard")}
                  </button>
                </div>
                {trackNotice && <p className="jtNotice">{trackNotice}</p>}
              </footer>
            </>
          )}
        </section>
      )}
      {!open && showFab && (
        <button className={fabClass(score)} onClick={() => setOpen(true)} title="求职自动填表 + 跟踪器">
          {score !== undefined ? score : "JT"}
          {dueCount > 0 && <span className="jtFabDot" title={`${dueCount} 个跟进待办`} />}
        </button>
      )}
    </div>
  );
}

function fabClass(score: number | undefined): string {
  if (score === undefined) return "jtFab";
  if (score >= 70) return "jtFab jtFabHigh";
  if (score >= 40) return "jtFab jtFabMid";
  return "jtFab jtFabLow";
}

function MatchTab({
  affinity,
  page,
  url,
  onAddSkill
}: {
  affinity: AffinityResult;
  page: PageContext;
  url: string;
  onAddSkill: (term: string) => void;
}) {
  const [analysis, setAnalysis] = useState<JobFitAnalysis>();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    setAnalysis(undefined);
    setAnalysisError("");
  }, [url]);

  const runDeepAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const request: ExtensionMessage = { kind: "AI_JOB_FIT", jobDescription: extractJobDescription(), page };
      const response = await chrome.runtime.sendMessage(request);
      if (!response?.ok) throw new Error(response?.error ?? "分析失败。");
      setAnalysis(response.analysis as JobFitAnalysis);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : String(error));
    } finally {
      setAnalyzing(false);
    }
  };

  if (affinity.jobTermCount === 0) {
    return <p className="jtMuted">在此职位描述中未找到可识别的技能。</p>;
  }
  const coveredCount = affinity.jobTermCount - affinity.missing.length;
  return (
    <div className="jtMatch">
      <div className="jtScoreRow">
        <span className="jtScore">{affinity.score}</span>
        <span className="jtScoreLabel">
          {coveredCount}/{affinity.jobTermCount} 个技能匹配
        </span>
      </div>
      {affinity.matched.length > 0 && (
        <div className="jtChipGroup">
          <p className="jtChipHeading">你的匹配技能</p>
          <div className="jtChips">
            {affinity.matched.map((item) => (
              <span key={item.term} className="jtChip jtChipMatched" title={item.source}>
                {item.term}
              </span>
            ))}
          </div>
        </div>
      )}
      {affinity.missing.length > 0 && (
        <div className="jtChipGroup">
          <p className="jtChipHeading">缺少的关键词 - 点击添加到个人资料</p>
          <div className="jtChips">
            {affinity.missing.map((term) => (
              <button
                key={term}
                className="jtChip jtChipMissing jtChipAdd"
                title={`将"${term}"添加到个人资料技能`}
                onClick={() => onAddSkill(term)}
              >
                + {term}
              </button>
            ))}
          </div>
        </div>
      )}
      <button className="jtButtonGhost" onClick={() => void runDeepAnalysis()} disabled={analyzing}>
        {analyzing ? t("widget.analyzing") : t("widget.deepAnalysis")}
      </button>
      {analysisError && <p className="jtError">{analysisError}</p>}
      {analysis && (
        <div className="jtAnalysis">
          <div className="jtScoreRow">
            <span className="jtScore">{analysis.score}</span>
            <span className="jtScoreLabel">AI 匹配分数</span>
          </div>
          <p className="jtAnalysisText">{analysis.verdict}</p>
          {analysis.strengths.length > 0 && (
            <div className="jtChipGroup">
              <p className="jtChipHeading">优势</p>
              <ul className="jtList">
                {analysis.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.gaps.length > 0 && (
            <div className="jtChipGroup">
              <p className="jtChipHeading">差距</p>
              <ul className="jtList">
                {analysis.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="jtChipGroup">
            <p className="jtChipHeading">推荐角度</p>
            <p className="jtAnalysisText">{analysis.pitchAngle}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function emptyTrackingApplication(): Application {
  return {
    company: "",
    role: "",
    jobUrl: "",
    source: "Manual",
    dateApplied: new Date().toISOString(),
    status: "Applied",
    location: "",
    workMode: "",
    jobDescription: "",
    answersUsed: [],
    notes: ""
  };
}

function TrackingModeSwitch({ mode, onChange }: { mode: TrackingEntryMode; onChange: (mode: TrackingEntryMode) => void }) {
  return (
    <div className="jtModeSwitch" aria-label="跟踪录入模式">
      <button type="button" className={mode === "manual" ? "jtModeActive" : ""} aria-pressed={mode === "manual"} onClick={() => onChange("manual")}>
        手动
      </button>
      <button type="button" className={mode === "ai" ? "jtModeActive" : ""} aria-pressed={mode === "ai"} onClick={() => onChange("ai")}>
        AI 粘贴
      </button>
    </div>
  );
}

function TrackDraftForm({ draft, mode, onChange }: { draft: Application; mode: TrackingEntryMode; onChange: (draft: Application) => void }) {
  const update = (patch: Partial<Application>) => onChange({ ...draft, ...patch });
  return (
    <div className="jtTrackReview">
      <div>
        <p className="jtKicker">{mode === "ai" ? "AI 草稿" : "手动录入"}</p>
        <strong>保存为「已申请」前请检查</strong>
      </div>
      <div className="jtGrid2">
        <label className="jtField">
          <span>公司</span>
          <input value={draft.company} onChange={(event) => update({ company: event.target.value })} />
        </label>
        <label className="jtField">
          <span>职位</span>
          <input value={draft.role} onChange={(event) => update({ role: event.target.value })} />
        </label>
      </div>
      <div className="jtGrid2">
        <label className="jtField">
          <span>来源</span>
          <input value={draft.source} onChange={(event) => update({ source: event.target.value })} />
        </label>
        <label className="jtField">
          <span>工作模式</span>
          <select value={draft.workMode ?? ""} onChange={(event) => update({ workMode: event.target.value as Application["workMode"] })}>
            <option value="">未设置</option>
            <option value="Remote">远程</option>
            <option value="Hybrid">混合</option>
            <option value="On-site">现场</option>
          </select>
        </label>
      </div>
      <label className="jtField">
        <span>地点</span>
        <input value={draft.location ?? ""} onChange={(event) => update({ location: event.target.value })} />
      </label>
      <label className="jtField">
        <span>薪酬</span>
        <input
          value={draft.compensation?.text ?? ""}
          onChange={(event) => update({
            compensation: {
              text: event.target.value,
              currency: draft.compensation?.currency ?? "",
              min: draft.compensation?.min,
              max: draft.compensation?.max,
              period: draft.compensation?.period ?? ""
            }
          })}
        />
      </label>
      <label className="jtField">
        <span>职位链接</span>
        <input value={draft.jobUrl} onChange={(event) => update({ jobUrl: event.target.value })} />
      </label>
    </div>
  );
}

function AutofillTab() {
  return (
    <div className="jtMatch">
      <p className="jtMuted">使用状态栏中的按钮进行自动填充操作。"自动填充当前页面"将覆盖所有字段，"预览填充"可先查看再确认。</p>
    </div>
  );
}

function AnswerTab() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const draft = async () => {
    setBusy(true);
    setError("");
    setCopied(false);
    setSaved(false);
    try {
      const response = await chrome.runtime.sendMessage({ kind: "AI_DRAFT_ANSWER", question } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "草拟失败。");
      setAnswer(response.answer as string);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(answer);
    setCopied(true);
  };

  // The original draft is auto-saved by the background; this persists edits.
  const save = async () => {
    setError("");
    try {
      const response = await chrome.runtime.sendMessage({ kind: "REMEMBER_ANSWER", question, answer } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "保存失败。");
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="jtMatch">
      <textarea
        className="jtTextarea"
        rows={4}
        placeholder={t("widget.answerPlaceholder")}
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          setSaved(false);
        }}
      />
      <button className="jtButton" onClick={() => void draft()} disabled={busy || !question.trim()}>
        {busy ? "正在草拟..." : t("widget.draftAnswer")}
      </button>
      {error && <p className="jtError">{error}</p>}
      {answer && (
        <>
          <textarea
            className="jtTextarea"
            rows={6}
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value);
              setSaved(false);
            }}
          />
          <div className="jtFooter">
            <button className="jtButtonGhost" onClick={() => void copy()}>
              {copied ? t("widget.copied") : t("widget.copyAnswer")}
            </button>
            <button className="jtButtonGhost" onClick={() => void save()} disabled={saved || !question.trim() || !answer.trim()}>
              {saved ? t("widget.saved") : t("widget.saveAnswer")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UpworkTab({
  url,
  tracked,
  demoMode,
  onTracked,
  onPatched
}: {
  url: string;
  tracked: Application | undefined;
  demoMode: boolean;
  onTracked: (application: Application) => void;
  onPatched: (patch: Partial<Application>) => void;
}) {
  const [details, setDetails] = useState<UpworkProposalDetails>(() => extractUpworkProposalDetails());
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const touchedRef = useRef(false);

  const editDetails = (next: UpworkProposalDetails) => {
    touchedRef.current = true;
    setDetails(next);
  };

  // The find-work slider loads its content asynchronously, so a one-shot extract
  // often runs before the Connects text exists. Retry until a signal field shows
  // up, but never overwrite fields once the user has edited them.
  useEffect(() => {
    touchedRef.current = false;
    setNotice("");
    let cancelled = false;
    let timer = 0;
    const startedAt = Date.now();
    const attempt = () => {
      if (cancelled || touchedRef.current) return;
      const extracted = extractUpworkProposalDetails();
      setDetails(extracted);
      if (extracted.baseConnects != null || extracted.contractType !== "") return;
      if (Date.now() - startedAt >= 5_000) return;
      timer = window.setTimeout(attempt, 500);
    };
    attempt();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url]);

  const totalConnects = (details.baseConnects ?? 0) + (details.boostCharged ?? details.boostBid ?? 0);

  const trackProposal = async () => {
    setBusy(true);
    setNotice("");
    try {
      const application: Application = { ...buildCurrentApplication("Applied"), upwork: details };
      const response = await chrome.runtime.sendMessage({ kind: "LOG_APPLICATION", application } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "跟踪失败。");
      if (demoMode) {
        setNotice("演示模式：未保存。");
      } else {
        onTracked(application);
        setNotice("提案已保存到跟踪器。");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: UpworkProposalStatus) => {
    if (!tracked?.id) return;
    setNotice("");
    try {
      const patch = changeUpworkStatus(tracked, status);
      const response = await chrome.runtime.sendMessage({ kind: "UPDATE_APPLICATION", id: tracked.id, patch } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "状态更新失败。");
      onPatched(patch);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="jtMatch">
      <p className="jtChipHeading">提案详情</p>
      <p className="jtMuted">合同类型：{details.contractType || "未知"}</p>
      <NumberField label="出价" value={details.proposedAmount} onChange={(value) => editDetails({ ...details, proposedAmount: value })} />
      <NumberField label="基础 Connects" value={details.baseConnects} onChange={(value) => editDetails({ ...details, baseConnects: value })} />
      <NumberField label="提升出价" value={details.boostBid} onChange={(value) => editDetails({ ...details, boostBid: value })} />
      <NumberField label="提升收费" value={details.boostCharged} onChange={(value) => editDetails({ ...details, boostCharged: value })} />
      <p className="jtMuted">总 Connects：{totalConnects}</p>
      {tracked?.upwork && tracked.id ? (
        <label className="jtField">
          <span>提案状态</span>
          <select
            value={tracked.upwork.status}
            onChange={(event) => void changeStatus(event.target.value as UpworkProposalStatus)}
          >
            {UPWORK_PROPOSAL_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
      ) : (
        <button className="jtButton" onClick={() => void trackProposal()} disabled={busy}>
          {busy ? "正在保存..." : "跟踪提案"}
        </button>
      )}
      {notice && <p className="jtNotice">{notice}</p>}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (value: number | null) => void }) {
  return (
    <label className="jtField">
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    </label>
  );
}

function TrackConfirm({
  pending,
  demoMode,
  defaultMode,
  onDone
}: {
  pending: PendingApplication;
  demoMode: boolean;
  defaultMode: TrackingEntryMode;
  onDone: (application: Application | undefined, notice: string) => void;
}) {
  const [mode, setMode] = useState<TrackingEntryMode>(defaultMode);
  const [postingText, setPostingText] = useState("");
  const [draft, setDraft] = useState<Application | undefined>(() => defaultMode === "manual" ? emptyTrackingApplication() : undefined);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const readPosting = async () => {
    setReading(true);
    setError("");
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "AI_DRAFT_APPLICATION",
        postingText
      } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "AI 无法读取职位文本。");
      const result = response.draft as JobPostingDraft;
      setDraft({
        company: result.company,
        role: result.role,
        jobUrl: result.jobUrl,
        source: result.source,
        dateApplied: new Date().toISOString(),
        status: "Applied",
        location: result.location,
        workMode: result.workMode,
        compensation: result.compensation,
        jobDescription: result.jobDescription,
        answersUsed: [],
        notes: "",
        upwork: result.upwork
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setReading(false);
    }
  };

  const confirm = async () => {
    if (!draft) return;
    if (!draft.company.trim() || !draft.role.trim()) {
      setError("公司和职位为必填项。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const application: Application = { ...draft, status: "Applied" };
      const logResponse = await chrome.runtime.sendMessage({ kind: "LOG_APPLICATION", application } satisfies ExtensionMessage);
      if (!logResponse?.ok) throw new Error(logResponse?.error ?? "跟踪失败。");
      await chrome.runtime.sendMessage({ kind: "REMOVE_PENDING_APPLICATION", id: pending.id } satisfies ExtensionMessage);
      onDone(demoMode ? undefined : application, demoMode ? "演示模式：未保存。" : "已保存到跟踪器。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  const dismiss = async () => {
    await chrome.runtime.sendMessage({ kind: "REMOVE_PENDING_APPLICATION", id: pending.id } satisfies ExtensionMessage);
    onDone(undefined, "");
  };

  const changeMode = (nextMode: TrackingEntryMode) => {
    setMode(nextMode);
    setPostingText("");
    setDraft(nextMode === "manual" ? emptyTrackingApplication() : undefined);
    setError("");
  };

  return (
    <div className="jtMatch">
      <p className="jtChipHeading">检测到申请</p>
      <TrackingModeSwitch mode={mode} onChange={changeMode} />
      {mode === "ai" && !draft ? (
        <>
          <label className="jtField">
            <span>粘贴职位详情供 AI 处理</span>
            <textarea
              className="jtTextarea"
              rows={7}
              value={postingText}
              onChange={(event) => setPostingText(event.target.value)}
              placeholder="粘贴职位信息或你想要保存的详细信息。"
              autoFocus
            />
          </label>
          <p className="jtMuted">仅使用你粘贴的文本。检测到的页面数据不会添加到跟踪器。</p>
        </>
      ) : draft ? (
        <TrackDraftForm draft={draft} mode={mode} onChange={setDraft} />
      ) : null}
      {error && <p className="jtError">{error}</p>}
      <div className="jtFooter">
        <button
          className="jtButton"
          onClick={() => void (draft ? confirm() : readPosting())}
          disabled={saving || reading || (!draft && !postingText.trim())}
        >
          {saving ? "正在保存..." : reading ? "正在使用 AI 读取..." : draft ? "保存为已申请" : "使用 AI 填充跟踪器"}
        </button>
        {mode === "ai" && draft && (
          <button className="jtButtonGhost" onClick={() => setDraft(undefined)} disabled={saving}>
            返回
          </button>
        )}
        <button className="jtButtonGhost" onClick={() => void dismiss()} disabled={saving || reading}>
          忽略
        </button>
      </div>
    </div>
  );
}