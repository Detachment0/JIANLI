import type { CustomSynonymEntry } from "./schema";

const STORAGE_KEY = "customSynonyms";

/**
 * 统一同义词字典（中英文合并）
 * 可通过仪表盘设置页面 UI 修改，存储在 chrome.storage.local
 */
export const DEFAULT_CUSTOM_SYNONYMS: CustomSynonymEntry[] = [
  { id: "cs-name", field: "identity.firstName", synonyms: [
    "first name", "given name", "legal first name",
    "名", "名字", "名(选填)"
  ], enabled: true },
  { id: "cs-middlename", field: "identity.middleName", synonyms: [
    "middle name", "中间名", "中间名(选填)", "后缀", "姓名后缀", "middle initial"
  ], enabled: true },
  { id: "cs-last", field: "identity.lastName", synonyms: [
    "last name", "surname", "family name", "legal last name",
    "姓", "姓氏", "姓(选填)", "英文姓"
  ], enabled: true },
  { id: "cs-fullname", field: "identity.fullName", synonyms: [
    "full name", "name", "姓名", "中文姓名", "英文姓名", "您的姓名", "真实姓名", "请填写姓名", "姓名的拼音", "请输入姓名", "全名", "用户姓名", "申请人姓名", "您的全名", "候选人姓名"
  ], enabled: true },
  { id: "cs-email", field: "identity.email", synonyms: [
    "email", "email address", "e-mail",
    "邮箱", "电子邮件", "电子邮箱", "邮件地址", "联系邮箱", "常用邮箱", "备用邮箱", "邮箱地址", "E-mail", "电子信箱"
  ], enabled: true },
  { id: "cs-phone", field: "identity.phone", synonyms: [
    "phone", "phone number", "mobile", "telephone",
    "手机", "手机号", "电话号码", "电话", "联系电话", "手机号码", "移动电话", "联系方式", "联系手机", "手机号（选填）", "手机号（必填）"
  ], enabled: true },
  { id: "cs-phone-code", field: "identity.phoneCountryCode", synonyms: [
    "country code", "phone country code", "dialing code", "dialling code",
    "国家代码", "区号", "电话区号", "手机区号", "国家/地区代码", "手机号码前缀", "电话号码前缀", "手机国家代码", "国际区号"
  ], enabled: true },
  { id: "cs-address", field: "identity.address.line1", synonyms: [
    "address line 1", "address 1", "street address",
    "地址", "地址1", "详细地址", "街道地址", "通讯地址", "联系地址", "家庭地址", "现居地址", "居住地址", "所在地址", "家庭住址", "户口地址", "户籍地址", "现住址", "住址"
  ], enabled: true },
  { id: "cs-address2", field: "identity.address.line2", synonyms: [
    "address line 2", "address 2", "apartment", "suite",
    "地址2", "公寓", "单元", "房间号", "门牌号", "楼层", "房间", "补充地址", "地址补充", "详细地址补充", "单元号", "街道补充"
  ], enabled: true },
  { id: "cs-zip", field: "identity.address.postalCode", synonyms: [
    "postal code", "zip code", "zip",
    "邮政编码", "邮编", "邮政编码/邮编", "邮政编号", "邮编号码"
  ], enabled: true },
  { id: "cs-city", field: "identity.location.city", synonyms: [
    "city", "current city", "location city",
    "城市", "所在城市", "现居城市", "当前城市", "居住城市", "城市/地区", "目前所在城市"
  ], enabled: true },
  { id: "cs-state", field: "identity.location.state", synonyms: [
    "state", "province", "region", "current state", "location state",
    "省份", "省", "州", "所在省份", "省/市", "省/自治区", "地区"
  ], enabled: true },
  { id: "cs-country", field: "identity.location.country", synonyms: [
    "country", "current country", "location country",
    "国家", "国籍", "所在国家", "国家/地区", "国家或地区", "现居国家", "所在国家/地区"
  ], enabled: true },
  { id: "cs-linkedin", field: "identity.links.linkedin", synonyms: [
    "linkedin", "linkedin profile", "linkedin url",
    "领英", "linkedin链接", "linkedin主页", "领英主页", "领英链接", "领英档案", "linkedin个人主页", "LinkedIn"
  ], enabled: true },
  { id: "cs-github", field: "identity.links.github", synonyms: [
    "github", "github profile", "github url",
    "GitHub", "github链接", "github主页", "github个人主页", "Github个人主页", "代码仓库", "代码托管"
  ], enabled: true },
  { id: "cs-portfolio", field: "identity.links.portfolio", synonyms: [
    "portfolio", "portfolio url", "personal website", "website",
    "个人网站", "作品集", "个人主页", "个人作品", "我的作品集", "个人作品集", "个人博客", "技术博客", "博客地址", "作品链接", "在线作品集", "个人网站/作品集"
  ], enabled: true },
  { id: "cs-company", field: "applicationDefaults.currentEmployer", synonyms: [
    "current employer", "current company",
    "公司", "当前公司", "现公司", "所在公司", "目前公司", "现任公司", "雇主", "工作单位", "任职公司", "服务单位", "最近工作单位", "现工作单位"
  ], enabled: true },
  { id: "cs-title", field: "applicationDefaults.currentTitle", synonyms: [
    "current title", "current job title",
    "当前职位", "目前职位", "现任职位", "现职位", "当前职称", "现任职务", "职位", "职务", "职称", "岗位", "当前岗位", "应聘职位", "申请职位", "担任职务", "曾任职级"
  ], enabled: true },
  { id: "cs-salary", field: "applicationDefaults.desiredSalary", synonyms: [
    "desired salary", "salary expectation", "expected salary",
    "期望薪资", "期望工资", "期望薪酬", "薪资要求", "期望月薪", "期望年薪", "期望待遇", "期望收入", "期望薪酬范围", "期望月薪范围", "期望薪资范围", "期望年薪范围", "理想薪资", "我的期望薪资"
  ], enabled: true },
  { id: "cs-current-salary", field: "applicationDefaults.currentSalary", synonyms: [
    "current salary", "current compensation",
    "当前薪资", "当前薪酬", "目前薪资", "目前薪酬", "现薪资", "现有薪资", "当前的月薪", "目前月薪", "当前月薪"
  ], enabled: true },
  { id: "cs-salary-currency", field: "applicationDefaults.salaryCurrency", synonyms: [
    "salary currency", "currency",
    "薪资币种", "币种", "货币单位", "薪酬币种", "期望薪资币种", "货币", "薪资单位", "货币类型"
  ], enabled: true },
  { id: "cs-referral", field: "applicationDefaults.referralSource", synonyms: [
    "how did you hear", "referral source", "source of application",
    "信息来源", "渠道", "获知渠道", "推荐来源", "从哪里知道", "从何处得知", "招聘信息来源", "信息渠道", "获知途径", "如何得知本公司", "了解渠道", "从何处了解到本公司", "从哪里了解到我们", "信息渠道来源"
  ], enabled: true },
  { id: "cs-referral-detail", field: "applicationDefaults.referralDetails", synonyms: [
    "if other please provide details", "other referral details",
    "其他来源说明", "其他推荐详情", "其他渠道说明", "如有其他请说明", "请详细说明", "其他渠道"
  ], enabled: true },
  { id: "cs-referral-name", field: "applicationDefaults.employeeReferralName", synonyms: [
    "employee referral", "referral name", "referred by",
    "推荐人", "员工推荐", "推荐人姓名", "内推人", "内推人姓名", "推荐人名字", "推荐人名称", "内部推荐人", "推荐人信息"
  ], enabled: true },
  { id: "cs-accommodation", field: "applicationDefaults.needsRecruitmentAdjustments", synonyms: [
    "require any reasonable adjustments", "need any accommodations", "recruitment adjustments",
    "需要合理便利", "需要特殊安排", "是否需要合理便利", "是否需要特殊安排", "需要招聘调整", "合理便利需求", "是否要求合理便利", "特殊需求", "残障人士便利", "是否需要合理工作便利"
  ], enabled: true },
  { id: "cs-accommodation-detail", field: "applicationDefaults.recruitmentAdjustmentsDetails", synonyms: [
    "if yes please specify", "adjustment details", "accommodation details",
    "便利说明", "特殊安排说明", "如有请说明", "具体说明", "调整详情"
  ], enabled: true },
  { id: "cs-fitch", field: "applicationDefaults.previouslyEmployedByFitch", synonyms: [
    "previously been employed by a company within the fitch group", "previously employed by fitch",
    "曾在费奇集团任职", "曾在费奇工作", "是否曾在费奇工作", "曾在费奇任职", "是否曾在费奇集团任职", "费奇前雇员", "是否曾在费奇(Fitch)工作过"
  ], enabled: true },
  { id: "cs-english", field: "workAuthorization.englishProficiency", synonyms: [
    "english proficiency", "english level", "spoken english", "written english",
    "英语水平", "英语能力", "英语等级", "英语程度", "英语熟练程度", "英语级别", "英文水平", "语言能力(英语)", "英语", "英语类别"
  ], enabled: true },
  { id: "cs-us-auth", field: "workAuthorization.usAuthorized", synonyms: [
    "authorized to work in the united states", "legally authorized to work in the us", "us work authorization",
    "美国工作授权", "美国工作许可", "合法工作授权", "您是否可以在美国合法工作", "是否获得美国工作授权", "是否需要美国工作授权"
  ], enabled: true },
  { id: "cs-sponsor", field: "workAuthorization.requiresSponsorship", synonyms: [
    "require sponsorship", "need sponsorship", "visa sponsorship", "employment sponsorship",
    "需要签证担保", "签证担保", "需要工作签证", "是否需要签证担保", "需要签证赞助", "是否需要赞助", "是否需要H1B", "H1B赞助", "是否需要sponsorship", "需要sponsorship吗"
  ], enabled: true },
  { id: "cs-visa", field: "workAuthorization.visaStatus", synonyms: [
    "visa status", "immigration status",
    "签证状态", "移民身份", "签证类型", "当前签证", "签证情况", "工作签证", "签证信息", "身份状态", "目前签证状态", "签证/身份"
  ], enabled: true },
  { id: "cs-gender", field: "demographics.gender", synonyms: [
    "self identified gender", "gender identity", "gender",
    "性别", "自我认同性别", "性别（选填）", "性别(选填)"
  ], enabled: true },
  { id: "cs-race", field: "demographics.race", synonyms: [
    "ethnic origin", "ethnicity", "race",
    "种族", "民族", "族裔", "种族/民族", "所属民族", "族群", "族裔背景"
  ], enabled: true },
  { id: "cs-veteran", field: "demographics.veteran", synonyms: [
    "veteran status", "protected veteran",
    "退伍军人", "退伍军人身份", "退伍军人状态", "是否退伍军人", "是否退役军人"
  ], enabled: true },
  { id: "cs-disability", field: "demographics.disability", synonyms: [
    "consider yourself to have a disability", "disability status", "long term condition",
    "残疾", "残疾状态", "残障状况", "是否残疾", "是否残障", "残疾情况", "有否残疾", "自认有否残疾", "身心障碍", "是否具有残疾状况"
  ], enabled: true },
  { id: "cs-work-mode", field: "applicationDefaults.profileVisibility", synonyms: [
    "make my profile visible", "profile visibility",
    "简历可见性", "个人资料可见性", "可见范围", "简历可见范围", "谁可以看到我的简历", "可见设置", "简历公开程度", "可见性"
  ], enabled: true },
  { id: "cs-notifications", field: "applicationDefaults.jobNotifications", synonyms: [
    "job posting notifications", "job notifications", "notification",
    "职位通知", "通知设置", "邮件通知", "职位提醒", "招聘通知", "接收通知", "是否接收通知", "邮件提醒", "通知提醒"
  ], enabled: true },
  { id: "cs-summary", field: "profile.summary", synonyms: [
    "自我评价", "个人简介", "自我介绍", "个人总结", "自我描述", "关于我", "个人陈述", "个人优势", "自我推荐", "个人介绍", "自我鉴定", "个人能力", "综合描述", "个人概述", "个人综述", "自我概述", "summary", "self evaluation", "about me", "personal summary", "personal statement", "self introduction", "professional summary"
  ], enabled: true },
];

export async function loadCustomSynonyms(): Promise<CustomSynonymEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? DEFAULT_CUSTOM_SYNONYMS;
}

export async function saveCustomSynonyms(entries: CustomSynonymEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: entries });
}