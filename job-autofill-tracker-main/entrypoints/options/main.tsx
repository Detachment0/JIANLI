import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BriefcaseBusiness, Building2, CalendarClock, ChevronDown, ChevronRight, Download, FileText, KeyRound, LayoutDashboard, ListFilter, MapPin, Plus, Save, Search, Sparkles, Trash2, Upload, UserRound, Wand2, X, BookOpen, Globe } from "lucide-react";
import { draftApplicationFromJobPosting, draftSingleAnswer, enrichProfileFromText, importProfileFromCv } from "../../lib/ai";
import { normalizeCompensationCurrency } from "../../lib/compensation";
import { db } from "../../lib/db";
import { createDemoApplications, createDemoMemories } from "../../lib/demo";
import { questionHash } from "../../lib/mapping";
import { loadCustomSynonyms, saveCustomSynonyms } from "../../lib/customSynonyms";
import { APPLICATION_STATUSES, EMPTY_PROFILE, type AnswerMemory, type Application, type ApplicationStatus, type CanonicalField, type CompensationCurrency, type CompensationPeriod, type CustomSynonymEntry, type Experience, type PendingApplication, type PersonalProject, type Profile, type Settings, type ThemeMode, type TrackingEntryMode, type UpworkProposalStatus } from "../../lib/schema";
import { bumpApplicationsRev, clearDashboardLaunch, getDashboardLaunch, getPendingApplications, getProfile, getSettings, removePendingApplication, saveProfile, saveSettings } from "../../lib/storage";
import { applyTheme } from "../../lib/theme";
import { changeUpworkStatus, UPWORK_PROPOSAL_STATUSES, upworkRate, upworkSummary } from "../../lib/upwork";
import { t, setLocale, getLocale } from "../../lib/i18n";
import "../../lib/design-tokens.css";
import "../../lib/primitives.css";
import "./styles.css";

const statuses = APPLICATION_STATUSES;
const defaultBoardStatuses: ApplicationStatus[] = ["Applied", "Interview", "Rejected"];

type TabId = "overview" | "applications" | "profile" | "knowledge" | "settings";

function App() {
  const [tab, setTab] = useState<TabId>("overview");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [memories, setMemories] = useState<AnswerMemory[]>([]);
  const [profileSaveStatus, setProfileSaveStatus] = useState("已保存");
  const [importStatus, setImportStatus] = useState("");
  const [launchPendingId, setLaunchPendingId] = useState<string | undefined>();
  const [launchApplicationId, setLaunchApplicationId] = useState<number | undefined>();
  const [localeVersion, setLocaleVersion] = useState(0);
  const skipNextProfileSave = useRef(true);
  const profileSaveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void loadInitialState();

    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") return;
      if (changes.pendingApplications) void refresh();
      if (changes.dashboardLaunch) void consumeDashboardLaunch();
      if (changes.settings) void refresh();
      if (changes.applicationsRev) void reloadApplications();
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    if (skipNextProfileSave.current) {
      skipNextProfileSave.current = false;
      return;
    }

    if (settings?.demoMode) {
      setProfileSaveStatus("演示模式变更是临时的");
      return;
    }

    window.clearTimeout(profileSaveTimer.current);
    setProfileSaveStatus("正在保存...");
    profileSaveTimer.current = window.setTimeout(() => {
      void saveProfile(profile)
        .then(() => setProfileSaveStatus(`已保存 ${new Date().toLocaleTimeString()}`))
        .catch((error: unknown) => setProfileSaveStatus(error instanceof Error ? error.message : String(error)));
    }, 550);

    return () => window.clearTimeout(profileSaveTimer.current);
  }, [profile, settings?.demoMode]);

  async function loadInitialState() {
    await refresh();
    await consumeDashboardLaunch();
  }

  async function consumeDashboardLaunch() {
    const launch = await getDashboardLaunch();
    if (!launch) return;
    setTab(launch.tab === "tracker" ? "applications" : "overview");
    setLaunchPendingId(launch.pendingId);
    setLaunchApplicationId(launch.applicationId);
    await clearDashboardLaunch();
  }

  async function refresh() {
    const nextSettings = await getSettings();
    skipNextProfileSave.current = true;
    setProfile(await getProfile());
    setSettings(nextSettings);
    applyTheme(nextSettings.theme);
    if (nextSettings.demoMode) {
      setApplications(createDemoApplications());
      setPendingApplications([]);
      setMemories(createDemoMemories());
      setProfileSaveStatus("演示模式变更是临时的");
    } else {
      setApplications(await db.applications.orderBy("dateApplied").reverse().toArray());
      setPendingApplications(await getPendingApplications());
      setMemories(await db.answerMemory.orderBy("lastUsed").reverse().toArray());
    }
  }

  async function reloadApplications() {
    const nextSettings = await getSettings();
    setApplications(nextSettings.demoMode ? createDemoApplications() : await db.applications.orderBy("dateApplied").reverse().toArray());
  }

  async function persistSettings(next: Settings) {
    const demoModeChanged = next.demoMode !== settings?.demoMode;
    setSettings(next);
    applyTheme(next.theme);
    await saveSettings(next);
    if (demoModeChanged) await refresh();
  }

  async function importCv(file: File) {
    try {
      if (settings?.demoMode) throw new Error("导入简历前请先退出演示模式。");
      if (!settings?.apiKey) throw new Error("请先在设置中添加 OpenAI API 密钥。");
      setImportStatus("正在读取简历...");
      const fileDataUrl = await readFileDataUrl(file);
      setImportStatus("正在询问 AI...");
      const draft = await importProfileFromCv(file.name, fileDataUrl, profile, settings);
      const profileWithResume: Profile = {
        ...draft,
        resumeFileRef: file.name,
        resumeFile: {
          name: file.name,
          type: file.type || "application/pdf",
          dataUrl: fileDataUrl
        }
      };
      setProfile(profileWithResume);
      await saveProfile(profileWithResume);
      setProfileSaveStatus(`已保存 ${new Date().toLocaleTimeString()}`);
      setImportStatus("个人资料已导入并保存，可用于自动填充。");
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function toggleLocale() {
    const next = getLocale() === "zh-CN" ? "en" : "zh-CN";
    setLocale(next);
    setLocaleVersion((v) => v + 1);
  }

  const dueCount = applications.filter((app) => app.nextActionDate && new Date(app.nextActionDate) <= new Date()).length;
  const weekCount = applications.filter((app) => Date.now() - new Date(app.dateApplied).getTime() < 7 * 24 * 60 * 60 * 1000).length;

  const profileSections = [
    { key: "identity", filled: !!(profile.identity.firstName || profile.identity.lastName || profile.identity.email) },
    { key: "workAuth", filled: !!(profile.workAuthorization.usAuthorized || profile.workAuthorization.visaStatus) },
    { key: "skills", filled: Object.keys(profile.skills).length > 0 },
    { key: "experience", filled: profile.experience.length > 0 },
    { key: "projects", filled: profile.personalProjects.length > 0 },
    { key: "summary", filled: !!profile.summary },
    { key: "knowledge", filled: !!profile.additionalKnowledge },
  ];
  const readinessFilled = profileSections.filter((s) => s.filled).length;
  const readinessTotal = profileSections.length;
  const readinessPct = readinessTotal > 0 ? Math.round((readinessFilled / readinessTotal) * 100) : 0;

  const sidebarTabs: { id: TabId; icon: React.ReactNode; label: string }[] = [
    { id: "overview", icon: <LayoutDashboard size={16} />, label: t("dash.overview") },
    { id: "applications", icon: <BriefcaseBusiness size={16} />, label: t("dash.applications") },
    { id: "profile", icon: <UserRound size={16} />, label: t("dash.profile") },
    { id: "knowledge", icon: <BookOpen size={16} />, label: t("dash.knowledge") },
    { id: "settings", icon: <KeyRound size={16} />, label: t("dash.settings") },
  ];

  return (
    <main className="jat dash">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div>
            <p className="dash-eyebrow">{t("popup.title")}</p>
            <h1>{t("popup.subtitle")}</h1>
          </div>
          <div className="dash-header-actions">
            {settings?.demoMode && (
              <span className="badge badge-warning">
                <Sparkles size={13} /> {t("dash.demoMode")}
              </span>
            )}
            <button className="btn btn-ghost btn-sm lang-switcher" onClick={toggleLocale}>
              <Globe size={14} />
              {getLocale() === "zh-CN" ? "EN" : "中文"}
            </button>
          </div>
        </div>
        <nav className="dash-tabs">
          {sidebarTabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "tab active" : "tab"}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="dash-layout">
        <nav className="dash-sidebar">
          {sidebarTabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="dash-content">
          {tab === "overview" && (
            <OverviewPanel
              profile={profile}
              applications={applications}
              memories={memories}
              weekCount={weekCount}
              dueCount={dueCount}
              readinessFilled={readinessFilled}
              readinessTotal={readinessTotal}
              readinessPct={readinessPct}
              importStatus={importStatus}
              onImportCv={importCv}
              onTabChange={setTab}
              exportCsv={exportCsv}
              settings={settings}
            />
          )}
          {tab === "applications" && (
            <TrackerPanel
              applications={applications}
              pendingApplications={pendingApplications}
              refresh={refresh}
              demoMode={Boolean(settings?.demoMode)}
              setApplications={setApplications}
              launchPendingId={launchPendingId}
              launchApplicationId={launchApplicationId}
              onLaunchConsumed={() => {
                setLaunchPendingId(undefined);
                setLaunchApplicationId(undefined);
              }}
            />
          )}
          {tab === "profile" && (
            <ProfilePanel
              profile={profile}
              setProfile={setProfile}
              saveStatus={profileSaveStatus}
              importStatus={importStatus}
              onImportCv={importCv}
            />
          )}
          {tab === "knowledge" && (
            <KnowledgePanel
              profile={profile}
              setProfile={setProfile}
              saveStatus={profileSaveStatus}
              memories={memories}
              refresh={refresh}
              demoMode={Boolean(settings?.demoMode)}
              setMemories={setMemories}
            />
          )}
          {tab === "settings" && settings && <SettingsPanel settings={settings} save={persistSettings} />}
        </section>
      </div>
    </main>
  );

  function exportCsv() {
    const rows = [["company", "role", "status", "source", "dateApplied", "nextActionDate", "location", "workMode", "compensation", "compensationCurrency", "compensationMin", "compensationMax", "compensationPeriod", "jobUrl", "jobDescription", "notes", "upworkStatus", "upworkContractType", "upworkProposedAmount", "upworkCurrency", "upworkBaseConnects", "upworkBoostBid", "upworkBoostCharged", "upworkRespondedAt", "upworkInterviewedAt", "upworkOfferedAt", "upworkHiredAt"]];
    for (const app of applications) rows.push([
      app.company, app.role, app.status, app.source, app.dateApplied,
      app.nextActionDate ?? "", app.location ?? "", app.workMode ?? "",
      app.compensation?.text ?? "", app.compensation?.currency ?? "",
      app.compensation?.min == null ? "" : String(app.compensation.min),
      app.compensation?.max == null ? "" : String(app.compensation.max),
      app.compensation?.period ?? "", app.jobUrl, app.jobDescription ?? "",
      app.notes, app.upwork?.status ?? "", app.upwork?.contractType ?? "",
      app.upwork?.proposedAmount == null ? "" : String(app.upwork.proposedAmount),
      app.upwork?.currency ?? "", app.upwork?.baseConnects == null ? "" : String(app.upwork.baseConnects),
      app.upwork?.boostBid == null ? "" : String(app.upwork.boostBid),
      app.upwork?.boostCharged == null ? "" : String(app.upwork.boostCharged),
      app.upwork?.respondedAt ?? "", app.upwork?.interviewedAt ?? "",
      app.upwork?.offeredAt ?? "", app.upwork?.hiredAt ?? ""
    ]);
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    chrome.downloads?.download?.({ url, filename: "job-applications.csv", saveAs: true });
  }
}

/* ===== Overview ===== */

function OverviewPanel({
  profile, applications, memories, weekCount, dueCount,
  readinessFilled, readinessTotal, readinessPct,
  importStatus, onImportCv, onTabChange, exportCsv, settings
}: {
  profile: Profile; applications: Application[]; memories: AnswerMemory[];
  weekCount: number; dueCount: number;
  readinessFilled: number; readinessTotal: number; readinessPct: number;
  importStatus: string; onImportCv: (file: File) => Promise<void>;
  onTabChange: (tab: TabId) => void; exportCsv: () => void;
  settings: Settings | null;
}) {
  const statusCounts: Record<string, number> = {};
  for (const status of statuses) statusCounts[status] = applications.filter((a) => a.status === status).length;

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void onImportCv(file);
  };

  return (
    <section className="panel">
      <div className="overview-grid">
        <div className="overview-card">
          <h3>{t("dash.pipeline")}</h3>
          <div className="overview-stat">{applications.length}</div>
          <div className="overview-statuses">
            {statuses.map((status) => (
              <span className="overview-status" key={status}>
                <span className={`statusDot status-${status.toLowerCase()}`} />
                {status}: {statusCounts[status]}
              </span>
            ))}
          </div>
        </div>
        <div className="overview-card">
          <h3>{t("dash.recentApplications")}</h3>
          <div className="overview-stat">{weekCount}</div>
          <p className="text-secondary">{t("dash.thisWeek")}</p>
        </div>
        <div className="overview-card">
          <h3>{t("dash.needsFollowUp")}</h3>
          <div className="overview-stat">{dueCount}</div>
          <p className="text-secondary">{t("dash.due")}</p>
        </div>
        <div className="overview-card">
          <h3>{t("dash.profileReadiness")}</h3>
          <div className="overview-stat">{readinessPct}%</div>
          <div className="progress"><div className="progress-bar" style={{ width: `${readinessPct}%` }} /></div>
          <p className="text-secondary">{t("dash.sectionsFilled", { filled: readinessFilled, total: readinessTotal })}</p>
        </div>
      </div>

      <div className="overview-actions">
        <label className="btn btn-primary">
          <Upload size={14} /> {t("dash.importCV")}
          <input type="file" accept="application/pdf" onChange={handleImport} style={{ display: "none" }} />
        </label>
        <button className="btn" onClick={() => onTabChange("profile")}>
          <Sparkles size={14} /> {t("dash.smartAdd")}
        </button>
        <button className="btn" onClick={() => onTabChange("applications")}>
          <Plus size={14} /> {t("dash.manualAdd")}
        </button>
        <button className="btn" onClick={exportCsv}>
          <Download size={14} /> {t("dash.exportCSV")}
        </button>
      </div>

      {importStatus && <p className="saveStamp" style={{ marginTop: 8 }}>{importStatus}</p>}
    </section>
  );
}

/* ===== Profile ===== */

function ProfilePanel({
  profile,
  setProfile,
  saveStatus,
  importStatus,
  onImportCv
}: {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  saveStatus: string;
  importStatus: string;
  onImportCv: (file: File) => Promise<void>;
}) {
  const [smartAddText, setSmartAddText] = useState("");
  const [smartAddStatus, setSmartAddStatus] = useState("");
  const [smartAdding, setSmartAdding] = useState(false);

  function update(path: string, value: string | boolean) {
    const { resumeFile, coverLetterFile, ...profileFacts } = profile;
    const clone = {
      ...structuredClone(profileFacts),
      resumeFile,
      coverLetterFile
    } as Profile;
    const keys = path.split(".");
    let cursor: Record<string, unknown> = clone as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
    cursor[keys.at(-1)!] = value;
    setProfile(clone);
  }

  async function smartAdd() {
    if (smartAdding) return;
    setSmartAdding(true);
    setSmartAddStatus("正在读取你的笔记...");
    try {
      const nextProfile = await enrichProfileFromText(smartAddText, profile, await getSettings());
      setProfile(nextProfile);
      setSmartAddText("");
      setSmartAddStatus("个人资料已更新。请查看以下部分。");
    } catch (error) {
      setSmartAddStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSmartAdding(false);
    }
  }

  async function importSelectedCv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await onImportCv(file);
  }

  async function storeCoverLetter(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProfile({
      ...profile,
      coverLetterFile: {
        name: file.name,
        type: file.type || "application/pdf",
        dataUrl: await readFileDataUrl(file)
      }
    });
  }

  return (
    <section className="panel">
      <div className="sectionHeader">
        <div>
          <h2>{t("dash.profile")}</h2>
          <p>仅存储规范信息。修改自动保存。</p>
        </div>
        <span className="saveStamp">{saveStatus}</span>
      </div>

      <div className="smartProfileAdd">
        <div>
          <Sparkles size={16} />
          <span>{t("dash.smartAdd")}</span>
        </div>
        <p>粘贴项目笔记、简历文本、个人简介或你希望用于申请的信息。</p>
        <textarea
          rows={6}
          placeholder="粘贴关于你的工作、项目、技能、教育或偏好的任何信息..."
          value={smartAddText}
          onChange={(event) => setSmartAddText(event.target.value)}
        />
        <button disabled={smartAdding || !smartAddText.trim()} onClick={() => void smartAdd()}>
          <Sparkles size={15} />
          {smartAdding ? "正在添加到个人资料..." : "使用 AI 添加"}
        </button>
        {smartAddStatus && <p className="smartProfileStatus">{smartAddStatus}</p>}
      </div>

      <Section title="自我评价" hint={'用于自动填充"个人简介""自我介绍"等字段。'}>
        <label className="field">
          <span>个人简介 / 自我评价</span>
          <textarea
            rows={6}
            value={profile.summary}
            onChange={(event) => update("summary", event.target.value)}
            placeholder="例如：具备扎实的 Java 后端开发基础..."
          />
        </label>
      </Section>

      <label className="importCv">
        <Upload size={16} />
        <span>导入简历 PDF</span>
        <input type="file" accept="application/pdf" onChange={(event) => void importSelectedCv(event)} />
      </label>
      <label className="importCv secondaryUpload">
        <Upload size={16} />
        <span>{profile.coverLetterFile ? `求职信：${profile.coverLetterFile.name}` : "存储求职信"}</span>
        <input type="file" accept="application/pdf,.doc,.docx" onChange={(event) => void storeCoverLetter(event)} />
      </label>
      {importStatus && <p className="saveStamp">{importStatus}</p>}

      <Section title="身份与联系方式" hint="可直接复制到申请中的可复用信息。">
        <div className="grid two">
        <Field label="名" value={profile.identity.firstName} onChange={(value) => update("identity.firstName", value)} />
        <Field label="中间名" value={profile.identity.middleName} onChange={(value) => update("identity.middleName", value)} />
        <Field label="姓" value={profile.identity.lastName} onChange={(value) => update("identity.lastName", value)} />
        <Field label="邮箱" value={profile.identity.email} onChange={(value) => update("identity.email", value)} />
        <Field label="电话国家代码" value={profile.identity.phoneCountryCode} onChange={(value) => update("identity.phoneCountryCode", value)} />
        <Field label="电话" value={profile.identity.phone} onChange={(value) => update("identity.phone", value)} />
        <Field label="地址行 1" value={profile.identity.address.line1} onChange={(value) => update("identity.address.line1", value)} />
        <Field label="地址行 2" value={profile.identity.address.line2} onChange={(value) => update("identity.address.line2", value)} />
        <Field label="邮政编码" value={profile.identity.address.postalCode} onChange={(value) => update("identity.address.postalCode", value)} />
        <Field label="城市" value={profile.identity.location.city} onChange={(value) => update("identity.location.city", value)} />
        <Field label="州/省" value={profile.identity.location.state ?? "Tamaulipas"} onChange={(value) => update("identity.location.state", value)} />
        <Field label="国家" value={profile.identity.location.country} onChange={(value) => update("identity.location.country", value)} />
        <Field label="LinkedIn" value={profile.identity.links.linkedin} onChange={(value) => update("identity.links.linkedin", value)} />
        <Field label="GitHub" value={profile.identity.links.github} onChange={(value) => update("identity.links.github", value)} />
        <Field label="作品集" value={profile.identity.links.portfolio} onChange={(value) => update("identity.links.portfolio", value)} />
        </div>
      </Section>

      <Section title="授权与申请默认设置" hint="明确的可复用答案。法律声明始终留给用户审查。">
        <div className="toggles">
          <label><input type="checkbox" checked={profile.workAuthorization.usAuthorized} onChange={(event) => update("workAuthorization.usAuthorized", event.target.checked)} /> 美国授权</label>
          <label><input type="checkbox" checked={profile.workAuthorization.requiresSponsorship} onChange={(event) => update("workAuthorization.requiresSponsorship", event.target.checked)} /> 需要赞助</label>
          <label><input type="checkbox" checked={profile.applicationDefaults.needsRecruitmentAdjustments} onChange={(event) => update("applicationDefaults.needsRecruitmentAdjustments", event.target.checked)} /> 需要招聘调整</label>
          <label><input type="checkbox" checked={profile.applicationDefaults.previouslyEmployedByFitch} onChange={(event) => update("applicationDefaults.previouslyEmployedByFitch", event.target.checked)} /> 曾受雇于 Fitch</label>
          <label><input type="checkbox" checked={profile.applicationDefaults.jobNotifications} onChange={(event) => update("applicationDefaults.jobNotifications", event.target.checked)} /> 职位通知</label>
        </div>
        <div className="grid two">
          <Field label="签证状态" value={profile.workAuthorization.visaStatus} onChange={(value) => update("workAuthorization.visaStatus", value)} />
          <Field label="英语水平" value={profile.workAuthorization.englishProficiency} onChange={(value) => update("workAuthorization.englishProficiency", value)} />
          <Field label="推荐来源" value={profile.applicationDefaults.referralSource} onChange={(value) => update("applicationDefaults.referralSource", value)} />
          <Field label="推荐详情" value={profile.applicationDefaults.referralDetails} onChange={(value) => update("applicationDefaults.referralDetails", value)} />
          <Field label="员工推荐人姓名" value={profile.applicationDefaults.employeeReferralName} onChange={(value) => update("applicationDefaults.employeeReferralName", value)} />
          <Field label="招聘调整详情" value={profile.applicationDefaults.recruitmentAdjustmentsDetails} onChange={(value) => update("applicationDefaults.recruitmentAdjustmentsDetails", value)} />
          <Field label="当前雇主" value={profile.applicationDefaults.currentEmployer} onChange={(value) => update("applicationDefaults.currentEmployer", value)} />
          <Field label="当前职位" value={profile.applicationDefaults.currentTitle} onChange={(value) => update("applicationDefaults.currentTitle", value)} />
          <Field label="当前薪资" value={profile.applicationDefaults.currentSalary} onChange={(value) => update("applicationDefaults.currentSalary", value)} />
          <Field label="期望薪资" value={profile.applicationDefaults.desiredSalary} onChange={(value) => update("applicationDefaults.desiredSalary", value)} />
          <Field label="薪资币种" value={profile.applicationDefaults.salaryCurrency} onChange={(value) => update("applicationDefaults.salaryCurrency", value)} />
          <label className="field">
            <span>个人资料可见性</span>
            <select value={profile.applicationDefaults.profileVisibility} onChange={(event) => update("applicationDefaults.profileVisibility", event.target.value)}>
              <option value="">每次申请时审查</option>
              <option value="Any open role at Fitch">Fitch 的任何开放职位</option>
              <option value="Only for the roles that I directly apply to">仅限我直接申请的职位</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="可选人口统计答案" hint="留空则将这些问题保留在自动填充审查中。">
        <div className="grid two">
          <Field label="性别" value={profile.demographics.gender} onChange={(value) => update("demographics.gender", value)} />
          <Field label="民族" value={profile.demographics.race} onChange={(value) => update("demographics.race", value)} />
          <Field label="退伍军人身份" value={profile.demographics.veteran} onChange={(value) => update("demographics.veteran", value)} />
          <Field label="残疾状况披露" value={profile.demographics.disability} onChange={(value) => update("demographics.disability", value)} />
        </div>
      </Section>

      <Section title={`技能 (${Object.keys(profile.skills).length})`} hint="用于匹配评分、自动填充和草拟筛选答案。">
        <SkillsEditor skills={profile.skills} onCommit={(skills) => setProfile({ ...profile, skills })} />
      </Section>

      <Section title={`经验 (${profile.experience.length})`} hint="用于雇主、职位和草拟筛选答案。">
        <ExperienceEditor experience={profile.experience} onCommit={(experience) => setProfile({ ...profile, experience })} />
      </Section>

      <Section title={`个人项目 (${profile.personalProjects.length})`} hint="用于草拟筛选答案和匹配评分。">
        <ProjectsEditor projects={profile.personalProjects} onCommit={(personalProjects) => setProfile({ ...profile, personalProjects })} />
      </Section>
    </section>
  );
}

/* ===== Knowledge ===== */

function KnowledgePanel({
  profile, setProfile, saveStatus,
  memories, refresh, demoMode, setMemories
}: {
  profile: Profile; setProfile: (profile: Profile) => void; saveStatus: string;
  memories: AnswerMemory[]; refresh: () => Promise<void>; demoMode: boolean;
  setMemories: React.Dispatch<React.SetStateAction<AnswerMemory[]>>;
}) {
  return (
    <section className="panel">
      <div className="sectionHeader">
        <div>
          <h2>{t("dash.knowledge")}</h2>
          <p>答案记忆与补充知识，用于自动填充和 AI 草拟。</p>
        </div>
      </div>

      <Section title="补充答案知识" hint="粘贴已完成的问题与答案或无法归入其他类别的详细信息。">
        <label className="field">
          <span>AI 可用于申请答案的信息</span>
          <textarea
            rows={10}
            value={profile.additionalKnowledge}
            onChange={(event) => {
              const { resumeFile, coverLetterFile, ...facts } = profile;
              setProfile({ ...structuredClone(facts), resumeFile, coverLetterFile, additionalKnowledge: event.target.value } as Profile);
            }}
            placeholder="例如：我在实施过程中为金融科技客户提供非技术咨询..."
          />
        </label>
      </Section>

      <MemoryPanel memories={memories} refresh={refresh} demoMode={demoMode} setMemories={setMemories} />
    </section>
  );
}

/* ===== Tracker ===== */

function TrackerPanel({
  applications,
  pendingApplications,
  refresh,
  demoMode,
  setApplications,
  launchPendingId,
  launchApplicationId,
  onLaunchConsumed
}: {
  applications: Application[];
  pendingApplications: PendingApplication[];
  refresh: () => Promise<void>;
  demoMode: boolean;
  setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
  launchPendingId?: string;
  launchApplicationId?: number;
  onLaunchConsumed: () => void;
}) {
  const [query, setQuery] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState({
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
  });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [upworkOpen, setUpworkOpen] = useState(false);
  const [postingText, setPostingText] = useState("");
  const [parseStatus, setParseStatus] = useState("");
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [visibleStatuses, setVisibleStatuses] = useState<ApplicationStatus[]>(defaultBoardStatuses);
  const [activePendingId, setActivePendingId] = useState<string | null>(null);
  const filtered = applications.filter((app) => `${app.company} ${app.role} ${app.status} ${app.source}`.toLowerCase().includes(query.toLowerCase()));
  const visibleFiltered = filtered.filter((app) => visibleStatuses.includes(app.status));
  const upworkStats = upworkSummary(applications);

  useEffect(() => {
    if (!launchPendingId) return;
    const pending = pendingApplications.find((item) => item.id === launchPendingId);
    if (!pending) return;
    openPendingPaste(pending);
    onLaunchConsumed();
  }, [launchPendingId, pendingApplications, onLaunchConsumed]);

  useEffect(() => {
    if (launchApplicationId === undefined) return;
    const application = applications.find((item) => item.id === launchApplicationId);
    if (!application) return;
    setQuery("");
    setVisibleStatuses((current) => current.includes(application.status)
      ? current
      : statuses.filter((status) => status === application.status || current.includes(status)));
  }, [applications, launchApplicationId]);

  function toggleVisibleStatus(status: ApplicationStatus) {
    setVisibleStatuses((current) => (
      current.includes(status)
        ? current.filter((item) => item !== status)
        : statuses.filter((item) => item === status || current.includes(item))
    ));
  }

  async function moveApplication(id: number, status: ApplicationStatus) {
    if (demoMode) {
      setApplications((current) => current.map((app) => app.id === id ? { ...app, status } : app));
    } else {
      await db.applications.update(id, { status });
      await bumpApplicationsRev();
      await refresh();
    }
    setDraggedId(null);
  }

  async function addManual() {
    if (!manualDraft.company.trim() || !manualDraft.role.trim()) {
      setParseStatus("公司和职位为必填项。");
      return;
    }

    const application: Application = {
      id: demoMode ? Math.max(0, ...applications.map((app) => app.id ?? 0)) + 1 : undefined,
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
    if (demoMode) setApplications((current) => [application, ...current]);
    else {
      await db.applications.add(application);
      await bumpApplicationsRev();
    }
    setManualDraft({
      company: "",
      role: "",
      jobUrl: "",
      source: "Manual",
      status: "Applied",
      compensationText: "",
      compensationCurrency: "",
      compensationMin: "",
      compensationMax: "",
      compensationPeriod: ""
    });
    setManualOpen(false);
    setParseStatus("");
    if (!demoMode) await refresh();
  }

  async function skipPending(pending: PendingApplication) {
    await removePendingApplication(pending.id);
    await refresh();
  }

  function openPendingPaste(pending: PendingApplication) {
    setManualOpen(false);
    setPasteOpen(true);
    setActivePendingId(pending.id);
    setPostingText("");
    setParseStatus("粘贴你希望 AI 添加的职位详情。检测到的页面数据不会被使用。");
  }

  async function parsePosting() {
    setParseStatus("正在读取职位信息...");
    try {
      const settings = await getSettings();
      const draft = await draftApplicationFromJobPosting(postingText, settings);
      const application: Application = {
        id: demoMode ? Math.max(0, ...applications.map((app) => app.id ?? 0)) + 1 : undefined,
        company: draft.company,
        role: draft.role,
        jobUrl: draft.jobUrl,
        source: draft.source || "Pasted",
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
      if (demoMode) setApplications((current) => [application, ...current]);
      else {
        await db.applications.add(application);
        await bumpApplicationsRev();
      }
      if (activePendingId) {
        await removePendingApplication(activePendingId);
        setActivePendingId(null);
      }
      setPostingText("");
      setPasteOpen(false);
      setParseStatus("");
      if (!demoMode) await refresh();
    } catch (error) {
      setParseStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="panel">
      <div className="toolbar trackerToolbar">
        <label className="searchBox">
          <Search size={15} />
          <input aria-label={t("dash.search")} placeholder={t("dash.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button
          aria-expanded={manualOpen}
          onClick={() => {
            setManualOpen(!manualOpen);
            if (!manualOpen) setPasteOpen(false);
          }}
        >
          <Plus size={14} /> {t("dash.manualAdd")}
        </button>
        <button
          aria-expanded={pasteOpen}
          onClick={() => {
            setPasteOpen(!pasteOpen);
            if (!pasteOpen) setManualOpen(false);
          }}
        >
          <Sparkles size={14} /> {t("dash.aiAdd")}
        </button>
        {upworkStats.count > 0 && (
          <button
            aria-controls="upwork-summary"
            aria-expanded={upworkOpen}
            onClick={() => setUpworkOpen(!upworkOpen)}
          >
            Upwork {upworkStats.count} {upworkOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        <button className="iconButton" title={t("dash.exportCSV")} onClick={exportCsv}><Download size={16} /></button>
      </div>
      {upworkStats.count > 0 && upworkOpen && (
        <section id="upwork-summary" className="upworkSummary" aria-label="Upwork 提案表现">
          <div><span>Upwork 提案</span><strong>{upworkStats.count}</strong></div>
          <div><span>已消耗 Connects</span><strong>{upworkStats.actualConnects}</strong></div>
          <div><span>回复</span><strong>{upworkStats.responses} · {upworkRate(upworkStats.responses, upworkStats.count)}</strong></div>
          <div><span>面试</span><strong>{upworkStats.interviews} · {upworkRate(upworkStats.interviews, upworkStats.count)}</strong></div>
          <div><span>Offer</span><strong>{upworkStats.offers}</strong></div>
          <div><span>录用</span><strong>{upworkStats.hires}</strong></div>
        </section>
      )}
      {manualOpen && (
        <section className="manualJobPanel">
          <div className="grid two">
            <Field label="公司" value={manualDraft.company} onChange={(value) => setManualDraft({ ...manualDraft, company: value })} />
            <Field label="职位" value={manualDraft.role} onChange={(value) => setManualDraft({ ...manualDraft, role: value })} />
            <Field label="职位链接" value={manualDraft.jobUrl} onChange={(value) => setManualDraft({ ...manualDraft, jobUrl: value })} />
            <Field label="来源" value={manualDraft.source} onChange={(value) => setManualDraft({ ...manualDraft, source: value })} />
            <Field label="薪酬" value={manualDraft.compensationText} onChange={(value) => setManualDraft({ ...manualDraft, compensationText: value })} />
            <Field label="最低" value={manualDraft.compensationMin} onChange={(value) => setManualDraft({ ...manualDraft, compensationMin: value })} />
            <Field label="最高" value={manualDraft.compensationMax} onChange={(value) => setManualDraft({ ...manualDraft, compensationMax: value })} />
          </div>
          <div className="pasteActions">
            {parseStatus && <span>{parseStatus}</span>}
            <select value={manualDraft.compensationCurrency} onChange={(event) => setManualDraft({ ...manualDraft, compensationCurrency: event.target.value as CompensationCurrency })}>
              <option value="">币种</option>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            <select value={manualDraft.compensationPeriod} onChange={(event) => setManualDraft({ ...manualDraft, compensationPeriod: event.target.value as CompensationPeriod })}>
              <option value="">周期</option>
              <option value="year">年</option>
              <option value="month">月</option>
              <option value="hour">小时</option>
              <option value="one-time">一次性</option>
            </select>
            <select value={manualDraft.status} onChange={(event) => setManualDraft({ ...manualDraft, status: event.target.value as ApplicationStatus })}>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <button onClick={() => void addManual()}>创建</button>
          </div>
        </section>
      )}
      {pasteOpen && (
        <section className="pasteJobPanel">
          <label>
            <span>粘贴职位信息或 Upwork 提案 — AI 仅使用此文本</span>
            <textarea rows={8} value={postingText} onChange={(event) => setPostingText(event.target.value)} />
          </label>
          <div className="pasteActions">
            {parseStatus && <span>{parseStatus}</span>}
            <button onClick={() => void parsePosting()}>使用 AI 创建</button>
          </div>
        </section>
      )}
      {pendingApplications.length > 0 && (
        <div className="pendingList">
          {pendingApplications.map((pending) => (
            <article className="pendingApplication" key={pending.id}>
              <div>
                <strong>AI 粘贴草稿已就绪</strong>
                <p>{pending.application.company} - {pending.application.role}</p>
                <small>{pending.application.source} | 保存前请检查 | {new Date(pending.application.dateApplied).toLocaleString()}</small>
              </div>
              <div className="pendingActions">
                <button onClick={() => void skipPending(pending)}>忽略</button>
                <button className="primary" onClick={() => openPendingPaste(pending)}>AI 粘贴</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {filtered.length === 0 && <Empty icon={<CalendarClock size={19} />} title={t("dash.noApplications")} body={t("dash.noApplicationsDesc")} />}
      <div className="statusFilter" aria-label="可见看板状态">
        <span><ListFilter size={14} /> 状态</span>
        <div className="statusFilterChips">
          {statuses.map((status) => {
            const statusCount = filtered.filter((app) => app.status === status).length;
            return (
              <button
                className={visibleStatuses.includes(status) ? "statusChip active" : "statusChip"}
                key={status}
                type="button"
                aria-pressed={visibleStatuses.includes(status)}
                onClick={() => toggleVisibleStatus(status)}
              >
                <span className={`statusDot status-${status.toLowerCase()}`} />
                {status}
                <strong>{statusCount}</strong>
              </button>
            );
          })}
        </div>
        <div className="statusFilterActions">
          <button type="button" onClick={() => setVisibleStatuses(defaultBoardStatuses)}>核心</button>
          <button type="button" onClick={() => setVisibleStatuses(statuses)}>全部</button>
        </div>
      </div>
      {visibleStatuses.length === 0 && filtered.length > 0 && <Empty icon={<ListFilter size={19} />} title="未选择状态" body="请至少选择一个状态以显示匹配的申请。" />}
      {visibleFiltered.length === 0 && visibleStatuses.length > 0 && filtered.length > 0 && <Empty icon={<ListFilter size={19} />} title="没有可见的匹配项" body="匹配的申请当前处于隐藏状态中。" />}
      {visibleStatuses.length > 0 && (
      <div className="applicationBoard" aria-label="申请管道">
        {visibleStatuses.map((status) => {
          const columnApplications = filtered.filter((app) => app.status === status);
          return (
            <section
              className={draggedId !== null ? "boardColumn dragReady" : "boardColumn"}
              key={status}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => draggedId !== null && void moveApplication(draggedId, status)}
            >
              <header className="boardColumnHeader">
                <span className={`statusDot status-${status.toLowerCase()}`} />
                <h3>{status}</h3>
                <span className="columnCount">{columnApplications.length}</span>
              </header>
              <div className="boardCards">
                {columnApplications.map((app) => (
                  <ApplicationRow
                    app={app}
                    onUpdate={(patch) => {
                      if (demoMode) setApplications((current) => current.map((item) => item.id === app.id ? { ...item, ...patch } : item));
                      else void db.applications.update(app.id!, patch).then(bumpApplicationsRev).then(refresh);
                    }}
                    onDelete={() => {
                      if (demoMode) setApplications((current) => current.filter((item) => item.id !== app.id));
                      else void db.applications.delete(app.id!).then(bumpApplicationsRev).then(refresh);
                    }}
                    variant="card"
                    key={app.id}
                    focused={app.id === launchApplicationId}
                    onFocused={onLaunchConsumed}
                    onDragStart={() => setDraggedId(app.id ?? null)}
                    onDragEnd={() => setDraggedId(null)}
                  />
                ))}
                {columnApplications.length === 0 && <div className="columnEmpty">将申请拖放到此处</div>}
              </div>
            </section>
          );
        })}
      </div>
      )}
    </section>
  );
}

function exportCsv() {
  // placeholder — real exportCsv is defined in App scope
}

/* ===== ApplicationRow ===== */

function ApplicationRow({
  app,
  onUpdate,
  onDelete,
  variant = "list",
  focused = false,
  onFocused,
  onDragStart,
  onDragEnd
}: {
  app: Application;
  onUpdate: (patch: Partial<Application>) => void;
  onDelete: () => void;
  variant?: "list" | "card";
  focused?: boolean;
  onFocused?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focused) return;
    setExpanded(true);
    window.requestAnimationFrame(() => {
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocused?.();
    });
  }, [focused, onFocused]);

  async function update(patch: Partial<Application>) {
    onUpdate(patch);
  }

  async function remove() {
    if (!app.id) return;
    onDelete();
  }

  return (
    <article
      ref={rowRef}
      className={`${variant === "card" ? "applicationCard" : "appRow"}${expanded ? " expanded" : ""}`}
      draggable={variant === "card" && !expanded}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="appSummary">
        <button className="rowIconButton" title={expanded ? "折叠" : "展开"} onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <div>
          <strong>{app.role || "职位"}</strong>
          <p><Building2 size={12} /> {app.company || "公司"}</p>
          {app.upwork && <small className="upworkBadge">Upwork · {app.upwork.status}</small>}
          {variant === "list" && <small>{app.status} | {dateInputValue(app.dateApplied)} | {app.source}</small>}
          {app.compensation?.text && <small>{app.compensation.text}</small>}
          {(app.location || app.workMode) && <small className="cardMeta"><MapPin size={11} /> {[app.location, app.workMode].filter(Boolean).join(" · ")}</small>}
          {variant === "card" && !app.location && !app.workMode && <small className="cardMeta"><BriefcaseBusiness size={11} /> {app.source}</small>}
        </div>
        <button className="rowIconButton danger" title="删除申请" onClick={() => void remove()}>
          <Trash2 size={15} />
        </button>
      </div>

      {expanded && (
        <div className="appDetails">
          <label>
            <span>公司</span>
            <input value={app.company} onChange={(event) => void update({ company: event.target.value })} />
          </label>
          <label>
            <span>职位</span>
            <input value={app.role} onChange={(event) => void update({ role: event.target.value })} />
          </label>
          <label>
            <span>状态</span>
            <select value={app.status} onChange={(event) => void update({ status: event.target.value as ApplicationStatus })}>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label>
            <span>申请日期</span>
            <input type="date" value={dateInputValue(app.dateApplied)} onChange={(event) => void update({ dateApplied: dateToIso(event.target.value) })} />
          </label>
          <label>
            <span>跟进日期</span>
            <input type="date" value={app.nextActionDate?.slice(0, 10) ?? ""} onChange={(event) => void update({ nextActionDate: event.target.value })} />
          </label>
          <label>
            <span>地点</span>
            <input value={app.location ?? ""} onChange={(event) => void update({ location: event.target.value })} />
          </label>
          <label>
            <span>工作模式</span>
            <select value={app.workMode ?? ""} onChange={(event) => void update({ workMode: event.target.value as Application["workMode"] })}>
              <option value="">未知</option>
              <option value="Remote">远程</option>
              <option value="Hybrid">混合</option>
              <option value="On-site">现场</option>
            </select>
          </label>
          {app.upwork && (
            <fieldset className="upworkEditor">
              <legend>Upwork 提案</legend>
              <label>
                <span>提案状态</span>
                <select value={app.upwork.status} onChange={(event) => void update(changeUpworkStatus(app, event.target.value as UpworkProposalStatus))}>
                  {UPWORK_PROPOSAL_STATUSES.map((proposalStatus) => <option key={proposalStatus}>{proposalStatus}</option>)}
                </select>
              </label>
              <label>
                <span>合同类型</span>
                <select value={app.upwork.contractType} onChange={(event) => void update({ upwork: { ...app.upwork!, contractType: event.target.value as "hourly" | "fixed" | "" } })}>
                  <option value="">未知</option>
                  <option value="hourly">按小时</option>
                  <option value="fixed">固定价格</option>
                </select>
              </label>
              <label><span>提议金额</span><input type="number" min="0" value={app.upwork.proposedAmount ?? ""} onChange={(event) => void update({ upwork: { ...app.upwork!, proposedAmount: numberOrNull(event.target.value) } })} /></label>
              <label><span>基础 Connects</span><input type="number" min="0" value={app.upwork.baseConnects ?? ""} onChange={(event) => void update({ upwork: { ...app.upwork!, baseConnects: numberOrNull(event.target.value) } })} /></label>
              <label><span>提升出价</span><input type="number" min="0" value={app.upwork.boostBid ?? ""} onChange={(event) => void update({ upwork: { ...app.upwork!, boostBid: numberOrNull(event.target.value) } })} /></label>
              <label><span>提升收费</span><input type="number" min="0" value={app.upwork.boostCharged ?? ""} onChange={(event) => void update({ upwork: { ...app.upwork!, boostCharged: numberOrNull(event.target.value) } })} /></label>
            </fieldset>
          )}
          <label>
            <span>薪酬</span>
            <input value={app.compensation?.text ?? ""} onChange={(event) => void update({ compensation: { ...(app.compensation ?? emptyCompensation()), text: event.target.value } })} />
          </label>
          <label>
            <span>币种</span>
            <select value={app.compensation?.currency ?? ""} onChange={(event) => void update({ compensation: { ...(app.compensation ?? emptyCompensation()), currency: event.target.value as CompensationCurrency } })}>
              <option value="">未知</option>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <label>
            <span>薪酬最低</span>
            <input value={app.compensation?.min ?? ""} onChange={(event) => void update({ compensation: { ...(app.compensation ?? emptyCompensation()), min: numberOrUndefined(event.target.value) } })} />
          </label>
          <label>
            <span>薪酬最高</span>
            <input value={app.compensation?.max ?? ""} onChange={(event) => void update({ compensation: { ...(app.compensation ?? emptyCompensation()), max: numberOrUndefined(event.target.value) } })} />
          </label>
          <label>
            <span>薪酬周期</span>
            <select value={app.compensation?.period ?? ""} onChange={(event) => void update({ compensation: { ...(app.compensation ?? emptyCompensation()), period: event.target.value as CompensationPeriod } })}>
              <option value="">未知</option>
              <option value="year">年</option>
              <option value="month">月</option>
              <option value="hour">小时</option>
              <option value="one-time">一次性</option>
            </select>
          </label>
          <label>
            <span>职位描述</span>
            <textarea rows={5} value={app.jobDescription ?? ""} onChange={(event) => void update({ jobDescription: event.target.value })} />
          </label>
          <label>
            <span>来源</span>
            <input value={app.source} onChange={(event) => void update({ source: event.target.value })} />
          </label>
        </div>
      )}
    </article>
  );
}

/* ===== Helpers ===== */

function dateInputValue(value: string | undefined): string {
  if (!value) return todayInputDate();
  return value.slice(0, 10);
}

function emptyCompensation() {
  return {
    text: "",
    currency: "" as CompensationCurrency,
    min: undefined,
    max: undefined,
    period: "" as CompensationPeriod
  };
}

function compensationFromDraft(draft: {
  compensationText: string;
  compensationCurrency: CompensationCurrency;
  compensationMin: string;
  compensationMax: string;
  compensationPeriod: CompensationPeriod;
}) {
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

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) throw new Error(`无效数字：${value}`);
  return parsed;
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`无效的非负数：${value}`);
  return parsed;
}

function dateToIso(value: string): string {
  if (!value) return new Date().toISOString();
  return new Date(`${value}T12:00:00`).toISOString();
}

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ===== Memory ===== */

function MemoryPanel({ memories, refresh, demoMode, setMemories }: { memories: AnswerMemory[]; refresh: () => Promise<void>; demoMode: boolean; setMemories: React.Dispatch<React.SetStateAction<AnswerMemory[]>> }) {
  const emptyDraft = { questionText: "", answer: "" };
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);
  const [status, setStatus] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  async function saveNewAnswer() {
    const questionText = draft.questionText.trim();
    const answer = draft.answer.trim();
    if (!questionText || !answer) {
      setStatus("问题和答案为必填项。");
      return;
    }

    const hash = questionHash(questionText);
    const existing = demoMode ? memories.find((memory) => memory.questionHash === hash) : await db.answerMemory.where("questionHash").equals(hash).first();
    const payload: AnswerMemory = {
      questionHash: hash,
      questionText,
      answer,
      lastUsed: new Date().toISOString(),
      editable: true
    };

    if (demoMode) {
      const next = { ...payload, id: existing?.id ?? Math.max(0, ...memories.map((memory) => memory.id ?? 0)) + 1 };
      setMemories((current) => existing?.id
        ? current.map((memory) => memory.id === existing.id ? next : memory)
        : [next, ...current]);
      setStatus(existing ? "现有演示答案已更新。" : "演示答案已添加。");
    } else if (existing?.id) {
      await db.answerMemory.update(existing.id, payload);
      setStatus("现有答案已更新。");
    } else {
      await db.answerMemory.add(payload);
      setStatus("答案已添加。");
    }
    setDraft(emptyDraft);
    if (!demoMode) await refresh();
  }

  async function addWithAi() {
    const questionText = draft.questionText.trim();
    if (!questionText) {
      setStatus("使用 AI 前需要输入问题。");
      return;
    }

    setAiBusy(true);
    setStatus("正在根据你的个人资料起草...");
    try {
      const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
      const answer = await draftSingleAnswer(questionText, profile, settings);
      if (demoMode) {
        setMemories((current) => [{ id: Math.max(0, ...current.map((memory) => memory.id ?? 0)) + 1, questionHash: questionHash(questionText), questionText, answer, lastUsed: new Date().toISOString(), editable: true }, ...current]);
      }
      setDraft({ questionText: "", answer: "" });
      setStatus(`AI 答案已添加：${answer.slice(0, 70)}${answer.length > 70 ? "..." : ""}`);
      if (!demoMode) await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiBusy(false);
    }
  }

  function startEditing(memory: AnswerMemory) {
    if (!memory.id) return;
    setEditingId(memory.id);
    setEditDraft({ questionText: memory.questionText, answer: memory.answer });
    setStatus("");
  }

  async function saveEdit(memory: AnswerMemory) {
    if (!memory.id) return;
    const questionText = editDraft.questionText.trim();
    const answer = editDraft.answer.trim();
    if (!questionText || !answer) {
      setStatus("问题和答案为必填项。");
      return;
    }
    const hash = questionHash(questionText);
    const existing = demoMode ? memories.find((item) => item.questionHash === hash) : await db.answerMemory.where("questionHash").equals(hash).first();
    if (existing?.id && existing.id !== memory.id) {
      setStatus("另一个答案已使用该问题。");
      return;
    }

    const patch = { questionHash: hash, questionText, answer, editable: true };
    if (demoMode) setMemories((current) => current.map((item) => item.id === memory.id ? { ...item, ...patch } : item));
    else await db.answerMemory.update(memory.id, patch);
    setEditingId(null);
    setEditDraft(emptyDraft);
    setStatus("答案已保存。");
    if (!demoMode) await refresh();
  }

  async function deleteAnswer(memory: AnswerMemory) {
    if (!memory.id) return;
    if (demoMode) setMemories((current) => current.filter((item) => item.id !== memory.id));
    else await db.answerMemory.delete(memory.id);
    setStatus("答案已删除。");
    if (!demoMode) await refresh();
  }

  return (
    <section className="answerList">
      <div className="answerEditor">
        <div className="sectionHeader">
          <div>
            <h2>答案库</h2>
            <p>用于筛选问题和重复申请字段的可复用答案。</p>
          </div>
        </div>
        <label>
          <span>问题</span>
          <input value={draft.questionText} onChange={(event) => setDraft({ ...draft, questionText: event.target.value })} />
        </label>
        <label>
          <span>答案</span>
          <textarea rows={4} value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} />
        </label>
        <div className="answerEditorActions">
          {status && <span>{status}</span>}
          <button className="ai" disabled={aiBusy} onClick={() => void addWithAi()}>
            <Wand2 size={15} />
            {aiBusy ? "正在添加..." : "使用 AI 添加"}
          </button>
          <button onClick={() => void saveNewAnswer()}>
            <Plus size={15} />
            添加答案
          </button>
        </div>
      </div>
      {memories.length === 0 && <Empty icon={<Sparkles size={19} />} title="暂无已记住的答案" body="已批准的 AI 草稿和复用的自由文本答案将显示在此处。" />}
      {memories.map((memory) => (
        <article className="answer" key={memory.id}>
          {editingId === memory.id ? (
            <div className="answerEditForm">
              <label>
                <span>问题</span>
                <input value={editDraft.questionText} onChange={(event) => setEditDraft({ ...editDraft, questionText: event.target.value })} />
              </label>
              <label>
                <span>答案</span>
                <textarea rows={4} value={editDraft.answer} onChange={(event) => setEditDraft({ ...editDraft, answer: event.target.value })} />
              </label>
              <div className="answerActions">
                <button onClick={() => void saveEdit(memory)}>
                  <Save size={15} />
                  保存
                </button>
                <button onClick={() => setEditingId(null)}>
                  <X size={15} />
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="answerHeader">
                <strong>{memory.questionText}</strong>
                <div className="answerActions">
                  <button onClick={() => startEditing(memory)}>编辑</button>
                  <button className="danger" onClick={() => void deleteAnswer(memory)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p>{memory.answer}</p>
            </>
          )}
        </article>
      ))}
    </section>
  );
}

/* ===== Settings ===== */

function SettingsPanel({ settings, save }: { settings: Settings; save: (settings: Settings) => Promise<void> }) {
  const [customSynonyms, setCustomSynonyms] = useState<CustomSynonymEntry[]>([]);
  const [synonymLoaded, setSynonymLoaded] = useState(false);

  useEffect(() => {
    if (!synonymLoaded) {
      loadCustomSynonyms().then((entries) => {
        setCustomSynonyms(entries);
        setSynonymLoaded(true);
      });
    }
  }, [synonymLoaded]);

  const syncCustomSynonyms = (entries: CustomSynonymEntry[]) => {
    setCustomSynonyms(entries);
    void saveCustomSynonyms(entries);
  };

  const addSynonym = () => {
    const newEntry: CustomSynonymEntry = {
      id: `cs-${Date.now()}`,
      field: "identity.firstName",
      synonyms: [""],
      enabled: true
    };
    syncCustomSynonyms([...customSynonyms, newEntry]);
  };

  const updateSynonym = (index: number, patch: Partial<CustomSynonymEntry>) => {
    const next = customSynonyms.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
    syncCustomSynonyms(next);
  };

  const removeSynonym = (index: number) => {
    syncCustomSynonyms(customSynonyms.filter((_, i) => i !== index));
  };

  const FIELD_LABELS: Record<CanonicalField, string> = {
    "identity.firstName": "名",
    "identity.middleName": "中间名",
    "identity.lastName": "姓",
    "identity.fullName": "姓名（全称）",
    "identity.email": "邮箱",
    "identity.phone": "电话",
    "identity.phoneCountryCode": "电话国家代码",
    "identity.address.line1": "地址1",
    "identity.address.line2": "地址2",
    "identity.address.postalCode": "邮编",
    "identity.location.city": "城市",
    "identity.location.state": "省份/州",
    "identity.location.country": "国家",
    "identity.links.linkedin": "领英",
    "identity.links.github": "GitHub",
    "identity.links.portfolio": "个人网站",
    "profile.summary": "自我评价",
    "workAuthorization.usAuthorized": "美国工作授权",
    "workAuthorization.requiresSponsorship": "需要签证担保",
    "workAuthorization.visaStatus": "签证状态",
    "workAuthorization.englishProficiency": "英语水平",
    "applicationDefaults.referralSource": "信息来源",
    "applicationDefaults.referralDetails": "其他来源说明",
    "applicationDefaults.employeeReferralName": "推荐人",
    "applicationDefaults.needsRecruitmentAdjustments": "需要合理便利",
    "applicationDefaults.recruitmentAdjustmentsDetails": "便利说明",
    "applicationDefaults.previouslyEmployedByFitch": "曾在费奇任职",
    "applicationDefaults.currentEmployer": "当前公司",
    "applicationDefaults.currentTitle": "当前职位",
    "applicationDefaults.currentSalary": "当前薪资",
    "applicationDefaults.desiredSalary": "期望薪资",
    "applicationDefaults.salaryCurrency": "薪资币种",
    "applicationDefaults.profileVisibility": "简历可见性",
    "applicationDefaults.jobNotifications": "职位通知",
    "demographics.gender": "性别",
    "demographics.race": "种族",
    "demographics.veteran": "退伍军人",
    "demographics.disability": "残疾状态"
  };

  return (
    <section className="panel">
      <button
        className="demoModeButton"
        type="button"
        aria-pressed={settings.demoMode}
        onClick={() => void save({ ...settings, demoMode: !settings.demoMode })}
      >
        <Sparkles size={15} />
        {settings.demoMode ? t("dash.exitDemo") : t("dash.enterDemo")}
      </button>
      <label className="field">
        <span>主题</span>
        <select value={settings.theme} onChange={(event) => void save({ ...settings, theme: event.target.value as ThemeMode })}>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
      </label>
      <label className="field">
        <span>默认跟踪录入方式</span>
        <select
          value={settings.trackingEntryMode}
          onChange={(event) => void save({ ...settings, trackingEntryMode: event.target.value as TrackingEntryMode })}
        >
          <option value="manual">手动表单</option>
          <option value="ai">使用 AI 粘贴文本</option>
        </select>
      </label>
      <details style={{ marginBottom: 12, fontSize: 12, color: "#94a3b8", cursor: "pointer" }}>
        <summary>AI 设置（点击展开）</summary>
        <div style={{ marginTop: 8 }}>
          <Field label="OpenAI API 密钥" type="password" value={settings.apiKey} onChange={(value) => void save({ ...settings, apiKey: value })} />
          <Field label="模型" value={settings.model} onChange={(value) => void save({ ...settings, model: value })} />
        </div>
      </details>
      <label>
        <input type="checkbox" checked={settings.cardBadges} onChange={(event) => void save({ ...settings, cardBadges: event.target.checked })} />
        {" "}在职位搜索卡片上显示匹配徽章（重新加载页面后生效）
      </label>
      <div className="siteGrid">
        {Object.entries(settings.enabledSites).map(([site, enabled]) => (
          <label key={site}><input type="checkbox" checked={enabled} onChange={(event) => void save({ ...settings, enabledSites: { ...settings.enabledSites, [site]: event.target.checked } })} /> {site}</label>
        ))}
      </div>

      <hr />
      <h3><FileText size={15} /> 中文字段映射字典</h3>
      <p className="hint">填写中文表单时，遇到以下同义词将自动匹配到对应的个人资料字段。可自由增删。</p>
      <div className="synonymList">
        <div className="synonymRow synonymRowHead">
          <span>目标字段</span>
          <span>同义词（逗号分隔）</span>
          <span style={{ textAlign: "center" }}>开关</span>
        </div>
        {customSynonyms.map((entry, index) => (
          <div className="synonymRow" key={entry.id}>
            <select
              value={entry.field}
              onChange={(event) => updateSynonym(index, { field: event.target.value as CanonicalField })}
            >
              {(Object.keys(FIELD_LABELS) as CanonicalField[]).map((f) => (
                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
              ))}
            </select>
            <input
              value={entry.synonyms.join(", ")}
              placeholder="例如: 姓名, 名字, 您的名字"
              onChange={(event) => updateSynonym(index, { synonyms: event.target.value.split(/,\s*/).filter(Boolean) })}
            />
            <label className="synonymToggle" title={entry.enabled ? "点击关闭" : "点击开启"}>
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={(event) => updateSynonym(index, { enabled: event.target.checked })}
              />
              <span className="synonymToggleSlider" />
            </label>
          </div>
        ))}
      </div>
      <div className="synonymActions">
        <button type="button" className="addSynonymButton" onClick={addSynonym}>
          <Plus size={13} /> 添加映射
        </button>
        <button type="button" className="toggleAllButton" onClick={() => syncCustomSynonyms(customSynonyms.map(e => ({ ...e, enabled: true })))}>
          全部开启
        </button>
        <button type="button" className="toggleAllButton" onClick={() => syncCustomSynonyms(customSynonyms.map(e => ({ ...e, enabled: false })))}>
          全部关闭
        </button>
      </div>
    </section>
  );
}

/* ===== Section ===== */

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="profileSection">
      <button type="button" className="sectionToggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <div className="profileSectionHeading">
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
      </button>
      {open && children}
    </div>
  );
}

/* ===== SkillsEditor ===== */

type SkillRow = { name: string; years: string; note: string; services: string };

function skillsToRows(skills: Profile["skills"]): SkillRow[] {
  return Object.entries(skills).map(([name, fact]) => ({
    name,
    years: String(fact.years),
    note: fact.note,
    services: fact.services?.join(", ") ?? ""
  }));
}

function rowsToSkills(rows: SkillRow[]): Profile["skills"] {
  const skills: Profile["skills"] = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    skills[name] = {
      years: Number(row.years) || 0,
      note: row.note.trim(),
      services: commaList(row.services)
    };
  }
  return skills;
}

function SkillsEditor({ skills, onCommit }: { skills: Profile["skills"]; onCommit: (skills: Profile["skills"]) => void }) {
  const [rows, setRows] = useState<SkillRow[]>(() => skillsToRows(skills));
  useEffect(() => setRows(skillsToRows(skills)), [skills]);

  const edit = (index: number, patch: Partial<SkillRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const commit = (nextRows: SkillRow[]) => {
    const parsed = rowsToSkills(nextRows);
    if (JSON.stringify(parsed) !== JSON.stringify(skills)) onCommit(parsed);
  };
  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    commit(next);
  };

  return (
    <div className="factList" onBlur={() => commit(rows)}>
      <div className="skillRow skillRowHead">
        <span>技能</span>
        <span>年限</span>
        <span>备注</span>
        <span>服务</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div className="skillRow" key={index}>
          <input placeholder="技能名称" value={row.name} onChange={(event) => edit(index, { name: event.target.value })} />
          <input type="number" min="0" value={row.years} onChange={(event) => edit(index, { years: event.target.value })} />
          <input placeholder="备注" value={row.note} onChange={(event) => edit(index, { note: event.target.value })} />
          <input placeholder="逗号分隔" value={row.services} onChange={(event) => edit(index, { services: event.target.value })} />
          <button type="button" className="factRemove" title="删除技能" onClick={() => remove(index)}>
            <X size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="factAdd" onClick={() => setRows([...rows, { name: "", years: "0", note: "", services: "" }])}>
        <Plus size={14} />
        添加技能
      </button>
    </div>
  );
}

/* ===== ExperienceEditor ===== */

type ExperienceRow = { title: string; company: string; start: string; end: string; highlights: string; stack: string };

function experienceToRows(experience: Experience[]): ExperienceRow[] {
  return experience.map((item) => ({
    title: item.title,
    company: item.company,
    start: item.start,
    end: item.end,
    highlights: item.highlights.join("\n"),
    stack: item.stack.join(", ")
  }));
}

function rowsToExperience(rows: ExperienceRow[]): Experience[] {
  return rows
    .filter((row) => row.title.trim() || row.company.trim())
    .map((row) => ({
      title: row.title.trim(),
      company: row.company.trim(),
      start: row.start.trim(),
      end: row.end.trim(),
      highlights: lineList(row.highlights),
      stack: commaList(row.stack)
    }));
}

function ExperienceEditor({ experience, onCommit }: { experience: Experience[]; onCommit: (experience: Experience[]) => void }) {
  const [rows, setRows] = useState<ExperienceRow[]>(() => experienceToRows(experience));
  useEffect(() => setRows(experienceToRows(experience)), [experience]);

  const edit = (index: number, patch: Partial<ExperienceRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const commit = (nextRows: ExperienceRow[]) => {
    const parsed = rowsToExperience(nextRows);
    if (JSON.stringify(parsed) !== JSON.stringify(experience)) onCommit(parsed);
  };
  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    commit(next);
  };

  return (
    <div className="factList" onBlur={() => commit(rows)}>
      {rows.map((row, index) => (
        <div className="factCard" key={index}>
          <div className="factCardHeader">
            <strong>{row.title.trim() || row.company.trim() || "新职位"}</strong>
            <button type="button" className="factRemove" title="删除职位" onClick={() => remove(index)}>
              <X size={13} />
            </button>
          </div>
          <div className="grid two">
            <Field label="职位" value={row.title} onChange={(value) => edit(index, { title: value })} />
            <Field label="公司" value={row.company} onChange={(value) => edit(index, { company: value })} />
            <Field label="开始（例如 2023年1月）" value={row.start} onChange={(value) => edit(index, { start: value })} />
            <Field label="结束（例如 2023年9月 或 至今）" value={row.end} onChange={(value) => edit(index, { end: value })} />
          </div>
          <label className="field">
            <span>职责/亮点，每行一个</span>
            <textarea rows={3} value={row.highlights} onChange={(event) => edit(index, { highlights: event.target.value })} />
          </label>
          <Field label="技术栈，逗号分隔" value={row.stack} onChange={(value) => edit(index, { stack: value })} />
        </div>
      ))}
      <button
        type="button"
        className="factAdd"
        onClick={() => setRows([...rows, { title: "", company: "", start: "", end: "", highlights: "", stack: "" }])}
      >
        <Plus size={14} />
        添加职位
      </button>
    </div>
  );
}

/* ===== ProjectsEditor ===== */

type ProjectRow = {
  name: string;
  role: string;
  start: string;
  end: string;
  description: string;
  highlights: string;
  stack: string;
  url: string;
  repository: string;
};

function projectsToRows(projects: PersonalProject[]): ProjectRow[] {
  return projects.map((project) => ({
    name: project.name,
    role: project.role,
    start: project.start,
    end: project.end,
    description: project.description,
    highlights: project.highlights.join("\n"),
    stack: project.stack.join(", "),
    url: project.url,
    repository: project.repository
  }));
}

function rowsToProjects(rows: ProjectRow[]): PersonalProject[] {
  return rows
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      role: row.role.trim(),
      start: row.start.trim(),
      end: row.end.trim(),
      description: row.description.trim(),
      highlights: lineList(row.highlights),
      stack: commaList(row.stack),
      url: row.url.trim(),
      repository: row.repository.trim()
    }));
}

function ProjectsEditor({ projects, onCommit }: { projects: PersonalProject[]; onCommit: (projects: PersonalProject[]) => void }) {
  const [rows, setRows] = useState<ProjectRow[]>(() => projectsToRows(projects));
  useEffect(() => setRows(projectsToRows(projects)), [projects]);

  const edit = (index: number, patch: Partial<ProjectRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const commit = (nextRows: ProjectRow[]) => {
    const parsed = rowsToProjects(nextRows);
    if (JSON.stringify(parsed) !== JSON.stringify(projects)) onCommit(parsed);
  };
  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    commit(next);
  };

  return (
    <div className="factList" onBlur={() => commit(rows)}>
      {rows.map((row, index) => (
        <div className="factCard" key={index}>
          <div className="factCardHeader">
            <strong>{row.name.trim() || "新项目"}</strong>
            <button type="button" className="factRemove" title="删除项目" onClick={() => remove(index)}>
              <X size={13} />
            </button>
          </div>
          <div className="grid two">
            <Field label="名称" value={row.name} onChange={(value) => edit(index, { name: value })} />
            <Field label="角色" value={row.role} onChange={(value) => edit(index, { role: value })} />
            <Field label="开始时间" value={row.start} onChange={(value) => edit(index, { start: value })} />
            <Field label="结束时间" value={row.end} onChange={(value) => edit(index, { end: value })} />
          </div>
          <label className="field">
            <span>描述</span>
            <textarea rows={2} value={row.description} onChange={(event) => edit(index, { description: event.target.value })} />
          </label>
          <label className="field">
            <span>亮点，每行一个</span>
            <textarea rows={3} value={row.highlights} onChange={(event) => edit(index, { highlights: event.target.value })} />
          </label>
          <div className="grid two">
            <Field label="技术栈，逗号分隔" value={row.stack} onChange={(value) => edit(index, { stack: value })} />
            <Field label="网址" value={row.url} onChange={(value) => edit(index, { url: value })} />
            <Field label="仓库" value={row.repository} onChange={(value) => edit(index, { repository: value })} />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="factAdd"
        onClick={() =>
          setRows([...rows, { name: "", role: "", start: "", end: "", description: "", highlights: "", stack: "", url: "", repository: "" }])
        }
      >
        <Plus size={14} />
        添加项目
      </button>
    </div>
  );
}

/* ===== Utility Helpers ===== */

function commaList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function lineList(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("无法读取简历 PDF。"));
        return;
      }
      resolve(reader.result);
    });
    reader.addEventListener("error", () => reject(new Error("Unable to read CV PDF.")));
    reader.readAsDataURL(file);
  });
}

createRoot(document.getElementById("root")!).render(<App />);