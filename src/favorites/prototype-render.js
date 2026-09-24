/* 构建产物（勿手改）：node scripts/build-preview.mjs — src/favorites/render.ts → window.BZR_favorites（评审壳预览包，ADR-0104） */
var BZR_favorites = (() => {
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

  // src/favorites/render.ts
  var render_exports = {};
  __export(render_exports, {
    ICON: () => ICON,
    RESERVED_TAG_LABELS: () => RESERVED_TAG_LABELS,
    VIEW_ALL: () => VIEW_ALL,
    VIEW_ARCHIVED: () => VIEW_ARCHIVED,
    actionSpecs: () => actionSpecs,
    archivedItems: () => archivedItems,
    boardHtml: () => boardHtml,
    cardHtml: () => cardHtml,
    chipsHtml: () => chipsHtml,
    emptyHtml: () => emptyHtml,
    esc: () => esc,
    filteredItems: () => filteredItems,
    formHtml: () => formHtml,
    hueOf: () => hueOf,
    iconSpan: () => iconSpan,
    localNow: () => localNow,
    normalizeFavSort: () => normalizeFavSort,
    panelHtml: () => panelHtml,
    pickChipsHtml: () => pickChipsHtml,
    poolOf: () => poolOf,
    relTime: () => relTime,
    renderBoardInto: () => renderBoardInto,
    renderPanelView: () => renderPanelView,
    renderTagsInto: () => renderTagsInto,
    safeTagIcon: () => safeTagIcon,
    tagCount: () => tagCount,
    visibleItems: () => visibleItems
  });

  // src/core/ui/str.ts
  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }
  function esc(s) {
    return escapeHtml(String(s != null ? s : ""));
  }
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function localNow() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  function relTime(s, now = Date.now()) {
    if (!s) return "";
    const d = new Date(s.replace(" ", "T"));
    if (isNaN(d.getTime())) return s;
    const diff = now - d.getTime();
    const m = 6e4, h = 36e5, day = 864e5;
    if (diff < m) return "刚刚";
    if (diff < h) return Math.floor(diff / m) + " 分钟前";
    if (diff < day) return Math.floor(diff / h) + " 小时前";
    if (diff < 7 * day) return Math.floor(diff / day) + " 天前";
    return `${d.getMonth() + 1}-${pad2(d.getDate())}`;
  }
  function emptyHtmlStr(icon, title, desc) {
    return `<div class="bz-empty">${icon ? iconSpan(icon, "bz-empty-ic") : ""}<div class="bz-empty-title">${esc(title)}</div>${desc ? `<div class="bz-empty-desc">${esc(desc)}</div>` : ""}</div>`;
  }
  function iconSpan(name, extra = "") {
    return `<i data-lucide="${name}" class="bz-ic${extra ? " " + extra : ""}"></i>`;
  }

  // src/core/settings-provider.ts
  var _provider = null;
  function tryGetSettings() {
    return _provider ? _provider() : {};
  }

  // src/favorites/tags.ts
  var TAGS_SETTINGS_KEY = "favoriteTags";
  var tagIdSeq = 0;
  var DEFAULT_TAGS = [
    { id: "github", label: "GitHub", ic: "github" },
    { id: "desktop", label: "桌面软件", ic: "app-window" },
    { id: "web", label: "网站", ic: "globe" },
    { id: "llm", label: "大模型", ic: "brain-circuit" },
    { id: "pi", label: "pi", ic: "keyboard" },
    { id: "claude", label: "Claude", ic: "bot" },
    { id: "skills", label: "skills", ic: "zap" },
    { id: "pub", label: "酒馆", ic: "beer" },
    { id: "dsh", label: "DeepSeek Harness", ic: "waypoints" }
  ];
  var currentTags = null;
  function tagsFromSettings() {
    var _a;
    return normalizeTags((_a = tryGetSettings()) == null ? void 0 : _a[TAGS_SETTINGS_KEY]);
  }
  function getTags() {
    if (!currentTags) {
      const tags = tagsFromSettings();
      currentTags = tags.length ? tags : DEFAULT_TAGS;
    }
    return currentTags;
  }
  function normalizeTags(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const o = r;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label) continue;
      out.push({
        id: typeof o.id === "string" && o.id ? o.id : newTagId(),
        label,
        ic: typeof o.ic === "string" && o.ic ? o.ic : "tag"
      });
    }
    return out;
  }
  function newTagId() {
    tagIdSeq = (tagIdSeq + 1) % 1679616;
    return "t" + Date.now().toString(36) + tagIdSeq.toString(36);
  }

  // src/favorites/shared.ts
  var VIEW_ALL = "__all";
  var VIEW_ARCHIVED = "__archived";
  var RESERVED_TAG_LABELS = [
    "全部",
    "已归档",
    VIEW_ALL,
    VIEW_ARCHIVED,
    "@last",
    "@archived"
  ];
  function safeTagIcon(ic) {
    const s = typeof ic === "string" ? ic : "";
    return /^[a-z0-9-]+$/i.test(s) ? s : "tag";
  }
  var ICON = {
    close: "x",
    add: "plus",
    open: "external-link",
    copy: "copy",
    pin: "pin",
    pinOff: "pin-off",
    edit: "pencil",
    archive: "archive",
    unarchive: "archive-restore",
    del: "trash-2",
    ai: "sparkles"
  };
  function normalizeFavSort(v) {
    return v === "old" || v === "title" ? v : "new";
  }
  function hueOf(label) {
    if (!label) return 210;
    const m = {
      GitHub: 215,
      桌面软件: 160,
      网站: 30,
      大模型: 265,
      pi: 100,
      Claude: 20,
      skills: 50,
      酒馆: 330,
      "DeepSeek Harness": 195
    };
    if (m[label] != null) return m[label];
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 360;
    return h;
  }
  function visibleItems(items) {
    return items.filter((i) => !i.archived);
  }
  function archivedItems(items) {
    return items.filter((i) => !!i.archived);
  }
  function poolOf(items, view) {
    return view.archived ? archivedItems(items) : visibleItems(items);
  }
  function tagCount(items, label) {
    return visibleItems(items).filter((i) => (i.tags || []).includes(label)).length;
  }
  function filteredItems(items, view) {
    let list = poolOf(items, view);
    if (!view.archived && view.tag) list = list.filter((i) => (i.tags || []).includes(view.tag));
    const byTimeDesc = (a, b) => (b.created || "").localeCompare(a.created || "") || (b.id || "").localeCompare(a.id || "");
    const cmp = view.sort === "old" ? (a, b) => (a.created || "").localeCompare(b.created || "") || (a.id || "").localeCompare(b.id || "") : view.sort === "title" ? (a, b) => (a.title || "").localeCompare(b.title || "", "zh-CN") || byTimeDesc(a, b) : byTimeDesc;
    const base = [...list].sort(cmp);
    const pinned = base.filter((i) => i.pinned);
    const rest = base.filter((i) => !i.pinned);
    return [...pinned, ...rest];
  }
  function cardHtml(it, idx) {
    const pinnedCls = it.pinned ? " bz-fav-pinc" : "";
    const archCls = it.archived ? " bz-fav-arch" : "";
    const hue = hueOf((it.tags || [])[0] || "");
    const tape = "bz-fav-tape" + (idx % 3 ? [" bz-fav-tape--r", " bz-fav-tape--g"][idx % 3 - 1] : "");
    return `<div class="bz-fav-card${pinnedCls}${archCls}" data-fav-id="${esc(it.id)}" role="button" tabindex="0">
    <span class="${tape}"></span>
    <span class="bz-fav-dot" style="--c:hsl(${hue} 52% 58%)"></span>
    <h3>${esc(it.title || "无标题")}</h3>
    <p>${esc(it.description || "（这张卡只写了个名字）")}</p>
    <div class="bz-fav-ft"><span class="bz-fav-tags-row">${(it.tags || []).map((t) => {
      const h = hueOf(t);
      const ic = safeTagIcon((getTags().find((x) => x.label === t) || { ic: "" }).ic);
      return `<span class="bz-fav-tagb" style="background:hsl(${h} 70% 95%);color:hsl(${h} 45% 42%)">${ic ? iconSpan(ic, "bz-ic--xs") : ""}<span>${esc(t)}</span></span>`;
    }).join("")}</span>
      <span>${esc(relTime(it.created))}</span></div>
  </div>`;
  }
  function emptyHtml(view, items) {
    if (view && items) {
      if (view.archived) {
        return `<div class="bz-fav-empty">${emptyHtmlStr("archive", "归档箱是空的", "归档的收藏会冷存在这里，可随时恢复")}</div>`;
      }
      if (view.tag && !visibleItems(items).some((i) => (i.tags || []).includes(view.tag))) {
        return `<div class="bz-fav-empty">${emptyHtmlStr("inbox", `「${view.tag}」标签下还没有收藏`, "换个标签看看，或添加一条试试")}</div>`;
      }
    }
    return `<div class="bz-fav-empty">${emptyHtmlStr("inbox", "这块板上还没有卡片", "添加第一条收藏试试")}</div>`;
  }
  function actionSpecs(it) {
    const acts = [];
    if ((it.url || "").trim()) acts.push({ icon: ICON.open, label: "打开", act: "open" });
    if ((it.url || "").trim()) acts.push({ icon: ICON.copy, label: "复制网址", act: "copy" });
    acts.push({
      icon: it.pinned ? ICON.pinOff : ICON.pin,
      label: it.pinned ? "取消置顶" : "置顶",
      act: "pin"
    });
    acts.push({ icon: ICON.edit, label: "编辑", act: "edit" });
    acts.push(it.archived ? { icon: ICON.unarchive, label: "取消归档", act: "unarchive" } : { icon: ICON.archive, label: "归档", act: "archive" });
    acts.push({ icon: ICON.del, label: "删除", act: "del", danger: true });
    return acts;
  }
  function pickChipsHtml(sel) {
    return getTags().map(
      (t) => `<button type="button" class="${sel.has(t.label) ? "bz-fav-on" : ""}" data-tag="${esc(t.label)}">${iconSpan(safeTagIcon(t.ic), "bz-ic--xs")}<span>${esc(t.label)}</span></button>`
    ).join("");
  }
  function formHtml(it) {
    const editing = !!it;
    return `<div class="bz-fav-form">
    <h2>${editing ? "编辑收藏" : "添加收藏"}</h2>
    <div class="bz-fav-fld"><label>标题</label><input id="fz-title" value="${esc(it ? it.title : "")}" placeholder="如：某篇好文"></div>
    <div class="bz-fav-fld"><label>链接</label><input id="fz-url" value="${esc(it ? it.url : "")}" placeholder="https://…"></div>
    <div class="bz-fav-fld"><label>简介</label><textarea id="fz-desc" placeholder="一句话记住它…">${esc(it ? it.description || "" : "")}</textarea></div>
    <div class="bz-fav-fld"><label>标签（可多选）</label><div class="bz-fav-pick" id="fz-tags"></div></div>
    <div class="bz-fav-fld bz-fav-inline"><span class="bz-fav-sw${it && it.pinned ? " bz-fav-on" : ""}" id="fz-pin" role="switch" tabindex="0" aria-checked="${!!(it && it.pinned)}"></span><span class="bz-fav-fld-desc">置顶后恒排最前</span></div>
    <div class="bz-fav-err" id="fz-err"></div>
    <!-- 提交动词全域拍板（review-deep 一致#9）：编辑=保存、新建=添加（memo/cinema/diary 多数派，
         与本域标签表单 existing ? '保存' : '添加' 对齐，域内不再二分） -->
    <div class="bz-fav-btns">
      <button type="button" id="fz-ai" class="bz-fav-ai-btn">${iconSpan(ICON.ai, "bz-ic--xs")} <span>AI 整理</span></button>
      <button type="button" data-fz-cancel>取消</button>
      <button type="button" id="fz-save" class="bz-fav-pri">${editing ? "保存" : "添加"}</button>
    </div>
  </div>`;
  }

  // src/favorites/layouts/board/render.ts
  function panelHtml(mobile) {
    const mob = mobile ? " bz-fav-mob bz-panel-mtop" : "";
    return `<div class="bz-fav-panel bz-fav-scope${mob}">
  <div class="bz-fav-head"><h1>收藏本</h1><button class="bz-fav-mob-close bz-touch-target bz-touch-target--xl" data-fav-close title="关闭">${iconSpan(ICON.close, "bz-ic--xs")}</button></div>
  <div class="bz-fav-tags" data-fav-tags></div>
  <div class="bz-fav-board" data-fav-content></div>
</div>`;
  }
  function chipsHtml(items, view, mobile) {
    const mk = (dataVal, display, ic, cnt, active, grey = false, empty = false) => `<button class="bz-fav-chip${active ? " bz-fav-on" : ""}${grey ? " bz-fav-chip--grey" : ""}${empty ? " bz-fav-chip--empty" : ""}" data-fav-tag="${esc(dataVal)}"${active ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${ic ? iconSpan(ic, "bz-ic--xs") : ""}<span>${esc(display)} ${cnt}</span></button>`;
    const add = `<button class="bz-fav-chip-add" data-fav-add title="添加收藏" aria-label="添加收藏">${iconSpan(ICON.add, "bz-ic--xs")}<span>新收藏</span></button>`;
    const chips = mk(VIEW_ALL, "全部", "", visibleItems(items).length, !view.archived && view.tag === null) + mk(VIEW_ARCHIVED, "已归档", "archive", archivedItems(items).length, view.archived, true) + getTags().map((t) => {
      const n = tagCount(items, t.label);
      const active = !view.archived && view.tag === t.label;
      if (!n && !active) return "";
      return mk(t.label, t.label, safeTagIcon(t.ic), n, active, false, !n);
    }).join("");
    return mobile ? add + chips : chips + add;
  }
  function boardHtml(items, view) {
    const list = filteredItems(items, view);
    if (!list.length) return emptyHtml(view, items);
    const idxMap = new Map(items.map((it, i) => [it, i]));
    return list.map((it) => {
      var _a;
      return cardHtml(it, (_a = idxMap.get(it)) != null ? _a : 0);
    }).join("");
  }
  function renderTagsInto(mount, items, view, hooks) {
    mount.innerHTML = chipsHtml(items, view, hooks.mobile);
    hooks.mountIcons(mount);
  }
  function renderBoardInto(board, items, view, hooks) {
    const keep = board.scrollTop;
    board.innerHTML = boardHtml(items, view);
    board.scrollTop = keep;
    hooks.mountIcons(board);
  }
  function renderPanelView(panel, items, view, hooks) {
    const tags = panel.querySelector("[data-fav-tags]");
    if (tags) renderTagsInto(tags, items, view, hooks);
    const board = panel.querySelector("[data-fav-content]");
    if (board) renderBoardInto(board, items, view, hooks);
  }
  return __toCommonJS(render_exports);
})();
