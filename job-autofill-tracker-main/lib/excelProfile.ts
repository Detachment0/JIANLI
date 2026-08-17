/**
 * Excel 简历导入 / 模板下载
 *
 * 设计：
 * - 模板为 2 行：第 1 行是表头（英文，支持中英文双向匹配），第 2 行是示例值
 * - 解析时按表头匹配 Profile 路径，未匹配的表头会汇报给用户
 * - 布尔字段（requiresSponsorship 等）接受 "是/否"、"yes/no"、"true/false"
 *
 * 注意：模板只有 2 行，所以 sheet_to_json 默认的行为（把第 1 行当表头）正好是正确的。
 */

import * as XLSX from "xlsx";
import type { Profile } from "./schema";

/** Excel 表头 → Profile 点分路径。键在使用前会 trim() 处理。 */
const HEADER_TO_PATH: Record<string, string> = {
  // 基本信息
  "First Name": "identity.firstName",
  "名": "identity.firstName",
  "名字": "identity.firstName",
  "Middle Name": "identity.middleName",
  "中间名": "identity.middleName",
  "Last Name": "identity.lastName",
  "姓": "identity.lastName",
  "姓氏": "identity.lastName",
  "Full Name": "identity.fullName",
  "全名": "identity.fullName",
  "Preferred Name": "identity.preferredName",
  "昵称": "identity.preferredName",

  // 联系方式
  "Email": "identity.email",
  "邮箱": "identity.email",
  "电子邮件": "identity.email",
  "Phone": "identity.phone",
  "电话": "identity.phone",
  "手机": "identity.phone",
  "Phone Country Code": "identity.phoneCountryCode",
  "电话国家代码": "identity.phoneCountryCode",
  "国家代码": "identity.phoneCountryCode",

  // 地址
  "Address Line 1": "identity.address.line1",
  "地址行 1": "identity.address.line1",
  "街道地址": "identity.address.line1",
  "Address Line 2": "identity.address.line2",
  "地址行 2": "identity.address.line2",
  "Postal Code": "identity.address.postalCode",
  "邮政编码": "identity.address.postalCode",
  "邮编": "identity.address.postalCode",
  "City": "identity.location.city",
  "城市": "identity.location.city",
  "State": "identity.location.state",
  "州/省": "identity.location.state",
  "省份": "identity.location.state",
  "Country": "identity.location.country",
  "国家": "identity.location.country",

  // 链接
  "LinkedIn": "identity.links.linkedin",
  "GitHub": "identity.links.github",
  "Portfolio": "identity.links.portfolio",
  "作品集": "identity.links.portfolio",
  "Website": "identity.links.website",
  "个人网站": "identity.links.website",

  // 工作资格
  "US Work Authorized": "workAuthorization.usAuthorized",
  "美国工作授权": "workAuthorization.usAuthorized",
  "Requires Sponsorship": "workAuthorization.requiresSponsorship",
  "需要签证赞助": "workAuthorization.requiresSponsorship",
  "Visa Status": "workAuthorization.visaStatus",
  "签证状态": "workAuthorization.visaStatus",
  "English Proficiency": "workAuthorization.englishProficiency",
  "英语水平": "workAuthorization.englishProficiency",

  // 求职偏好
  "Referral Source": "applicationDefaults.referralSource",
  "推荐来源": "applicationDefaults.referralSource",
  "Referral Details": "applicationDefaults.referralDetails",
  "推荐详情": "applicationDefaults.referralDetails",
  "Employee Referral Name": "applicationDefaults.employeeReferralName",
  "员工推荐人姓名": "applicationDefaults.employeeReferralName",
  "Needs Recruitment Adjustments": "applicationDefaults.needsRecruitmentAdjustments",
  "需要招聘调整": "applicationDefaults.needsRecruitmentAdjustments",
  "Recruitment Adjustments Details": "applicationDefaults.recruitmentAdjustmentsDetails",
  "招聘调整详情": "applicationDefaults.recruitmentAdjustmentsDetails",
  "Previously Employed By Fitch": "applicationDefaults.previouslyEmployedByFitch",
  "Current Employer": "applicationDefaults.currentEmployer",
  "当前雇主": "applicationDefaults.currentEmployer",
  "当前公司": "applicationDefaults.currentEmployer",
  "Current Title": "applicationDefaults.currentTitle",
  "当前职位": "applicationDefaults.currentTitle",
  "Current Salary": "applicationDefaults.currentSalary",
  "当前薪资": "applicationDefaults.currentSalary",
  "Desired Salary": "applicationDefaults.desiredSalary",
  "期望薪资": "applicationDefaults.desiredSalary",
  "Salary Currency": "applicationDefaults.salaryCurrency",
  "薪资货币": "applicationDefaults.salaryCurrency",
  "Profile Visibility": "applicationDefaults.profileVisibility",
  "档案可见性": "applicationDefaults.profileVisibility",
  "Job Notifications": "applicationDefaults.jobNotifications",
  "职位通知": "applicationDefaults.jobNotifications",

  // 人口统计
  "Gender": "demographics.gender",
  "性别": "demographics.gender",
  "Race/Ethnicity": "demographics.race",
  "种族": "demographics.race",
  "Veteran Status": "demographics.veteran",
  "退伍军人状态": "demographics.veteran",
  "Disability": "demographics.disability",
  "残疾状况": "demographics.disability",

  // 个人简介
  "Summary": "summary",
  "自我评价": "summary",
  "个人简介": "summary"
};

/** 布尔字段集合——这些字段的值需要从字符串转布尔 */
const BOOLEAN_PATHS = new Set<string>([
  "workAuthorization.usAuthorized",
  "workAuthorization.requiresSponsorship",
  "applicationDefaults.needsRecruitmentAdjustments",
  "applicationDefaults.previouslyEmployedByFitch",
  "applicationDefaults.jobNotifications",
  "identity.location.willingToRelocate"
]);

/** 标准模板的表头顺序（仅英文表头；解析时同样支持中文同义表头） */
const TEMPLATE_HEADERS: Array<{ header: string; example: string; group: string }> = [
  { header: "First Name", example: "Juan", group: "基本信息" },
  { header: "Middle Name", example: "", group: "基本信息" },
  { header: "Last Name", example: "Perez", group: "基本信息" },
  { header: "Full Name", example: "Juan Perez", group: "基本信息" },
  { header: "Preferred Name", example: "Juan", group: "基本信息" },
  { header: "Email", example: "juan@example.com", group: "联系方式" },
  { header: "Phone Country Code", example: "+52", group: "联系方式" },
  { header: "Phone", example: "1234567890", group: "联系方式" },
  { header: "Address Line 1", example: "Av. Reforma 100", group: "地址" },
  { header: "Address Line 2", example: "Dept 5A", group: "地址" },
  { header: "Postal Code", example: "06600", group: "地址" },
  { header: "City", example: "Mexico City", group: "地址" },
  { header: "State", example: "CDMX", group: "地址" },
  { header: "Country", example: "Mexico", group: "地址" },
  { header: "LinkedIn", example: "linkedin.com/in/juanperez", group: "链接" },
  { header: "GitHub", example: "github.com/juanperez", group: "链接" },
  { header: "Portfolio", example: "juanperez.dev", group: "链接" },
  { header: "Website", example: "", group: "链接" },
  { header: "US Work Authorized", example: "No", group: "工作资格" },
  { header: "Requires Sponsorship", example: "Yes", group: "工作资格" },
  { header: "Visa Status", example: "F-1 OPT", group: "工作资格" },
  { header: "English Proficiency", example: "Professional (C1)", group: "工作资格" },
  { header: "Referral Source", example: "LinkedIn", group: "求职偏好" },
  { header: "Referral Details", example: "", group: "求职偏好" },
  { header: "Employee Referral Name", example: "", group: "求职偏好" },
  { header: "Needs Recruitment Adjustments", example: "No", group: "求职偏好" },
  { header: "Recruitment Adjustments Details", example: "", group: "求职偏好" },
  { header: "Previously Employed By Fitch", example: "No", group: "求职偏好" },
  { header: "Current Employer", example: "TechCorp", group: "求职偏好" },
  { header: "Current Title", example: "Senior Engineer", group: "求职偏好" },
  { header: "Current Salary", example: "120000 USD", group: "求职偏好" },
  { header: "Desired Salary", example: "150000 USD", group: "求职偏好" },
  { header: "Salary Currency", example: "USD", group: "求职偏好" },
  { header: "Profile Visibility", example: "Recruiters only", group: "求职偏好" },
  { header: "Job Notifications", example: "Yes", group: "求职偏好" },
  { header: "Gender", example: "", group: "人口统计" },
  { header: "Race/Ethnicity", example: "", group: "人口统计" },
  { header: "Veteran Status", example: "", group: "人口统计" },
  { header: "Disability", example: "", group: "人口统计" },
  { header: "Summary", example: "5+ years backend engineering, distributed systems...", group: "个人简介" }
];

export interface ExcelImportResult {
  profile: Profile;
  matchedCount: number;
  unmatchedHeaders: string[];
  skippedEmpty: number;
}

/** 将字符串值转换为对应路径的最终类型 */
function coerceValue(path: string, raw: string): string | boolean {
  const value = String(raw ?? "").trim();
  if (BOOLEAN_PATHS.has(path)) {
    const lower = value.toLowerCase();
    if (["是", "yes", "true", "1", "y", "✓"].includes(lower)) return true;
    if (["否", "no", "false", "0", "n", ""].includes(lower)) return false;
    return Boolean(value);
  }
  return value;
}

/** 按点分路径设置 Profile 字段 */
function setPath(profile: Profile, path: string, value: string | boolean): void {
  const keys = path.split(".");
  let cursor: Record<string, unknown> = profile as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys.at(-1)!] = value;
}

/**
 * 解析 Excel 二进制数据，返回合并后的 Profile
 *
 * 支持两种布局：
 * 1. 标准模板（2 行：表头 + 示例值/数据）
 * 2. 自定义布局（SheetJS 默认把第 1 行当表头，后续行为数据）
 *
 * 解析器会自动定位真正的表头行：扫描前 5 行，找到第一行中至少 3 个 key
 * 在 HEADER_TO_PATH 里的行作为表头。这样无论用户用的是模板还是自己从其他来源
 * 复制的 Excel，都能正确匹配。
 */
export async function parseExcelProfile(data: ArrayBuffer, baseProfile: Profile): Promise<ExcelImportResult> {
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Excel 文件没有工作表。");
  const sheet = workbook.Sheets[firstSheetName];

  // 用 header:1 拿到二维数组，手动定位表头行
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (aoa.length === 0) throw new Error("Excel 没有数据行。");

  // 扫描前 5 行（或所有行），找真正的表头行
  let headerRowIndex = -1;
  const scanLimit = Math.min(aoa.length, 5);
  for (let i = 0; i < scanLimit; i++) {
    const row = aoa[i].map((c) => String(c ?? "").trim());
    const matchCount = row.filter((c) => c && HEADER_TO_PATH[c] !== undefined).length;
    if (matchCount >= 3) {
      headerRowIndex = i;
      break;
    }
  }
  // 如果没找到，退回到第 0 行（兼容只有表头 + 一行数据的最小格式）
  if (headerRowIndex === -1) headerRowIndex = 0;

  const headers = aoa[headerRowIndex].map((c) => String(c ?? "").trim());
  // 数据行：表头行之后的所有非空行
  const dataRows = aoa.slice(headerRowIndex + 1).filter((row) => row.some((c) => String(c ?? "").trim() !== ""));
  if (dataRows.length === 0) throw new Error("Excel 没有数据行，请至少填写一行数据。");

  // 只取第一行数据
  const dataRow = dataRows[0];
  const result = structuredClone(baseProfile);
  let matchedCount = 0;
  let skippedEmpty = 0;
  const unmatchedHeaders: string[] = [];

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx];
    if (!header) continue;
    const path = HEADER_TO_PATH[header];
    if (!path) {
      unmatchedHeaders.push(header);
      continue;
    }
    const rawValue = dataRow[colIdx];
    const stringValue = String(rawValue ?? "").trim();
    if (!stringValue) {
      skippedEmpty++;
      continue;
    }
    const coerced = coerceValue(path, stringValue);
    setPath(result, path, coerced);
    matchedCount++;
  }

  return { profile: result, matchedCount, unmatchedHeaders, skippedEmpty };
}

/** 生成并触发下载标准 Excel 模板（2 行格式：表头 + 示例值） */
export function downloadExcelTemplate(): void {
  const headers = TEMPLATE_HEADERS.map((item) => item.header);
  const examples = TEMPLATE_HEADERS.map((item) => item.example);

  // 第 1 行：表头（解析器识别的 key，请勿修改）
  // 第 2 行：示例值（用户替换为自己的信息）
  const aoa: unknown[][] = [headers, examples];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = headers.map((_, i) => ({ wch: i === 0 ? 28 : 20 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "简历信息");

  const fileName = `简历模板_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
