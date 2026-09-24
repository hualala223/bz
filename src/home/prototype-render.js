/* 构建产物（勿手改）：node scripts/build-preview.mjs — src/home/render.ts → window.BZR_home（评审壳预览包，ADR-0104） */
var BZR_home = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/home/render.ts
  var render_exports = {};
  __export(render_exports, {
    ALL_DOMAIN_IDS: () => ALL_DOMAIN_IDS,
    DEFAULT_TIMELINE_FILTER: () => DEFAULT_TIMELINE_FILTER,
    DOMAINS: () => DOMAINS,
    DOMAIN_DOT: () => DOMAIN_DOT,
    DOMAIN_ICONS: () => DOMAIN_ICONS,
    DOMAIN_MAP: () => DOMAIN_MAP,
    DOMAIN_MENU: () => DOMAIN_MENU,
    EMPTY_COUNTS: () => EMPTY_COUNTS,
    EMPTY_SUMMARY: () => EMPTY_SUMMARY,
    TIMELINE_KIND_LABEL: () => TIMELINE_KIND_LABEL,
    applyOrder: () => applyOrder,
    buildDots: () => buildDots,
    buildNotes: () => buildNotes,
    buildPreviews: () => buildPreviews,
    collectHtml: () => collectHtml,
    dateStrOf: () => dateStrOf,
    domainColor: () => domainColor,
    dotOf: () => dotOf,
    entriesHtml: () => entriesHtml,
    esc: () => esc,
    eventKind: () => eventKind,
    eventVisible: () => eventVisible,
    filterEvents: () => filterEvents,
    flowHtml: () => flowHtml,
    headDateText: () => headDateText,
    hiddenOf: () => hiddenOf,
    iconSpan: () => iconSpan,
    loadingEntriesHtml: () => loadingEntriesHtml,
    loadingFlowHtml: () => loadingFlowHtml,
    menuHeadHtml: () => menuHeadHtml,
    nextHtml: () => nextHtml,
    panelFrameHtml: () => panelFrameHtml,
    parsePlanCheckins: () => parsePlanCheckins,
    pomodoroMenuAction: () => pomodoroMenuAction,
    reorderTo: () => reorderTo,
    riverCountText: () => riverCountText,
    sheetHeadHtml: () => sheetHeadHtml,
    tilesHtml: () => tilesHtml,
    timelineKind: () => timelineKind,
    timelineRangeDays: () => timelineRangeDays,
    truncateCollect: () => truncateCollect,
    visibleDomains: () => visibleDomains,
    weekHtml: () => weekHtml
  });

  // src/core/ui/str.ts
  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }
  function esc(s) {
    return escapeHtml(String(s != null ? s : ""));
  }
  function iconSpan(name, extra = "") {
    return `<i data-lucide="${name}" class="bz-ic${extra ? " " + extra : ""}"></i>`;
  }

  // src/core/domain-icons.ts
  var DOMAIN_ICONS = {
    // 面板专属域（无对应命令）
    global: "settings",
    appearance: "palette",
    ai: "sparkles",
    // 域入口命令与面板导航共用
    home: "layout-grid",
    recap: "calendar-heart",
    memo: "sticky-note",
    todo: "check-square",
    belongings: "package",
    clipping: "scissors",
    favorites: "star",
    diary: "notebook-pen",
    "diary-wall": "images",
    "reading-report": "bar-chart-3",
    cinema: "clapperboard",
    bookshelf: "book-open",
    review: "repeat-2",
    secondbrain: "brain",
    "auto-summary": "sparkles",
    pomodoro: "timer",
    attach: "folder-down",
    encrypt: "lock",
    password: "key-round",
    smartcat: "cat",
    knowledge: "list-video",
    collect: "inbox",
    // 外部插件卡（无 bz 命令）：plan = PlanFlow 首页卡（ADR-0132，目标语义）
    plan: "target",
    // 命令专属域
    "settings-panel": "settings-2"
  };

  // src/home/shared.ts
  var ICON_KEY = { settings: "settings-panel", wall: "diary-wall" };
  var iconOf = (id) => {
    var _a;
    return DOMAIN_ICONS[(_a = ICON_KEY[id]) != null ? _a : id];
  };
  var DOMAINS = [
    { id: "diary", commandId: "bz-diary-open", name: "日记本", sub: "写今天的闪念", icon: iconOf("diary") },
    // 待办（todo 域，上游 memo 换血接替 ADR-0092/0117，本地命名走 ADR-0118）：上游 09-10 起补入首页入口（票 288）
    { id: "todo", commandId: "bz-todo-open", name: "待办", sub: "随手记与待办", icon: iconOf("todo") },
    // 计划（外部插件 PlanFlow 只读接入，ADR-0132/票 304）：DOMAINS 首张外部插件卡——
    // 命令 id 是 planflow 插件的既有命令（无 bz- 前缀），planflow 未启用时走 runCommand 失败提示
    { id: "plan", commandId: "planflow:open-planboard", name: "计划", sub: "计划打卡与目标追踪（PlanFlow）", icon: iconOf("plan") },
    { id: "cinema", commandId: "bz-cinema-open", name: "娱乐", sub: "电影/剧集/书籍 想看与在看", icon: iconOf("cinema") },
    { id: "review", commandId: "bz-review-open", name: "复习计划", sub: "到期卡片队列", icon: iconOf("review") },
    { id: "pomodoro", commandId: "bz-pomodoro-open", name: "番茄钟", sub: "专注计时", icon: iconOf("pomodoro") },
    { id: "favorites", commandId: "bz-favorites-open", name: "收藏本", sub: "收藏条目", icon: iconOf("favorites") },
    { id: "clipping", commandId: "bz-clipbook-open", name: "剪藏本", sub: "未读流与剪藏", icon: iconOf("clipping") },
    // 日常收集（collect 域，issue 246）：本地独有域入口
    { id: "collect", commandId: "bz-collect-open", name: "日常收集", sub: "灵感与素材收集", icon: iconOf("collect") },
    // 知识盒（knowledge 域，ADR-0072；上游 knowledge 的本地命名 ADR-0118）
    { id: "knowledge", commandId: "bz-knowledge-open", name: "知识盒", sub: "文献笔记与录入", icon: iconOf("knowledge") },
    // 旧书库（library）域退役：本卡由书架墙（bookshelf）承接（id 变更后旧 home.json 里钉选的 library 自动失效，可在编辑模式重钉）
    { id: "bookshelf", commandId: "bz-bookshelf-open", name: "书库", sub: "藏书与读书笔记", icon: iconOf("bookshelf") },
    // 第二大脑（secondbrain 域，issue 251）：主面板统一入口（检索/对话/灵感参考都从面板进；票 288 补入）
    { id: "secondbrain", commandId: "bz-secondbrain-panel", name: "第二大脑", sub: "笔记检索与问答", icon: iconOf("secondbrain") },
    // 回忆墙（diary-wall 域）：冻结域独立入口（ADR-0121；上游已并入日记本条目，本地不随）
    { id: "wall", commandId: "bz-diary-wall-open", name: "回忆墙", sub: "相片墙浏览日记", icon: iconOf("wall") },
    { id: "belongings", commandId: "bz-belongings-open", name: "归物本", sub: "物品登记", icon: iconOf("belongings") },
    // 移动附件（attach 域）：上游 09-10 自入口移除，本地保留现状（可在隐藏列表配置，票 288 记录偏差）
    { id: "attach", commandId: "bz-attach-move", name: "移动附件", sub: "附件归位", icon: iconOf("attach") },
    { id: "encrypt", commandId: "bz-encrypt-open", name: "保险库", sub: "密码·加密笔记·日记", icon: iconOf("encrypt") },
    { id: "settings", commandId: "bz-settings-panel-open", name: "设置", sub: "全域设置", icon: iconOf("settings") }
  ];
  var DOMAIN_MAP = new Map(DOMAINS.map((d) => [d.id, d]));
  var DOMAIN_DOT = {
    diary: "#e67341",
    todo: "#e8590c",
    recap: "#d64d8f",
    cinema: "#e6951d",
    review: "#7c5cd6",
    pomodoro: "#e5534b",
    favorites: "#f0b429",
    clipping: "#2f9e5f",
    knowledge: "#c2559d",
    bookshelf: "#3d7bd6",
    secondbrain: "#a33d2a",
    "reading-report": "#3fa7a0",
    belongings: "#45a35c",
    attach: "#8a8f99",
    encrypt: "#8a8f99",
    smartcat: "#e67341",
    settings: "#8a8f99",
    // 日常收集（collect 域，issue 246）：琥珀色快照卡同源
    collect: "#c98a2e",
    // 计划（外部插件 PlanFlow 卡，ADR-0132）：planflow 深空蓝主题同系
    plan: "#4a6fa5"
  };
  var ALL_DOMAIN_IDS = DOMAINS.map((d) => d.id);
  function applyOrder(order, domains = DOMAINS) {
    if (!order || !order.length) return domains;
    const rank = /* @__PURE__ */ new Map();
    order.forEach((id, i) => {
      if (!rank.has(id)) rank.set(id, i);
    });
    const MISS = Number.MAX_SAFE_INTEGER;
    return [...domains].sort((a, b) => {
      var _a, _b;
      return ((_a = rank.get(a.id)) != null ? _a : MISS) - ((_b = rank.get(b.id)) != null ? _b : MISS);
    });
  }
  function reorderTo(order, id, toIndex, hidden = [], domains = DOMAINS) {
    const all = applyOrder(order, domains).map((d) => d.id);
    const off = new Set(hidden);
    const visible = all.filter((x) => !off.has(x));
    const from = visible.indexOf(id);
    if (from < 0 || toIndex < 0 || toIndex >= visible.length) return all;
    visible.splice(from, 1);
    visible.splice(toIndex, 0, id);
    return [...visible, ...all.filter((x) => off.has(x))];
  }
  function hiddenOf(order, scope) {
    return scope === "mob" ? order.hiddenMob : order.hiddenDesk;
  }
  function visibleDomains(order, hidden, domains = DOMAINS) {
    const hide = new Set(hidden != null ? hidden : []);
    return applyOrder(order, domains.filter((d) => !hide.has(d.id)));
  }
  function pomodoroMenuAction(phase) {
    if (phase === "focusing") return { label: "停止专注", commandId: "bz-pomodoro-pause", icon: "pause" };
    if (phase === "paused") return { label: "继续专注", commandId: "bz-pomodoro-pause", icon: "play" };
    if (phase === "break") return { label: "跳过休息", commandId: "bz-pomodoro-skip", icon: "skip-forward" };
    return { label: "开始专注", commandId: "bz-pomodoro-focus-toggle", icon: "timer" };
  }
  var DOMAIN_MENU = {
    // 日记四动作（2026-09-14 用户点名；解冻上游「日记不挂菜单」的票 288 口径——
    // 均为既有 bz 命令直呼，不新增命令面，diary 域本身零改动）：
    diary: [
      // 打开今日日记（票 303 追加）：文件在就直接开，不在按模板建档后开（bz-diary-open-today）。
      // 特例打破「不放打开 X」惯例——磁贴本体开的是日记本面板，这条要的是**日记文件**，语义不同（用户实测点名补挂）。
      { label: "打开今日日记", commandId: "bz-diary-open-today", icon: "file-text" },
      { label: "写日记", commandId: "bz-diary-write", icon: "pen-line" },
      { label: "日程规划", commandId: "bz-diary-plan", icon: "calendar-plus" },
      { label: "每日触动点记录", commandId: "bz-diary-review", icon: "notebook-pen" },
      { label: "日常行为记录", commandId: "bz-diary-activity-capture", icon: "footprints" }
    ],
    todo: [
      { label: "写待办", commandId: "bz-todo-add", icon: "clipboard-list" }
      // 上游「给当前笔记记一笔」（bz-memo-note-binding）本地无等价命令，不挂（票 288）
    ],
    cinema: [
      { label: "加条目", commandId: "bz-cinema-add", icon: "plus" },
      { label: "娱乐分析报告", commandId: "bz-cinema-analysis", icon: "bar-chart-3" },
      // 从「想看」池随机抽一部并直接开详情（抽不动脑子时的入口）
      { label: "随机抽一部", commandId: "bz-cinema-random-pick", icon: "shuffle" }
    ],
    review: [
      // 上游 bz-review-start/add 本地复习命令面不同（review 域冻结），映射本地既有命令（票 288）
      // 「今日复习」= 按数量复习（bz-review-count，count.ts 抽卡流程）；此前误挂 bz-review-today
      //（注册名「今日已复习」，是历史查看不是开刷），2026-09-14 用户点名纠正，已复习历史保留为第二条。
      { label: "今日复习", commandId: "bz-review-count", icon: "play" },
      { label: "今日已复习", commandId: "bz-review-today", icon: "history" },
      { label: "复习计划分析报告", commandId: "bz-review-report", icon: "bar-chart-3" }
    ],
    // 番茄钟：**相位敏感的单个动作**（见 pomodoroMenuAction）——静态项只是 idle 兜底，
    // 挂菜单时整条按实时相位替换（文案/命令/图标），四相位互斥、一次只出一条。
    pomodoro: [
      { label: "开始专注", commandId: "bz-pomodoro-focus-toggle", icon: "timer", dynamic: "phase", keepHome: true }
    ],
    favorites: [{ label: "加收藏", commandId: "bz-favorites-add", icon: "bookmark" }],
    // 剪藏本此前是空菜单（无域快捷动作）；这条是唯一「不开面板」的批量动作，故挂在入口上。
    // 危险项：一次改 N 条 read 状态（面板里同款动作也是走确认框），故 kind: 'danger' + 确认框；
    // keepHome = 确认框叠在首页上、清完当场看到「未读 N 篇」归零。
    clipping: [
      { label: "未读全部标为已读", commandId: "bz-clipbook-mark-all-read", icon: "check-check", kind: "danger", keepHome: true }
    ],
    knowledge: [
      { label: "术语生成文献笔记", commandId: "bz-knowledge-note-term", icon: "file-text" },
      // 视频生成文献笔记（bz-knowledge-note-video）：票 289 已补命令入口，票 290 起挂入（票 288 时的「本地无该命令」注记作废）
      { label: "视频生成文献笔记", commandId: "bz-knowledge-note-video", icon: "list-video" }
    ],
    bookshelf: [
      { label: "阅读分析报告", commandId: "bz-reading-report-open", icon: "bar-chart-3" }
      // 上游「继续在读」（bz-bookshelf-continue）本地无该命令，不挂（票 288）
    ],
    secondbrain: [
      { label: "第二大脑对话", commandId: "bz-secondbrain-chat", icon: "message-circle" },
      { label: "参考侧栏", commandId: "bz-secondbrain-open", icon: "zap" },
      // 全库重建向量索引（函数早已存在、此前没有命令入口）
      { label: "重建索引", commandId: "bz-secondbrain-rebuild-index", icon: "refresh-cw", keepHome: true }
    ],
    belongings: [{ label: "加物品", commandId: "bz-belongings-add", icon: "archive" }],
    // 计划（外部插件 PlanFlow，ADR-0132）：planflow 现有命令面仅此 1 条——「打开计划总览」
    // 与左键等价，挂菜单是用户点名的形态统一（破「不放打开 X」惯例，diary「打开今日日记」先例同款）。
    // planflow 未启用时 runCommand 走现成失败提示；其后续扩命令面可再挂。
    plan: [
      { label: "打开计划总览", commandId: "planflow:open-planboard", icon: "target" }
    ],
    // 保险库：此前是空菜单（无域快捷动作）；锁定是唯一「不开面板」的一步动作
    // （上游 bz-encrypt-lock-vault 的本地命令名 = bz-encrypt-lock，票 288 映射）
    encrypt: [
      { label: "锁定保险库", commandId: "bz-encrypt-lock", icon: "lock", keepHome: true }
    ],
    // 密码本（vault）菜单不挂：本地密码本并入保险库统一域（ADR-0085），无独立命令面
    // 日常收集（collect 域，issue 246）：统一收集入口与选区收集（本地独有）
    collect: [
      { label: "收集内容", commandId: "bz-collect-capture", icon: "pencil-line" }
    ]
  };
  function domainColor(id) {
    var _a;
    return (_a = DOMAIN_DOT[id]) != null ? _a : "#8a8f99";
  }
  function menuHeadHtml(d, data) {
    var _a;
    const ct = (_a = riverCountText(d.id, data)) != null ? _a : "";
    return '<span class="bz-item-menu-head-dot" style="background:' + domainColor(d.id) + '"></span><span class="bz-item-menu-head-nm">' + esc(d.name) + "</span>" + (ct ? '<span class="bz-item-menu-head-cnt">' + esc(ct) + "</span>" : "");
  }
  function sheetHeadHtml(d, data) {
    var _a;
    const ct = (_a = riverCountText(d.id, data)) != null ? _a : d.sub;
    return '<div class="bz-home-sheet-head"><div class="bz-home-sheet-top"><span class="bz-home-sheet-ic" style="color:' + domainColor(d.id) + '">' + iconSpan(d.icon) + '</span><div class="bz-home-sheet-nm">' + esc(d.name) + '</div></div><div class="bz-home-sheet-sub">' + esc(ct) + "</div></div>";
  }
  var EMPTY_COUNTS = {
    diaryTotal: 0,
    todoOpen: 0,
    todoUrgentOpen: 0,
    reviewTotal: 0,
    reviewOverdue: 0,
    reviewDueTomorrow: 0,
    cinemaWant: 0,
    cinemaWatching: 0,
    bookshelfReading: 0,
    bookshelfFinished: 0,
    clippingUnread: 0,
    favoritesTotal: 0,
    belongingsTotal: 0,
    collectToday: 0,
    planDone: 0,
    planTotal: 0
  };
  var EMPTY_SUMMARY = {
    diary: 0,
    movies: 0,
    books: 0,
    todoDone: 0,
    todoCreated: 0,
    pomodoros: 0,
    pomodoroMinutes: 0
  };
  function truncateCollect(text, max = 42) {
    const s = (text || "").replace(/\s+/g, " ").trim();
    if (max <= 0 || s.length <= max) return s;
    return s.slice(0, max) + "…";
  }
  var TIMELINE_KIND_LABEL = {
    produce: "产出",
    progress: "状态推进",
    note: "点评 ✦",
    skipped: "已跳过"
  };
  var DEFAULT_TIMELINE_FILTER = {
    produce: true,
    progress: true,
    notes: true,
    skipped: false
  };
  function timelineRangeDays(range) {
    if (range === "3d") return 3;
    if (range === "week") return 7;
    return 1;
  }
  function timelineKind(text) {
    if (text.startsWith("新增备忘录") || text.includes("加入片单") || text.includes("读到 ")) return "progress";
    return "produce";
  }
  function eventKind(e) {
    const k = e.kind;
    return k != null ? k : timelineKind(e.text);
  }
  function eventVisible(e, filter) {
    switch (eventKind(e)) {
      case "skipped":
        return filter.skipped;
      case "note":
        return filter.notes;
      case "progress":
        return filter.progress;
      default:
        return filter.produce;
    }
  }
  function filterEvents(events, filter) {
    return events.filter((e) => eventVisible(e, filter));
  }
  function p2(n) {
    return String(n).padStart(2, "0");
  }
  function dateStrOf(anchor) {
    const d = new Date(anchor);
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }
  function fmtHm(t) {
    const d = new Date(t);
    return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function headDateText(now = Date.now()) {
    const d = new Date(now);
    const wd = "日一二三四五六"[d.getDay()];
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} 周${wd} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function dayOffsetMs(t) {
    const d = new Date(t);
    return d.getHours() * 36e5 + d.getMinutes() * 6e4 + d.getSeconds() * 1e3 + d.getMilliseconds();
  }
  function buildNotes(data) {
    const notes = [];
    const day = data.today;
    if (!day.events.length) return notes;
    if (day.firstTs !== null) {
      if (data.yesterday.firstTs !== null) {
        const diff = Math.round((dayOffsetMs(day.firstTs) - dayOffsetMs(data.yesterday.firstTs)) / 6e4);
        if (diff > 0) notes.push({ index: 0, text: `动手比昨天晚了 ${diff} 分钟，不过来了就好。` });
        else if (diff < 0) notes.push({ index: 0, text: `动手比昨天早了 ${-diff} 分钟，好开头。` });
        else notes.push({ index: 0, text: "和昨天几乎同一时间动手，节奏很稳。" });
      } else {
        notes.push({ index: 0, text: `今天第一笔动静在 ${fmtHm(day.firstTs)}。` });
      }
    }
    const last = day.events[day.events.length - 1];
    const evening = new Date(last.ts);
    evening.setHours(18, 0, 0, 0);
    if (!data.streak.diaryWrittenToday && data.streak.diaryStreak > 0 && last.ts >= evening.getTime()) {
      notes.push({ index: day.events.length - 1, text: `晚上效率回来了——但日记还空着，×${data.streak.diaryStreak} 连击在等你。` });
    }
    return notes;
  }
  function buildPreviews(data) {
    const c = data.counts;
    const t = data.today.summary;
    const s = data.streak;
    const out = [];
    if (c.reviewDueTomorrow > 0) {
      out.push({ h: `复习将到期 ${c.reviewDueTomorrow} 张`, b: "按 SRS 间隔推算，明天到期。今晚顺手过一遍队列，明天正好清干净。", go: "review", goLabel: "去复习计划 →" });
    } else if (c.reviewOverdue > 0) {
      out.push({ h: `还有 ${c.reviewOverdue} 张逾期卡`, b: "逾期是唯一会随时间变贵的债。约 4 分钟一张，还掉最划算。", go: "review", goLabel: "去还卡 →" });
    } else {
      out.push({ h: t.pomodoros > 0 ? `今天已专注 ${t.pomodoros} 轮` : "番茄引擎待命", b: "排一轮 25 分钟给明天最重要的那件事。", go: "pomodoro", goLabel: "开番茄钟 →" });
    }
    out.push(
      c.clippingUnread > 0 ? { h: `剪藏还压 ${c.clippingUnread} 篇`, b: "挑 1 篇放进明早：通勤读一篇，保持进出平衡。", go: "clipping", goLabel: "挑一篇放明早 →" } : { h: "剪藏库已清空", b: "库存干净了，明天遇到好文章放心收。", go: "clipping", goLabel: "去剪藏本 →" }
    );
    if (!s.diaryWrittenToday && s.diaryStreak > 0) {
      out.push({ h: `日记连击 ×${s.diaryStreak} 待续`, b: "写三行也算数。今晚补上，明天它自己接着长。", go: "diary", goLabel: "去写日记 →" });
    } else if (s.diaryWrittenToday) {
      out.push({ h: `今日日记已写 · 连击 ×${s.diaryStreak}`, b: "明天同一时间回来续上，连击就是这么长起来的。", go: "diary", goLabel: "看日记本 →" });
    } else {
      out.push({ h: "给明天留一句话", b: "今晚写一篇日记，明晚它会变成日记本媒体墙上的新格子。", go: "diary", goLabel: "去写日记 →" });
    }
    return out;
  }
  function buildDots(data) {
    const day = data.today;
    const hasEvent = (d) => day.events.some((e) => e.domain === d);
    const c = data.counts;
    return {
      diary: day.summary.diary > 0 ? "ok" : data.streak.diaryStreak > 0 ? "warn" : "off",
      review: c.reviewOverdue > 0 ? "hot" : "off",
      todo: c.todoUrgentOpen > 0 ? "hot" : day.summary.todoDone + day.summary.todoCreated > 0 ? "ok" : "off",
      pomodoro: data.pomodoroFocusing ? "warn" : day.summary.pomodoros > 0 ? "ok" : "off",
      cinema: c.cinemaWatching > 0 ? "warn" : hasEvent("cinema") ? "ok" : "off",
      // 书库（2026-09-11 用户要求）：**有在读 = warn**，与影院「有在看」同口径——
      // 「在读 N 本」是进行中的事，比「今天动过书库」更该亮；没在读才看今日动静。
      bookshelf: c.bookshelfReading > 0 ? "warn" : hasEvent("bookshelf") ? "ok" : "off",
      clipping: c.clippingUnread > 0 ? "warn" : "off",
      // 日常收集（collect 域，issue 246）：今天有收集 = ok
      collect: data.counts.collectToday > 0 ? "ok" : "off"
    };
  }
  function dotOf(dots, id) {
    var _a;
    return (_a = dots[id]) != null ? _a : "off";
  }
  function riverCountText(id, data) {
    const c = data.counts;
    switch (id) {
      case "diary":
        return `${c.diaryTotal} 篇${data.streak.diaryWrittenToday ? " · 今日已写" : ""}`;
      case "todo":
        return `${c.todoOpen} 条待办`;
      case "review":
        return c.reviewOverdue > 0 ? `${c.reviewTotal} 张 · 逾期 ${c.reviewOverdue}` : `${c.reviewTotal} 张在册`;
      case "cinema":
        return `想看 ${c.cinemaWant} · 在看 ${c.cinemaWatching}`;
      case "bookshelf":
        return `在读 ${c.bookshelfReading} · 读完 ${c.bookshelfFinished}`;
      case "clipping":
        return `未读 ${c.clippingUnread} 篇`;
      case "favorites":
        return `${c.favoritesTotal} 条`;
      case "belongings":
        return `登记 ${c.belongingsTotal} 件`;
      case "collect":
        return `今日 ${c.collectToday} 条`;
      case "plan":
        return c.planTotal > 0 ? `今日打卡 ${c.planDone}/${c.planTotal}` : null;
      default:
        return null;
    }
  }
  var PLAN_CHECKIN_HEADING_RE = /^#{2,6}\s+✅\s*今日打卡\s*$/;
  function parsePlanCheckins(dailyMd) {
    const lines = (dailyMd || "").split(/\r?\n/);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (PLAN_CHECKIN_HEADING_RE.test(lines[i])) {
        start = i;
        break;
      }
    }
    if (start < 0) return { done: 0, total: 0 };
    let done = 0;
    let total = 0;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,6}\s/.test(line)) break;
      const m = line.match(/^\s*[-*]\s+\[([ xX])\]/);
      if (!m) continue;
      total++;
      if (m[1].toLowerCase() === "x") done++;
    }
    return { done, total };
  }

  // src/home/layouts/river/render.ts
  function panelFrameHtml() {
    return `
    <div class="bz-panel-frame bz-home-panel bz-panel-mtop">
      <div class="bz-home-head">
        <div class="bz-home-week" data-home-week></div>
        <span class="bz-home-date" data-home-date></span>
        <div role="button" tabindex="0" class="bz-home-close" data-home-close title="关闭" aria-label="关闭">${iconSpan("x")}</div>
      </div>
      <div class="bz-home-body">
        <div class="bz-home-grid">
          <div class="bz-home-entries" data-home-entries></div>
          <div class="bz-home-flow" data-home-flow></div>
          <div class="bz-home-next" data-home-next></div>
          <div class="bz-home-tiles" data-home-tiles></div>
        </div>
      </div>
    </div>`;
  }
  function loadingEntriesHtml() {
    return '<div class="bz-home-sec-t">全 部 域</div>';
  }
  function loadingFlowHtml() {
    return '<div class="bz-home-flow-empty">正在汇入今天的痕迹…</div>';
  }
  function weekHtml(week, todayDateStr, selDate) {
    return week.map((w) => {
      const isToday = w.dateStr === todayDateStr;
      return '<div role="button" tabindex="0" class="bz-home-wk' + (w.hit ? " bz-home-wk--hit" : "") + (w.dateStr === selDate ? " bz-home-wk--sel" : "") + '" data-home-weekday="' + w.dateStr + '" aria-label="' + (isToday ? "今天" : w.label) + (w.hit ? "，有动静" : "") + '"><i></i><span class="bz-home-wk-n">' + (isToday ? "今" : w.dayOfMonth) + "</span></div>";
    }).join("");
  }
  function entriesHtml(data, order, hidden) {
    const dotsMap = buildDots(data);
    return visibleDomains(order, hidden).map((d) => {
      var _a;
      const dot = dotOf(dotsMap, d.id);
      const ct = (_a = riverCountText(d.id, data)) != null ? _a : d.sub;
      return '<div role="button" tabindex="0" class="bz-home-erow" data-home-go="' + d.id + '"><span class="bz-home-dot bz-home-dot--' + dot + '"></span><span class="bz-home-eic" style="color:' + domainColor(d.id) + '">' + iconSpan(d.icon) + '</span><span class="bz-home-enm">' + esc(d.name) + '</span><span class="bz-home-ect">' + esc(ct) + "</span></div>";
    }).join("");
  }
  function flowHtml(data, view, opts = {}) {
    var _a, _b, _c;
    const filter = (_a = opts.filter) != null ? _a : DEFAULT_TIMELINE_FILTER;
    const showTime = opts.showTime !== false;
    const size = (_b = opts.size) != null ? _b : "normal";
    const wrap = (inner) => '<div class="bz-home-timeline" data-tl-size="' + size + '" data-tl-time="' + (showTime ? "1" : "0") + '">' + inner + "</div>";
    const day = (_c = data.days.find((d) => d.dateStr === view)) != null ? _c : data.today;
    const isToday = day.dateStr === data.today.dateStr;
    const notes = isToday && filter.notes ? buildNotes(data) : [];
    const kept = day.events.map((e, i) => ({ e, i })).filter(({ e }) => eventVisible(e, filter));
    const body = kept.map(({ e, i }) => {
      var _a2, _b2, _c2, _d, _e;
      const note = notes.find((n) => n.index === i);
      const lastDiary = i === ((_a2 = kept[kept.length - 1]) == null ? void 0 : _a2.i) && note && note.text.indexOf("日记") >= 0 ? " bz-home-ev--warn" : "";
      const memoId = e.domain;
      const dmColor = domainColor(memoId);
      const dmName = (_c2 = (_b2 = DOMAIN_MAP.get(memoId)) == null ? void 0 : _b2.name) != null ? _c2 : e.domain;
      const dmIcon = (_e = (_d = DOMAIN_MAP.get(memoId)) == null ? void 0 : _d.icon) != null ? _e : "";
      return '<div class="bz-home-ev' + lastDiary + '">' + (showTime ? '<span class="bz-home-ev-tm">' + esc(e.timeLabel) + "</span>" : "") + '<div class="bz-home-ev-bd"><div class="bz-home-ev-tx"><span class="bz-home-ev-dm" style="background:' + dmColor + '">' + iconSpan(dmIcon) + esc(dmName) + "</span>" + esc(e.text) + "</div>" + (note ? '<div class="bz-home-ev-note">' + esc(note.text) + "</div>" : "") + "</div></div>";
    }).join("");
    if (kept.length) return wrap(body);
    if (day.events.length) {
      return wrap('<div class="bz-home-flow-empty">这一天有痕迹，但都被「内容过滤」挡掉了。<br>去 <b>设置 → 首页 → 内容过滤</b> 把想看的类别勾上。</div>');
    }
    return wrap('<div class="bz-home-flow-empty">这一天还没有留下痕迹。<br><b>写一篇日记</b>、点一轮番茄、读几页书——<br>都会出现在这条河里。</div>');
  }
  function nextHtml(data, enabled = true) {
    if (!enabled) return "";
    return '<div class="bz-home-sec-t bz-home-sec-t--ai">明 天 预 告</div>' + buildPreviews(data).map(
      (pr) => '<div role="button" tabindex="0" class="bz-home-pr" data-home-go="' + pr.go + '"><div class="bz-home-pr-h">' + esc(pr.h) + "</div><div>" + esc(pr.b) + '</div><span class="bz-home-pr-go">' + esc(pr.goLabel) + "</span></div>"
    ).join("") + collectHtml(data);
  }
  function collectHtml(data) {
    const n = data.counts.collectToday;
    const items = data.collectRecent;
    const head = '<div class="bz-home-collect-h"><span class="bz-home-collect-t">今 日 收 集</span><span class="bz-home-collect-n">' + n + " 条</span></div>";
    const body = items.length ? items.map(
      (it) => '<div class="bz-home-collect-it"><span class="bz-home-collect-cat">' + esc(it.category) + '</span><span class="bz-home-collect-tx">' + esc(truncateCollect(it.text)) + "</span></div>"
    ).join("") : '<div class="bz-home-collect-empty">今天还没有收集，随手记一条灵感吧。</div>';
    return '<div role="button" tabindex="0" class="bz-home-collect" data-home-go="collect" title="打开日常收集">' + head + '<div class="bz-home-collect-bd">' + body + '</div><span class="bz-home-collect-go">去收集 →</span></div>';
  }
  function tilesHtml(data, order, hidden) {
    const dotsMap = buildDots(data);
    return '<div class="bz-home-m-tiles">' + visibleDomains(order, hidden).map((d) => {
      var _a;
      const dot = dotOf(dotsMap, d.id);
      const ct = (_a = riverCountText(d.id, data)) != null ? _a : d.sub;
      return '<div role="button" tabindex="0" class="bz-home-m-tile" data-home-go="' + d.id + '"><span class="bz-home-dot bz-home-dot--' + dot + '"></span><span class="bz-home-eic" style="color:' + domainColor(d.id) + '">' + iconSpan(d.icon) + '</span><span class="bz-home-enm">' + esc(d.name) + '</span><span class="bz-home-ect">' + esc(ct) + "</span></div>";
    }).join("") + "</div>";
  }
  return __toCommonJS(render_exports);
})();
