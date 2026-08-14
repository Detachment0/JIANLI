/** 填充结果类型定义 */

export type FillStatus =
  | "filled"         // 成功填充
  | "partial"        // 部分填充（多段溢出）
  | "skipped"        // 已跳过（法律确认字段）
  | "no_match"       // 未匹配到中文字典
  | "no_data"        // 配置文件中无此数据
  | "fill_error"     // 写入后页面拒绝/覆盖
  | "custom_component"; // 自定义组件（引擎不支持）

export interface FillEntry {
  label: string;           // 页面上的标签
  canonicalField: string;  // 规范字段名 (如 identity.firstName)
  value: string;           // 填入的值（空字符串表示未填）
  status: FillStatus;
  reason: string;          // 人类可读的原因
  module: string;          // 模块名
  suggestion?: string;     // 行动建议
}

export interface FillResult {
  ok: boolean;
  entries: FillEntry[];
  summary: {
    filled: number;
    partial: number;
    skipped: number;
    no_match: number;
    no_data: number;
    total: number;
    percentage: number;
  };
  moduleStats: Array<{ module: string; filled: number; total: number }>;
  timestamp: number;
  url: string;
}

export function buildFillResult(entries: FillEntry[]): FillResult {
  const filled = entries.filter((e) => e.status === "filled").length;
  const partial = entries.filter((e) => e.status === "partial").length;
  const skipped = entries.filter((e) => e.status === "skipped" || e.status === "custom_component").length;
  const no_match = entries.filter((e) => e.status === "no_match").length;
  const no_data = entries.filter((e) => e.status === "no_data").length;
  const total = entries.length;

  const moduleMap = new Map<string, { filled: number; total: number }>();
  for (const entry of entries) {
    const m = moduleMap.get(entry.module) ?? { filled: 0, total: 0 };
    m.total++;
    if (entry.status === "filled" || entry.status === "partial") m.filled++;
    moduleMap.set(entry.module, m);
  }

  return {
    ok: true,
    entries,
    summary: { filled, partial, skipped, no_match, no_data, total, percentage: total > 0 ? Math.round(filled / total * 100) : 0 },
    moduleStats: Array.from(moduleMap.entries())
      .map(([module, stats]) => ({ module, ...stats }))
      .sort((a, b) => b.total - a.total),
    timestamp: Date.now(),
    url: location.href
  };
}

/** 规范字段 → 模块名映射 */
const CANONICAL_MODULE: Record<string, string> = {
  "identity.firstName": "基本信息",
  "identity.middleName": "基本信息",
  "identity.lastName": "基本信息",
  "identity.preferredName": "基本信息",
  "identity.email": "联系方式",
  "identity.phone": "联系方式",
  "identity.phoneCountryCode": "联系方式",
  "identity.address.line1": "地址",
  "identity.address.line2": "地址",
  "identity.address.postalCode": "地址",
  "identity.location.city": "地址",
  "identity.location.state": "地址",
  "identity.location.country": "地址",
  "identity.links.linkedin": "个人主页",
  "identity.links.github": "个人主页",
  "identity.links.portfolio": "个人主页",
  "workAuthorization.usAuthorized": "工作资格",
  "workAuthorization.requiresSponsorship": "工作资格",
  "workAuthorization.visaStatus": "工作资格",
  "workAuthorization.englishProficiency": "工作资格",
  "applicationDefaults.referralSource": "求职偏好",
  "applicationDefaults.referralDetails": "求职偏好",
  "applicationDefaults.employeeReferralName": "求职偏好",
  "applicationDefaults.needsRecruitmentAdjustments": "求职偏好",
  "applicationDefaults.recruitmentAdjustmentsDetails": "求职偏好",
  "applicationDefaults.previouslyEmployedByFitch": "求职偏好",
  "applicationDefaults.currentEmployer": "工作信息",
  "applicationDefaults.currentTitle": "工作信息",
  "applicationDefaults.currentSalary": "薪资信息",
  "applicationDefaults.desiredSalary": "薪资信息",
  "applicationDefaults.salaryCurrency": "薪资信息",
  "applicationDefaults.profileVisibility": "求职偏好",
  "applicationDefaults.jobNotifications": "求职偏好",
  "demographics.gender": "人口统计",
  "demographics.race": "人口统计",
  "demographics.veteran": "人口统计",
  "demographics.disability": "人口统计"
};

export function moduleForCanonical(canonical: string): string {
  return CANONICAL_MODULE[canonical] ?? "其他";
}

/** 原因 → 行动建议 */
const REASON_SUGGESTION: Record<string, string> = {
  no_data: "建议：去仪表盘补充此信息",
  no_match: "建议：在仪表盘设置中增加中文字段映射",
  legal_skip: "建议：手动勾选此确认项",
  custom_component: "建议：手动填写此字段",
  fill_error: "建议：手动检查此字段值是否正确",
  multi_overflow: "建议：扩展只填了第 1 段，其余段需手动添加"
};

export function suggestionForReason(reason: string): string {
  return REASON_SUGGESTION[reason] ?? "";
}

/** 信号 → 规范字段名 */
export function signalToCanonical(signal: string): string | undefined {
  const s = signal;
  if (hasAny(s, ["first name", "firstname", "given name"])) return "identity.firstName";
  if (hasAny(s, ["middle name", "middlename"])) return "identity.middleName";
  if (hasAny(s, ["last name", "lastname", "surname", "family name"])) return "identity.lastName";
  if (hasAny(s, ["preferred name", "preferredname"])) return "identity.preferredName";
  if (hasAny(s, ["email", "e mail"])) return "identity.email";
  if (hasAny(s, ["country code", "phone country code", "dialing code", "dialling code"])) return "identity.phoneCountryCode";
  if (hasAny(s, ["phone", "mobile", "telephone"])) return "identity.phone";
  if (hasAny(s, ["linkedin"])) return "identity.links.linkedin";
  if (hasAny(s, ["github"])) return "identity.links.github";
  if (hasAny(s, ["portfolio", "personal website", "website"])) return "identity.links.portfolio";
  if (hasAny(s, ["address line 1", "address 1", "street address"])) return "identity.address.line1";
  if (hasAny(s, ["address line 2", "address 2", "apartment", "suite"])) return "identity.address.line2";
  if (hasAny(s, ["postal code", "zip code", " zip "])) return "identity.address.postalCode";
  if (hasAny(s, ["city"])) return "identity.location.city";
  if (hasAny(s, ["state", "province", "region"])) return "identity.location.state";
  if (hasAny(s, ["country"])) return "identity.location.country";
  if (hasAny(s, ["visa status", "immigration status"])) return "identity.workAuthorization.visaStatus";
  if (hasAny(s, ["sponsorship", "sponsor"])) return "workAuthorization.requiresSponsorship";
  if (hasAny(s, ["authorized", "authorization"])) return "workAuthorization.usAuthorized";
  if (hasAny(s, ["english proficiency", "english level", "spoken english"])) return "workAuthorization.englishProficiency";
  if (hasAny(s, ["how did you hear", "referral source"])) return "applicationDefaults.referralSource";
  if (hasAny(s, ["if other please provide details"])) return "applicationDefaults.referralDetails";
  if (hasAny(s, ["employee referral", "referral name"])) return "applicationDefaults.employeeReferralName";
  if (hasAny(s, ["reasonable adjustments", "recruitment adjustments", "accommodations"])) return "applicationDefaults.needsRecruitmentAdjustments";
  if (hasAny(s, ["if yes please specify", "adjustment details"])) return "applicationDefaults.recruitmentAdjustmentsDetails";
  if (hasAny(s, ["previously employed by fitch"])) return "applicationDefaults.previouslyEmployedByFitch";
  if (hasAny(s, ["current employer", "current company"])) return "applicationDefaults.currentEmployer";
  if (hasAny(s, ["current title", "current job title"])) return "applicationDefaults.currentTitle";
  if (hasAny(s, ["current salary", "current compensation"])) return "applicationDefaults.currentSalary";
  if (hasAny(s, ["desired salary", "salary expectation", "expected salary"])) return "applicationDefaults.desiredSalary";
  if (hasAny(s, ["currency"])) return "applicationDefaults.salaryCurrency";
  if (hasAny(s, ["make my profile visible", "profile visibility"])) return "applicationDefaults.profileVisibility";
  if (hasAny(s, ["job posting notifications", "job notifications", "notification"])) return "applicationDefaults.jobNotifications";
  if (hasAny(s, ["self identified gender", "gender identity"])) return "demographics.gender";
  if (hasAny(s, ["ethnic origin", "ethnicity"])) return "demographics.race";
  if (hasAny(s, ["veteran status", "protected veteran"])) return "demographics.veteran";
  if (hasAny(s, ["consider yourself to have a disability", "disability status", "long term condition"])) return "demographics.disability";
  return undefined;
}

function hasAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}