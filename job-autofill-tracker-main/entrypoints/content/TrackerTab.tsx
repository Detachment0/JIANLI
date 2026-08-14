import { useCallback, useEffect, useState } from "react";
import type { JobPostingDraft } from "../../lib/ai";
import { normalizeCompensationCurrency } from "../../lib/compensation";
import { isFollowUpDue, localTodayISO } from "../../lib/jobs";
import { changeUpworkStatus, UPWORK_PROPOSAL_STATUSES } from "../../lib/upwork";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
  type CompensationCurrency,
  type CompensationPeriod,
  type ExtensionMessage,
  type UpworkProposalStatus
} from "../../lib/schema";

type TrackerStatusFilter = ApplicationStatus | "All";

const emptyManualDraft = {
  company: "",
  role: "",
  jobUrl: "",
  source: "Manual",
  status: "Applied" as ApplicationStatus,
  compensationText: "",
  compensationCurrency: "" as CompensationCurrency,
  compensationMin: "",
  compensationMax: "",
  compensationPeriod: "" as CompensationPeriod
};

export default function TrackerTab({ demoMode, onOpenDashboard }: { demoMode: boolean; onOpenDashboard: (applicationId?: number) => void }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TrackerStatusFilter>("All");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState(emptyManualDraft);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [postingText, setPostingText] = useState("");
  const [pasteCreating, setPasteCreating] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await chrome.runtime.sendMessage({ kind: "LIST_APPLICATIONS" } satisfies ExtensionMessage);
    if (!response?.ok) throw new Error(response?.error ?? "加载已跟踪的职位失败。");
    setApplications(response.applications as Application[]);
  }, []);

  useEffect(() => {
    load().catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (changes.applicationsRev) {
        void load().catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
      }
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [load]);

  async function addManual() {
    if (!manualDraft.company.trim() || !manualDraft.role.trim()) {
      setNotice("公司和职位为必填项。");
      return;
    }
    setNotice("正在创建...");
    try {
      const application: Application = {
        company: manualDraft.company.trim(),
        role: manualDraft.role.trim(),
        jobUrl: manualDraft.jobUrl.trim(),
        source: manualDraft.source.trim(),
        dateApplied: new Date().toISOString(),
        status: manualDraft.status,
        location: "",
        workMode: "",
        compensation: compensationFromDraft(manualDraft),
        jobDescription: "",
        answersUsed: [],
        notes: "",
        upwork: manualDraft.source.trim().toLowerCase() === "upwork" ? {
          status: "Submitted",
          contractType: manualDraft.compensationPeriod === "hour" ? "hourly" : manualDraft.compensationPeriod === "one-time" ? "fixed" : "",
          proposedAmount: numberOrUndefined(manualDraft.compensationMin) ?? null,
          currency: manualDraft.compensationCurrency,
          baseConnects: null,
          boostBid: null,
          boostCharged: null
        } : undefined
      };
      const response = await chrome.runtime.sendMessage({ kind: "LOG_APPLICATION", application } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "创建跟踪记录失败。");
      setManualDraft(emptyManualDraft);
      setManualOpen(false);
      setNotice(demoMode ? "演示模式：未保存。" : "手动跟踪记录已创建。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function addPasted() {
    if (pasteCreating) return;
    setPasteCreating(true);
    setNotice("正在读取职位信息...");
    try {
      const draftResponse = await chrome.runtime.sendMessage({
        kind: "AI_DRAFT_APPLICATION",
        postingText
      } satisfies ExtensionMessage);
      if (!draftResponse?.ok) throw new Error(draftResponse?.error ?? "读取职位信息失败。");
      const draft = draftResponse.draft as JobPostingDraft;
      const application: Application = {
        company: draft.company,
        role: draft.role,
        jobUrl: draft.jobUrl,
        source: draft.source || "已粘贴",
        dateApplied: new Date().toISOString(),
        status: "Applied",
        location: draft.location,
        workMode: draft.workMode,
        compensation: draft.compensation,
        jobDescription: draft.jobDescription,
        upwork: draft.upwork,
        answersUsed: [],
        notes: ""
      };
      const response = await chrome.runtime.sendMessage({ kind: "LOG_APPLICATION", application } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "创建跟踪记录失败。");
      setPostingText("");
      setPasteOpen(false);
      setNotice(demoMode ? "演示模式：未保存。" : `已跟踪 ${draft.company || "公司"} - ${draft.role || "职位"}。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setPasteCreating(false);
    }
  }

  async function updateApplication(app: Application, patch: Partial<Application>) {
    try {
      if (!app.id) throw new Error("已跟踪的职位缺少 ID。");
      const response = await chrome.runtime.sendMessage({ kind: "UPDATE_APPLICATION", id: app.id, patch } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "更新已跟踪的职位失败。");
      setNotice(demoMode ? "演示模式：未保存。" : "已跟踪的职位已更新。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteApplication(app: Application) {
    try {
      if (!app.id) throw new Error("已跟踪的职位缺少 ID。");
      const response = await chrome.runtime.sendMessage({ kind: "DELETE_APPLICATION", id: app.id } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "删除已跟踪的职位失败。");
      setNotice(demoMode ? "演示模式：未保存。" : "已跟踪的职位已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  const now = Date.now();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const stats = {
    dayCount: applications.filter((app) => isSameLocalDay(new Date(app.dateApplied), today)).length,
    yesterdayCount: applications.filter((app) => isSameLocalDay(new Date(app.dateApplied), yesterday)).length,
    weekCount: applications.filter((app) => now - new Date(app.dateApplied).getTime() < 7 * 24 * 60 * 60 * 1000).length
  };

  const todayISO = localTodayISO();
  const dueApplications = applications.filter((app) => isFollowUpDue(app, todayISO));

  const visibleApplications = applications.filter((app) => {
    const trimmed = query.trim().toLowerCase();
    const matchesQuery = !trimmed || `${app.company} ${app.role} ${app.source} ${app.status} ${app.notes}`.toLowerCase().includes(trimmed);
    const matchesStatus = statusFilter === "All" || app.status === statusFilter;
    const matchesDue = !dueOnly || isFollowUpDue(app, todayISO);
    return matchesQuery && matchesStatus && matchesDue;
  });

  return (
    <div className="jtMatch">
      {dueApplications.length > 0 && (
        <button className={dueOnly ? "jtDueBanner jtDueBannerActive" : "jtDueBanner"} onClick={() => setDueOnly(!dueOnly)}>
          {dueApplications.length} 个跟进待办
          {dueOnly ? " - 仅显示这些" : " - 点击筛选"}
        </button>
      )}
      <div className="jtStatRow">
        <Stat label="今天" value={stats.dayCount} />
        <Stat label="昨天" value={stats.yesterdayCount} />
        <Stat label="本周" value={stats.weekCount} />
      </div>
      <div className="jtRow">
        <button
          className={manualOpen ? "jtButton" : "jtButtonGhost"}
          onClick={() => {
            setManualOpen(!manualOpen);
            if (!manualOpen) setPasteOpen(false);
          }}
        >
          + 新职位
        </button>
        <button
          className={pasteOpen ? "jtButton" : "jtButtonGhost"}
          onClick={() => {
            setPasteOpen(!pasteOpen);
            if (!pasteOpen) setManualOpen(false);
          }}
        >
          AI 粘贴
        </button>
      </div>
      {manualOpen && (
        <div className="jtMatch">
          <label className="jtField">
            <span>公司</span>
            <input value={manualDraft.company} onChange={(event) => setManualDraft({ ...manualDraft, company: event.target.value })} />
          </label>
          <label className="jtField">
            <span>职位</span>
            <input value={manualDraft.role} onChange={(event) => setManualDraft({ ...manualDraft, role: event.target.value })} />
          </label>
          <label className="jtField">
            <span>职位链接</span>
            <input value={manualDraft.jobUrl} onChange={(event) => setManualDraft({ ...manualDraft, jobUrl: event.target.value })} />
          </label>
          <label className="jtField">
            <span>薪酬</span>
            <input value={manualDraft.compensationText} onChange={(event) => setManualDraft({ ...manualDraft, compensationText: event.target.value })} />
          </label>
          <div className="jtGrid2">
            <label className="jtField">
              <span>来源</span>
              <input value={manualDraft.source} onChange={(event) => setManualDraft({ ...manualDraft, source: event.target.value })} />
            </label>
            <label className="jtField">
              <span>状态</span>
              <select value={manualDraft.status} onChange={(event) => setManualDraft({ ...manualDraft, status: event.target.value as ApplicationStatus })}>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="jtGrid3">
            <label className="jtField">
              <span>币种</span>
              <select
                value={manualDraft.compensationCurrency}
                onChange={(event) => setManualDraft({ ...manualDraft, compensationCurrency: event.target.value as CompensationCurrency })}
              >
                <option value="">未设置</option>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label className="jtField">
              <span>最低</span>
              <input
                inputMode="decimal"
                value={manualDraft.compensationMin}
                onChange={(event) => setManualDraft({ ...manualDraft, compensationMin: event.target.value })}
              />
            </label>
            <label className="jtField">
              <span>最高</span>
              <input
                inputMode="decimal"
                value={manualDraft.compensationMax}
                onChange={(event) => setManualDraft({ ...manualDraft, compensationMax: event.target.value })}
              />
            </label>
          </div>
          <label className="jtField">
            <span>周期</span>
            <select
              value={manualDraft.compensationPeriod}
              onChange={(event) => setManualDraft({ ...manualDraft, compensationPeriod: event.target.value as CompensationPeriod })}
            >
              <option value="">未设置</option>
              <option value="year">年</option>
              <option value="month">月</option>
              <option value="hour">小时</option>
              <option value="one-time">一次性</option>
            </select>
          </label>
          <button className="jtButton" onClick={() => void addManual()}>
            创建跟踪记录
          </button>
        </div>
      )}
      {pasteOpen && (
        <div className="jtMatch">
          <textarea
            className="jtTextarea"
            rows={5}
            placeholder="粘贴职位信息或 Upwork 提案摘要"
            value={postingText}
            onChange={(event) => setPostingText(event.target.value)}
          />
          <button className="jtButton" disabled={pasteCreating || !postingText.trim()} onClick={() => void addPasted()}>
            {pasteCreating ? "正在读取..." : "使用 AI 创建"}
          </button>
        </div>
      )}
      <div className="jtRow">
        <input
          className="jtTextarea"
          aria-label="搜索已跟踪的职位"
          placeholder="搜索职位"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="jtTextarea"
          aria-label="按状态筛选已跟踪的职位"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TrackerStatusFilter)}
        >
          <option value="All">全部</option>
          {APPLICATION_STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </div>
      <p className="jtMuted">{visibleApplications.length} 个已跟踪</p>
      {applications.length === 0 && <p className="jtMuted">新的和已跟踪的职位将显示在此处。</p>}
      {applications.length > 0 && visibleApplications.length === 0 && <p className="jtMuted">没有匹配此视图的已跟踪职位。</p>}
      {visibleApplications.map((app) => (
        <TrackedJob
          app={app}
          key={app.id ?? `${app.company}-${app.role}-${app.dateApplied}`}
          onUpdate={(patch) => void updateApplication(app, patch)}
          onDelete={() => void deleteApplication(app)}
          onOpenDashboard={() => onOpenDashboard(app.id)}
        />
      ))}
      {notice && <p className="jtNotice">{notice}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="jtStat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrackedJob({
  app,
  onUpdate,
  onDelete,
  onOpenDashboard
}: {
  app: Application;
  onUpdate: (patch: Partial<Application>) => void;
  onDelete: () => void;
  onOpenDashboard: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = window.setTimeout(() => setConfirmingDelete(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmingDelete]);

  async function copyJob() {
    await navigator.clipboard.writeText(applicationToClipboardText(app));
    setCopied(true);
  }

  return (
    <article className="jtJobRow">
      <div className="jtJobRowTop">
        <button className="jtMiniButton" type="button" title={expanded ? "折叠职位" : "展开职位"} onClick={() => setExpanded(!expanded)}>
          {expanded ? "-" : "+"}
        </button>
        <div className="jtJobRowMain">
          <div className="jtJobRowTitle">
            <strong>{app.role || "职位"}</strong>
            <select
              aria-label={`状态：${app.role || "已跟踪的职位"}`}
              value={app.status}
              onChange={(event) => onUpdate({ status: event.target.value as ApplicationStatus })}
            >
              {APPLICATION_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <p className="jtJobRowCompany">{app.company || "公司"}</p>
          {app.upwork && <span className="jtUpworkBadge">Upwork · {app.upwork.status}</span>}
          {app.nextActionDate && <p className="jtJobRowCompany">到期 {app.nextActionDate.slice(0, 10)}</p>}
        </div>
        <div className="jtJobRowActions">
          <button className="jtMiniButton" type="button" title="复制所有职位详情" onClick={() => void copyJob()}>
            {copied ? "已复制" : "复制"}
          </button>
          {app.jobUrl ? (
            <a className="jtMiniButton" href={app.jobUrl} target="_blank" rel="noreferrer" title="打开职位">
              打开
            </a>
          ) : null}
        </div>
      </div>
      {expanded && (
        <div className="jtJobRowExpanded">
          <dl className="jtJobDetails">
            <div>
              <dt>来源</dt>
              <dd>{app.source || "未设置"}</dd>
            </div>
            <div>
              <dt>已申请</dt>
              <dd>{app.dateApplied ? app.dateApplied.slice(0, 10) : "未设置"}</dd>
            </div>
            <div>
              <dt>地点</dt>
              <dd>{app.location || "未设置"}</dd>
            </div>
            <div>
              <dt>工作模式</dt>
              <dd>{app.workMode || "未设置"}</dd>
            </div>
            <div className="jtJobDetailWide">
              <dt>薪酬</dt>
              <dd>{formatCompensation(app.compensation)}</dd>
            </div>
            <div>
              <dt>简历</dt>
              <dd>{app.resumeVersion || "未设置"}</dd>
            </div>
            <div className="jtJobDetailWide">
              <dt>职位链接</dt>
              <dd>
                {app.jobUrl ? <a href={app.jobUrl} target="_blank" rel="noreferrer">{app.jobUrl}</a> : "未设置"}
              </dd>
            </div>
          </dl>
          {app.jobDescription && (
            <section className="jtJobTextBlock">
              <strong>职位描述</strong>
              <p>{app.jobDescription}</p>
            </section>
          )}
          {app.answersUsed.length > 0 && (
            <section className="jtJobTextBlock">
              <strong>申请答案</strong>
              {app.answersUsed.map((answer, index) => (
                <div className="jtJobAnswer" key={`${answer.question}-${index}`}>
                  <span>{answer.question}</span>
                  <p>{answer.answer}</p>
                </div>
              ))}
            </section>
          )}
          <label className="jtField">
            <span>跟进日期</span>
            <input
              type="date"
              value={app.nextActionDate?.slice(0, 10) ?? ""}
              onChange={(event) => onUpdate({ nextActionDate: event.target.value })}
            />
          </label>
          {app.upwork && (
            <>
              <label className="jtField">
                <span>Upwork 提案状态</span>
                <select
                  value={app.upwork.status}
                  onChange={(event) => onUpdate(changeUpworkStatus(app, event.target.value as UpworkProposalStatus))}
                >
                  {UPWORK_PROPOSAL_STATUSES.map((proposalStatus) => (
                    <option key={proposalStatus}>{proposalStatus}</option>
                  ))}
                </select>
              </label>
              <div className="jtGrid2">
                <label className="jtField">
                  <span>基础 Connects</span>
                  <input
                    type="number"
                    min="0"
                    value={app.upwork.baseConnects ?? ""}
                    onChange={(event) => onUpdate({ upwork: { ...app.upwork!, baseConnects: nullableNumber(event.target.value) } })}
                  />
                </label>
                <label className="jtField">
                  <span>提升收费</span>
                  <input
                    type="number"
                    min="0"
                    value={app.upwork.boostCharged ?? ""}
                    onChange={(event) => onUpdate({ upwork: { ...app.upwork!, boostCharged: nullableNumber(event.target.value) } })}
                  />
                </label>
              </div>
              <dl className="jtJobDetails">
                <div>
                  <dt>合同类型</dt>
                  <dd>{app.upwork.contractType || "未设置"}</dd>
                </div>
                <div>
                  <dt>提议金额</dt>
                  <dd>{app.upwork.proposedAmount == null ? "未设置" : `${app.upwork.currency || ""} ${app.upwork.proposedAmount}`.trim()}</dd>
                </div>
                <div>
                  <dt>提升出价</dt>
                  <dd>{app.upwork.boostBid ?? "未设置"}</dd>
                </div>
                <div>
                  <dt>已回复</dt>
                  <dd>{app.upwork.respondedAt?.slice(0, 10) || "未设置"}</dd>
                </div>
                <div>
                  <dt>已面试</dt>
                  <dd>{app.upwork.interviewedAt?.slice(0, 10) || "未设置"}</dd>
                </div>
                <div>
                  <dt>已发 offer</dt>
                  <dd>{app.upwork.offeredAt?.slice(0, 10) || "未设置"}</dd>
                </div>
                <div>
                  <dt>已录用</dt>
                  <dd>{app.upwork.hiredAt?.slice(0, 10) || "未设置"}</dd>
                </div>
              </dl>
            </>
          )}
          <label className="jtField">
            <span>备注</span>
            <textarea
              className="jtTextarea"
              rows={2}
              defaultValue={app.notes ?? ""}
              onBlur={(event) => {
                if (event.target.value !== (app.notes ?? "")) onUpdate({ notes: event.target.value });
              }}
            />
          </label>
          <div className="jtRow">
            <button className="jtMiniButton" type="button" onClick={onOpenDashboard}>
              在仪表盘中编辑
            </button>
            <button
              className="jtMiniButton jtMiniDanger"
              type="button"
              onClick={() => {
                if (confirmingDelete) {
                  setConfirmingDelete(false);
                  onDelete();
                } else {
                  setConfirmingDelete(true);
                }
              }}
            >
              {confirmingDelete ? "确认删除？" : "删除"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function compensationFromDraft(draft: typeof emptyManualDraft) {
  const text = draft.compensationText.trim();
  const currency = draft.compensationCurrency;
  const min = numberOrUndefined(draft.compensationMin);
  const max = numberOrUndefined(draft.compensationMax);
  if (!text && !currency && min === undefined && max === undefined && !draft.compensationPeriod) return undefined;
  return normalizeCompensationCurrency({
    text,
    currency,
    min,
    max,
    period: draft.compensationPeriod
  });
}

function formatCompensation(compensation: Application["compensation"]): string {
  if (!compensation) return "未设置";
  const periodMap: Record<string, string> = { year: "年", month: "月", hour: "小时", "one-time": "一次性" };
  const range = compensation.min == null && compensation.max == null
    ? ""
    : [compensation.min, compensation.max].filter((value) => value != null).join(" – ");
  const structured = [compensation.currency, range, compensation.period ? `每${periodMap[compensation.period] ?? compensation.period}` : ""].filter(Boolean).join(" ");
  return [compensation.text, structured].filter(Boolean).join(" · ") || "未设置";
}

function applicationToClipboardText(application: Application): string {
  const compensation = application.compensation;
  return [
    `${application.role || "未命名职位"} 在 ${application.company || "未知公司"}`,
    [
      `公司：${application.company}`,
      `职位：${application.role}`,
      `状态：${application.status}`,
      `来源：${application.source}`,
      `职位链接：${application.jobUrl}`,
      `申请日期：${application.dateApplied.slice(0, 10)}`,
      application.nextActionDate ? `下次跟进日期：${application.nextActionDate.slice(0, 10)}` : "",
      application.location ? `地点：${application.location}` : "",
      application.workMode ? `工作模式：${application.workMode}` : "",
      application.resumeVersion ? `简历版本：${application.resumeVersion}` : ""
    ].filter(Boolean).join("\n"),
    compensation
      ? [
          "薪酬",
          compensation.text ? `详情：${compensation.text}` : "",
          compensation.currency ? `币种：${compensation.currency}` : "",
          compensation.min != null ? `最低：${compensation.min}` : "",
          compensation.max != null ? `最高：${compensation.max}` : "",
          compensation.period ? `周期：${compensation.period}` : ""
        ].filter(Boolean).join("\n")
      : "",
    application.notes ? `备注\n${application.notes}` : "",
    application.jobDescription ? `职位描述\n${application.jobDescription}` : "",
    application.answersUsed.length > 0
      ? `申请答案\n${application.answersUsed.map((item) => `问题：${item.question}\n答案：${item.answer}`).join("\n\n")}`
      : ""
  ].filter(Boolean).join("\n\n");
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) throw new Error(`无效数字：${value}`);
  return parsed;
}

function nullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`无效的非负数：${value}`);
  return parsed;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}
