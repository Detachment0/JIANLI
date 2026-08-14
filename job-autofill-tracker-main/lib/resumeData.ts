import type { Profile } from "./schema";

export const RESUME_PROFILE: Profile = {
  identity: {
    firstName: "猫猫头",
    middleName: "",
    lastName: "猫头鹰",
    fullName: "猫猫头猫头鹰",
    preferredName: "猫猫头",
    email: "maomaotou@example.com",
    phone: "13800138000",
    phoneCountryCode: "+86",
    address: {
      line1: "",
      line2: "",
      postalCode: ""
    },
    location: {
      city: "广州",
      state: "广东",
      country: "中国",
      willingToRelocate: true
    },
    links: {
      linkedin: "",
      github: "",
      portfolio: "",
      website: ""
    }
  },
  workAuthorization: {
    usAuthorized: false,
    requiresSponsorship: true,
    visaStatus: "中国公民",
    eligibleCountries: ["中国"],
    timezonesComfortable: ["CST (China)", "EST", "PST"],
    englishProficiency: "CET-6，CET-4，可进行工作沟通与阅读"
  },
  experience: [
    {
      title: "后端开发",
      company: "美团（北京）",
      start: "2025-09",
      end: "2025-11",
      highlights: [
        "渐进式数据一致性治理：参与配置平台数据一致性治理，针对历史配置导致的数据覆盖问题，参与增量拦截与存量治理方案落地，提升配置数据可靠性",
        "渐进式策略迁移治理：参与客服资源调度策略迁移，补全灰度验证缺少正式切流及例外覆盖能力，落地四层路由与回退机制，支撑策略渐进迁移"
      ],
      stack: ["Java", "Spring Boot", "MySQL"]
    },
    {
      title: "后端开发",
      company: "用友（华南区总部）",
      start: "2025-05",
      end: "2025-08",
      highlights: [
        "支付结算可靠性治理：参与财务结算稳定性治理，针对批量处理中的并发风险和交易一致性问题，参与关键流程优化，提升资金处理可靠性与异常恢复能力",
        "批处理查询优化：参与批量单据审核链路重构，通过优化重复查库与行级错误定位，降低无效请求进入正式支付事务"
      ],
      stack: ["Java", "Spring Boot", "MySQL"]
    },
    {
      title: "后端开发",
      company: "大平移（广州）信息科技有限公司",
      start: "2024-12",
      end: "2025-04",
      highlights: [
        "异步任务调度设计：设计文章异步审核任务调度机制，在第三方审核服务高延迟与故障风险下，通过调度、补偿和版本隔离保证审核链路最终业务正确性"
      ],
      stack: ["Java", "Spring Boot", "Kafka"]
    }
  ],
  personalProjects: [
    {
      name: "自研Agent项目",
      description: "参与知识库结构化治理、热点账户并发优化、语义授权可信执行、Agent 上下文压缩及动态页面巡检兜底",
      role: "Agent/后端开发",
      start: "2026-01",
      end: "2026-04",
      highlights: [
        "知识库结构化治理：参与审核知识库存量治理，完成历史规则与案例结构化迁移及关联校验，保障知识可追溯",
        "热点账户并发优化：针对热点账户高并发更新导致的处理瓶颈，优化账务入账链路，降低数据库热点竞争",
        "语义授权可信执行：构建语义查询可信执行链路，实现查询授权与执行一致性校验护栏",
        "会话级执行控制：将外部副作用与流程状态分离处理，避免旧任务继续影响新流程",
        "Agent 上下文压缩：实现 Thinking 压缩能力，解决 Agent 长会话 Token 膨胀与推理成本增长问题",
        "动态页面巡检兜底：针对 DOM 规则难覆盖的动态弹窗，补充截图定位、坐标点击与结果验证，恢复原巡检流程"
      ],
      stack: ["Java", "LangChain4j", "MySQL", "Redis"],
      url: "",
      repository: ""
    }
  ],
  additionalKnowledge: "具备工程复盘与知识沉淀能力，能将项目经验、故障案例和技术知识持续抽象为可复用的问题分析与设计方法论。具备理解复杂业务流程的能力。",
  summary: "具备扎实的 Java 后端开发基础，熟悉 Spring Boot、微服务架构和分布式系统设计。有美团、用友等互联网公司实习经验，参与过数据一致性治理、支付结算稳定性优化、异步任务调度等核心模块开发。熟悉 MySQL、Redis、Kafka 等中间件原理，具备 Agent 开发与 Prompt 设计能力。善于工程复盘与知识沉淀，能快速理解复杂业务流程并推动落地。",
  skills: {
    "Java": { years: 2, note: "锁机制、线程池、JVM内存模型、类加载、垃圾回收机制" },
    "Spring Boot": { years: 2, note: "Bean生命周期、事务机制及常见失效场景" },
    "Spring Cloud": { years: 1, note: "微服务架构" },
    "MySQL": { years: 2, note: "Redo/Undo/Binlog、MVCC、Read View、索引失效及慢SQL分析" },
    "Redis": { years: 2, note: "数据结构、Cache Aside、缓存穿透/击穿/雪崩、Redisson看门狗" },
    "Kafka": { years: 1, note: "Kafka整体模型、重平衡机制及常见消息队列比较" },
    "Nginx": { years: 1, note: "常用中间件配置" },
    "Agent开发": { years: 1, note: "ReAct、Agent Loop、工具调用、状态推进及终止条件" },
    "Prompt设计": { years: 1, note: "Agent上下文、记忆与RAG、上下文窗口、摘要压缩、记忆分层、Token管理" },
    "LangChain": { years: 1, note: "工具调用" },
    "LangGraph": { years: 1, note: "状态图、检查点与记忆机制" },
    "LangChain4j": { years: 1, note: "工具调用、状态图、检查点与记忆机制" }
  },
  education: [
    {
      degree: "本科 - 软件工程·数学与信息学院/软件学院·全日制",
      school: "华南农业大学（双一流）",
      year: "2027"
    }
  ],
  demographics: {
    gender: "",
    race: "",
    veteran: "",
    disability: ""
  },
  applicationDefaults: {
    referralSource: "",
    referralDetails: "",
    employeeReferralName: "",
    needsRecruitmentAdjustments: false,
    recruitmentAdjustmentsDetails: "",
    previouslyEmployedByFitch: false,
    currentEmployer: "",
    currentTitle: "",
    currentSalary: "",
    desiredSalary: "",
    salaryCurrency: "CNY",
    profileVisibility: "",
    jobNotifications: false
  },
  resumeFileRef: ""
};