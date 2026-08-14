/**
 * i18n — Job Autofill Tracker
 * Centralized string management. All user-facing text lives here.
 * EN is the source of truth; ZH is a natural translation, not word-for-word.
 */

export type Locale = "zh-CN" | "en";

let currentLocale: Locale = "zh-CN";

export function setLocale(locale: Locale) {
  currentLocale = locale;
  document.documentElement.lang = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

type MessageMap = Record<string, { "zh-CN": string; en: string }>;

const messages: MessageMap = {
  /* ===== Popup ===== */
  "popup.title": { "zh-CN": "求职助手", en: "Job Assistant" },
  "popup.subtitle": { "zh-CN": "自动填表台", en: "Autofill Console" },
  "popup.autofill": { "zh-CN": "自动填充当前页面", en: "Autofill this page" },
  "popup.autofill.desc": { "zh-CN": "填充检测到的申请字段", en: "Fill detected application fields" },
  "popup.autofill.busy": { "zh-CN": "正在自动填充...", en: "Autofilling..." },
  "popup.preview": { "zh-CN": "预览填充", en: "Preview fill" },
  "popup.preview.desc": { "zh-CN": "先查看要填什么，确认后再执行", en: "Review before filling" },
  "popup.dashboard": { "zh-CN": "跟踪仪表盘", en: "Dashboard" },
  "popup.dashboard.desc": { "zh-CN": "查看申请和跟进事项", en: "Manage applications & follow-ups" },
  "popup.widget": { "zh-CN": "打开助手面板", en: "Open assistant" },
  "popup.widget.desc": { "zh-CN": "使用跟踪、答案和个人资料工具", en: "Tracker, answers & profile tools" },
  "popup.lastResult": { "zh-CN": "查看上次填充结果", en: "View last fill result" },
  "popup.noResult": { "zh-CN": "暂无填充记录", en: "No fill history" },

  /* ===== Widget ===== */
  "widget.close": { "zh-CN": "关闭", en: "Close" },
  "widget.demoMode": { "zh-CN": "演示模式", en: "Demo Mode" },
  "widget.primaryFill": { "zh-CN": "填充", en: "Fill" },
  "widget.primaryPreview": { "zh-CN": "预览", en: "Preview" },
  "widget.primaryDashboard": { "zh-CN": "进入控制台", en: "Open Console" },
  "widget.fieldsReady": { "zh-CN": "{filled}/{total} 个字段就绪", en: "{filled}/{total} fields ready" },
  "widget.fillFields": { "zh-CN": "填充 {count} 个字段", en: "Fill {count} fields" },
  "widget.needsInput": { "zh-CN": "需要你输入", en: "Needs your input" },
  "widget.safetySkip": { "zh-CN": "安全原因已跳过", en: "Left untouched for safety" },
  "widget.couldNotComplete": { "zh-CN": "无法完成", en: "Could not complete" },
  "widget.scanning": { "zh-CN": "正在扫描页面...", en: "Scanning page..." },
  "widget.ready": { "zh-CN": "已就绪，可开始填充", en: "Ready to fill" },
  "widget.filling": { "zh-CN": "正在填充...", en: "Filling..." },
  "widget.fillingDone": { "zh-CN": "填充完成", en: "Fill complete" },
  "widget.submitted": { "zh-CN": "已提交", en: "Submitted" },
  "widget.tracked": { "zh-CN": "已跟踪", en: "Tracked" },
  "widget.applicationReady": { "zh-CN": "申请已就绪", en: "Application ready" },
  "widget.trackThisJob": { "zh-CN": "跟踪此职位", en: "Track this job" },
  "widget.openDashboard": { "zh-CN": "打开仪表盘", en: "Open Dashboard" },
  "widget.jobTitle": { "zh-CN": "职位", en: "Role" },
  "widget.company": { "zh-CN": "公司", en: "Company" },
  "widget.source": { "zh-CN": "来源", en: "Source" },
  "widget.status": { "zh-CN": "状态", en: "Status" },
  "widget.matchScore": { "zh-CN": "匹配分数", en: "Match Score" },
  "widget.skillsMatched": { "zh-CN": "匹配技能", en: "Matched Skills" },
  "widget.skillsMissing": { "zh-CN": "缺少关键词", en: "Missing Keywords" },
  "widget.deepAnalysis": { "zh-CN": "深度分析（AI）", en: "Deep Analysis (AI)" },
  "widget.analyzing": { "zh-CN": "正在分析...", en: "Analyzing..." },
  "widget.draftAnswer": { "zh-CN": "草拟答案", en: "Draft Answer" },
  "widget.copyAnswer": { "zh-CN": "复制答案", en: "Copy Answer" },
  "widget.copied": { "zh-CN": "已复制", en: "Copied" },
  "widget.saveAnswer": { "zh-CN": "保存答案", en: "Save Answer" },
  "widget.saved": { "zh-CN": "已保存", en: "Saved" },
  "widget.answerPlaceholder": { "zh-CN": "粘贴申请问题", en: "Paste application question" },
  "widget.noJobPage": { "zh-CN": "未检测到职位页面", en: "No job page detected" },
  "widget.noJobDesc": { "zh-CN": "无法读取此页面的职位描述", en: "Could not read job description" },

  /* ===== Dashboard ===== */
  "dash.overview": { "zh-CN": "概览", en: "Overview" },
  "dash.applications": { "zh-CN": "申请", en: "Applications" },
  "dash.profile": { "zh-CN": "个人资料", en: "Profile" },
  "dash.knowledge": { "zh-CN": "知识库", en: "Knowledge" },
  "dash.settings": { "zh-CN": "设置", en: "Settings" },
  "dash.thisWeek": { "zh-CN": "本周", en: "This Week" },
  "dash.due": { "zh-CN": "待办", en: "Due" },
  "dash.memories": { "zh-CN": "记忆", en: "Memories" },
  "dash.needsFollowUp": { "zh-CN": "需要跟进", en: "Needs Follow-up" },
  "dash.recentApplications": { "zh-CN": "近期申请", en: "Recent Applications" },
  "dash.pipeline": { "zh-CN": "申请管道", en: "Application Pipeline" },
  "dash.nextAction": { "zh-CN": "下一步行动", en: "Next Action" },
  "dash.profileReadiness": { "zh-CN": "个人资料就绪度", en: "Profile Readiness" },
  "dash.sectionsFilled": { "zh-CN": "{filled}/{total} 个部分已填写", en: "{filled}/{total} sections filled" },
  "dash.importCV": { "zh-CN": "导入简历", en: "Import CV" },
  "dash.smartAdd": { "zh-CN": "智能添加", en: "Smart Add" },
  "dash.demoMode": { "zh-CN": "演示模式", en: "Demo Mode" },
  "dash.exitDemo": { "zh-CN": "退出演示模式", en: "Exit Demo Mode" },
  "dash.enterDemo": { "zh-CN": "开始演示模式", en: "Enter Demo Mode" },
  "dash.exportCSV": { "zh-CN": "导出 CSV", en: "Export CSV" },
  "dash.manualAdd": { "zh-CN": "手动添加", en: "Manual Add" },
  "dash.aiAdd": { "zh-CN": "使用 AI 添加", en: "Add with AI" },
  "dash.search": { "zh-CN": "搜索职位或公司", en: "Search jobs or companies" },
  "dash.noApplications": { "zh-CN": "暂无申请记录", en: "No applications yet" },
  "dash.noApplicationsDesc": { "zh-CN": "跟踪的申请将显示在此处", en: "Tracked applications will appear here" },
  "dash.saved": { "zh-CN": "已保存", en: "Saved" },
  "dash.saving": { "zh-CN": "正在保存...", en: "Saving..." },

  /* ===== Shared ===== */
  "common.cancel": { "zh-CN": "取消", en: "Cancel" },
  "common.confirm": { "zh-CN": "确认", en: "Confirm" },
  "common.save": { "zh-CN": "保存", en: "Save" },
  "common.delete": { "zh-CN": "删除", en: "Delete" },
  "common.edit": { "zh-CN": "编辑", en: "Edit" },
  "common.close": { "zh-CN": "关闭", en: "Close" },
  "common.loading": { "zh-CN": "加载中...", en: "Loading..." },
  "common.error": { "zh-CN": "错误", en: "Error" },
  "common.retry": { "zh-CN": "重试", en: "Retry" },
  "common.done": { "zh-CN": "完成", en: "Done" },
  "common.back": { "zh-CN": "返回", en: "Back" },

  /* ===== Autofill Status ===== */
  "fill.completed": { "zh-CN": "已完成", en: "Completed" },
  "fill.needsInput": { "zh-CN": "需要你输入", en: "Needs your input" },
  "fill.skipped": { "zh-CN": "已安全跳过", en: "Skipped for safety" },
  "fill.couldNotComplete": { "zh-CN": "无法完成", en: "Could not complete" },
  "fill.ready": { "zh-CN": "就绪", en: "Ready" },
  "fill.pending": { "zh-CN": "待填充", en: "Pending" },
  "fill.percentage": { "zh-CN": "{percentage}% 已填充", en: "{percentage}% filled" },
};

export function t(key: string, vars?: Record<string, string | number>): string {
  const msg = messages[key];
  if (!msg) return key;
  let text = msg[currentLocale];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function locale(): Locale {
  return currentLocale;
}