import { useEffect, useRef, useState, type ReactNode } from "react";
import { getProfile, saveProfile } from "../../lib/storage";
import type { ExtensionMessage, Profile } from "../../lib/schema";

export default function ProfileTab({ demoMode, onOpenDashboard }: { demoMode: boolean; onOpenDashboard: () => void }) {
  // Owns its profile copy (seeded once) instead of syncing from storage while
  // mounted, so an autosave landing mid-edit can't clobber in-progress typing.
  const [profile, setProfile] = useState<Profile>();
  const [saveStatus, setSaveStatus] = useState("已保存");
  const [smartAddText, setSmartAddText] = useState("");
  const [smartAddStatus, setSmartAddStatus] = useState("");
  const [smartAdding, setSmartAdding] = useState(false);
  const profileSaveReady = useRef(false);

  useEffect(() => {
    void getProfile().then(setProfile);
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (!profileSaveReady.current) {
      profileSaveReady.current = true;
      return;
    }
    if (demoMode) {
      setSaveStatus("演示模式临时更改");
      return;
    }
    setSaveStatus("正在保存...");
    const timer = window.setTimeout(() => {
      void saveProfile(profile)
        .then(() => setSaveStatus(`已保存 ${new Date().toLocaleTimeString()}`))
        .catch((error: unknown) => setSaveStatus(error instanceof Error ? error.message : String(error)));
    }, 550);
    return () => window.clearTimeout(timer);
  }, [profile, demoMode]);

  if (!profile) return <p className="jtMuted">正在加载个人资料...</p>;

  function updateProfile(path: string, value: string | boolean) {
    setProfile((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const keys = path.split(".");
      let cursor = next as unknown as Record<string, unknown>;
      for (const key of keys.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
      cursor[keys.at(-1)!] = value;
      return next;
    });
  }

  function replaceList(path: "eligibleCountries" | "timezonesComfortable", value: string) {
    setProfile((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.workAuthorization[path] = value.split(",").map((item) => item.trim()).filter(Boolean);
      return next;
    });
  }

  async function smartAdd() {
    if (smartAdding) return;
    setSmartAdding(true);
    setSmartAddStatus("正在读取你的笔记...");
    try {
      const response = await chrome.runtime.sendMessage({ kind: "AI_ENRICH_PROFILE", text: smartAddText } satisfies ExtensionMessage);
      if (!response?.ok) throw new Error(response?.error ?? "个人资料智能填充失败。");
      setProfile(response.profile as Profile);
      setSmartAddText("");
      setSmartAddStatus("个人资料已更新。请检查以下部分。");
    } catch (error) {
      setSmartAddStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSmartAdding(false);
    }
  }

  const skillCount = Object.keys(profile.skills).length;
  const name = `${profile.identity.firstName} ${profile.identity.lastName}`.trim();

  return (
    <div className="jtMatch">
      <div className="jtScoreRow">
        <span className="jtScoreLabel">{name || "添加你的详细信息"}</span>
        <span className="jtNotice">{saveStatus}</span>
      </div>

      <div className="jtChipGroup">
        <p className="jtChipHeading">智能添加</p>
        <textarea
          className="jtTextarea"
          rows={4}
          placeholder="粘贴项目笔记、简历文本、个人简介、技能或任何要添加的信息..."
          value={smartAddText}
          onChange={(event) => setSmartAddText(event.target.value)}
        />
        <button className="jtButton" disabled={smartAdding || !smartAddText.trim()} onClick={() => void smartAdd()}>
          {smartAdding ? "正在添加..." : "使用 AI 添加"}
        </button>
        {smartAddStatus && <p className="jtNotice">{smartAddStatus}</p>}
      </div>

      <div className="jtChipGroup">
        <p className="jtChipHeading">技能、经验与项目</p>
        <p className="jtMuted">
          {skillCount} 项技能 · {profile.experience.length} 个职位 · {profile.personalProjects.length} 个项目
        </p>
        <button className="jtButtonGhost" onClick={onOpenDashboard}>
          在仪表盘中编辑
        </button>
      </div>

      <ProfileSection title="补充答案知识">
        <label className="jtField">
          <span>已完成的问题与答案和其他有用信息</span>
          <textarea
            className="jtTextarea"
            rows={6}
            value={profile.additionalKnowledge}
            onChange={(event) => updateProfile("additionalKnowledge", event.target.value)}
            placeholder="粘贴 AI 应记住以供未来答案参考的信息..."
          />
        </label>
      </ProfileSection>

      <ProfileSection title="身份与联系方式" open>
        <div className="jtProfileGrid">
          <ProfileField label="名" value={profile.identity.firstName} onChange={(value) => updateProfile("identity.firstName", value)} />
          <ProfileField label="中间名" value={profile.identity.middleName} onChange={(value) => updateProfile("identity.middleName", value)} />
          <ProfileField label="姓" value={profile.identity.lastName} onChange={(value) => updateProfile("identity.lastName", value)} />
          <ProfileField label="偏好称呼" value={profile.identity.preferredName} onChange={(value) => updateProfile("identity.preferredName", value)} />
          <ProfileField label="邮箱" value={profile.identity.email} onChange={(value) => updateProfile("identity.email", value)} wide />
          <ProfileField label="国家代码" value={profile.identity.phoneCountryCode} onChange={(value) => updateProfile("identity.phoneCountryCode", value)} />
          <ProfileField label="电话" value={profile.identity.phone} onChange={(value) => updateProfile("identity.phone", value)} />
          <ProfileField label="地址行 1" value={profile.identity.address.line1} onChange={(value) => updateProfile("identity.address.line1", value)} wide />
          <ProfileField label="地址行 2" value={profile.identity.address.line2} onChange={(value) => updateProfile("identity.address.line2", value)} wide />
          <ProfileField label="邮政编码" value={profile.identity.address.postalCode} onChange={(value) => updateProfile("identity.address.postalCode", value)} />
          <ProfileField label="城市" value={profile.identity.location.city} onChange={(value) => updateProfile("identity.location.city", value)} />
          <ProfileField label="州/省" value={profile.identity.location.state} onChange={(value) => updateProfile("identity.location.state", value)} />
          <ProfileField label="国家" value={profile.identity.location.country} onChange={(value) => updateProfile("identity.location.country", value)} />
          <ProfileField label="LinkedIn" value={profile.identity.links.linkedin} onChange={(value) => updateProfile("identity.links.linkedin", value)} wide />
          <ProfileField label="GitHub" value={profile.identity.links.github} onChange={(value) => updateProfile("identity.links.github", value)} wide />
          <ProfileField label="作品集" value={profile.identity.links.portfolio} onChange={(value) => updateProfile("identity.links.portfolio", value)} wide />
        </div>
      </ProfileSection>

      <ProfileSection title="授权与默认设置">
        <ProfileToggle label="美国授权" checked={profile.workAuthorization.usAuthorized} onChange={(value) => updateProfile("workAuthorization.usAuthorized", value)} />
        <ProfileToggle label="需要赞助" checked={profile.workAuthorization.requiresSponsorship} onChange={(value) => updateProfile("workAuthorization.requiresSponsorship", value)} />
        <ProfileToggle label="需要招聘调整" checked={profile.applicationDefaults.needsRecruitmentAdjustments} onChange={(value) => updateProfile("applicationDefaults.needsRecruitmentAdjustments", value)} />
        <ProfileToggle label="职位通知" checked={profile.applicationDefaults.jobNotifications} onChange={(value) => updateProfile("applicationDefaults.jobNotifications", value)} />
        <div className="jtProfileGrid">
          <ProfileField label="签证状态" value={profile.workAuthorization.visaStatus} onChange={(value) => updateProfile("workAuthorization.visaStatus", value)} wide />
          <ProfileField label="英语水平" value={profile.workAuthorization.englishProficiency} onChange={(value) => updateProfile("workAuthorization.englishProficiency", value)} wide />
          <ProfileField label="符合条件的国家" value={profile.workAuthorization.eligibleCountries.join(", ")} onChange={(value) => replaceList("eligibleCountries", value)} wide />
          <ProfileField label="时区" value={profile.workAuthorization.timezonesComfortable.join(", ")} onChange={(value) => replaceList("timezonesComfortable", value)} wide />
          <ProfileField label="推荐来源" value={profile.applicationDefaults.referralSource} onChange={(value) => updateProfile("applicationDefaults.referralSource", value)} />
          <ProfileField label="推荐详情" value={profile.applicationDefaults.referralDetails} onChange={(value) => updateProfile("applicationDefaults.referralDetails", value)} />
          <ProfileField label="当前雇主" value={profile.applicationDefaults.currentEmployer} onChange={(value) => updateProfile("applicationDefaults.currentEmployer", value)} />
          <ProfileField label="当前职位" value={profile.applicationDefaults.currentTitle} onChange={(value) => updateProfile("applicationDefaults.currentTitle", value)} />
          <ProfileField label="当前薪资" value={profile.applicationDefaults.currentSalary} onChange={(value) => updateProfile("applicationDefaults.currentSalary", value)} />
          <ProfileField label="期望薪资" value={profile.applicationDefaults.desiredSalary} onChange={(value) => updateProfile("applicationDefaults.desiredSalary", value)} />
          <ProfileField label="薪资币种" value={profile.applicationDefaults.salaryCurrency} onChange={(value) => updateProfile("applicationDefaults.salaryCurrency", value)} />
        </div>
      </ProfileSection>

      <ProfileSection title="可选人口统计信息">
        <div className="jtProfileGrid">
          <ProfileField label="性别" value={profile.demographics.gender} onChange={(value) => updateProfile("demographics.gender", value)} />
          <ProfileField label="民族" value={profile.demographics.race} onChange={(value) => updateProfile("demographics.race", value)} />
          <ProfileField label="退伍军人身份" value={profile.demographics.veteran} onChange={(value) => updateProfile("demographics.veteran", value)} />
          <ProfileField label="残疾状况" value={profile.demographics.disability} onChange={(value) => updateProfile("demographics.disability", value)} />
        </div>
      </ProfileSection>
    </div>
  );
}

function ProfileSection({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="jtProfileSection" open={open}>
      <summary>{title}</summary>
      <div className="jtProfileSectionBody">{children}</div>
    </details>
  );
}

function ProfileField({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return (
    <label className={wide ? "jtField jtFieldWide" : "jtField"}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ProfileToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="jtToggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}
    </label>
  );
}
