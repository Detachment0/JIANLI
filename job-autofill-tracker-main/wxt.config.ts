import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "求职自动填表 + 跟踪器",
    description: "从本地个人资料自动填写求职申请，草拟筛选问题答案，并跟踪申请进度。",
    version: "0.1.0",
    permissions: ["storage", "unlimitedStorage", "activeTab", "downloads", "scripting", "alarms"],
    host_permissions: ["https://*/*", "http://*/*", "https://api.openai.com/*"],
    action: {
      default_title: "Job Autofill + Tracker"
    },
    commands: {
      "toggle-widget": {
        suggested_key: { default: "Alt+J" },
        description: "Toggle the JobTracker widget"
      }
    }
  },
  vite: () => ({
    plugins: [tailwindcss()]
  })
});
