/**
 * 影院（cinema）域 UI：风格化面板·行为层（issue 236 / ADR-0103）
 * markup 单源已迁 render 纯层（ADR-0104/0105）：共享件（详情/表单/菜单/抽屉/确认/AI/设置
 * 弹窗）在 shared.ts，午夜场 desk/mob 壳与渲染胶水在 layouts/midnight/——ui.ts 经域入口
 * render.ts 消费同一份（与原型壳 prototype-render.js 同源）。本文件只留：
 * 事件绑定 / core 服务（落盘、通知、域事件、ESC、全屏、图标物化）/ AI·分析·海报守护接线。
 * 三风格单键 cinemaStyle（清单 CINEMA_STYLES）；共享弹窗宿主为 display:contents 的
 * .bz-cinema--midnight 锚类容器。业务层零迁移：persistItem 落盘 / smartcat movie 域事件 /
 * AI 推荐 / 分析统计 / 海报守护全部原样。
 * 落域适配（ADR-0103 §5，原型不出）：移动头行补 ✕ 关闭钮；移动 ✦ 再点回列表。
 * 图标：lucide（纯层 data-lucide 占位 → mountIcons 统一 setIcon）；弹窗 ESC 走 escManager 层级。
 */
import type { App, IconName } from 'obsidian';
import { TFile } from 'obsidian';
import { notice, notifySaveError } from '../core/notice';
import { emitDomainEvent } from '../core/domain-bus';
import { escManager, registerPanelEsc, unregisterPanelEsc } from '../core/esc-manager';
import { isMobileEnv } from '../core/mobile';
import { topifyZ, longPress } from '../core/dom';
import { openItemMenu, openItemSheet, closeItemMenu, resetItemMenuClickGuard, type ItemAction } from '../core/item-actions';
import { tryGetSettings } from '../core/settings-provider';
import { mountIcons } from '../core/ui';
import {
  STATUS_WANT, STATUS_WATCHING, STATUS_WATCHED, DEFAULT_RATING,
  getGroupForTag, getGroupSafe, doubanEligibleTag, episodesEligibleTag,
} from './constants';
import { M, type CinemaItem, type CinemaSortMode } from './state';
import { rebuildItems, getDisplayItems, parseEpisodeCount } from './data';
import { localNow, esc } from '../core/ui/str';
import { getCountryOptions, getGenreOptions, addCountryOption, addGenreOption } from './options';
import { runAIRecommend, runSimilarRecommend, buildTasteProfile, quickAddWant } from './recommend';
import { buildAnalysisHTML } from './analysis';
import { enqueueDoubanFetch, dequeueDoubanFetch, isFetching } from './douban-queue';
import {
  ICON, statusText, itemByKey, itemKey, doubanSearchUrl,
  detailModalHtml, confirmModalHtml, formModalHtml, optionChipsHtml, genreLabel,
  aiPageHtml, sheetHeadHtml, pcardHtml, type AiPageInput,
  midnightDeskHtml, midnightMobHtml, renderMidnightDesk, renderMidnightMob,
  type MidnightRenderInput,
} from './render';

// ---------- 小工具 ----------

// ---------- 海报 ----------

/** 海报资源 URL（vault 资源路径）；无图返回 null（markup 侧只认 URL，资源解析留行为层） */
function posterUrl(item: CinemaItem, app: App): string | null {
  if (!item.poster) return null;
  const f = app.vault.getAbstractFileByPath(item.poster);
  if (f && f instanceof TFile && /\.(png|jpe?g|gif|webp)$/i.test(f.name)) {
    return app.vault.getResourcePath(f);
  }
  return null;
}

// ---------- 稳定键（CM3：file.path / new:name） ----------

function itemByKeyInState(key: string | undefined): CinemaItem | undefined {
  return itemByKey(M.items, key);
}

// ---------- 通用业务（菜单/抽屉动作、快速状态、豆瓣） ----------

/** 在豆瓣打开：有豆瓣链接走链接，否则走片名搜索页（新窗） */
function openDouban(item: CinemaItem): void {
  const url = item.doubanUrl || doubanSearchUrl(item.name);
  try {
    window.open(url, '_blank');
  } catch {
    /* jsdom 未实现 window.open：忽略 */
  }
}

/** 快速标记状态（菜单/抽屉「标记在看」）：状态流转 + 刷新观影日期 + 域事件补发。
 *  「标记已看」已改走编辑窗（评分影评由用户在表单输入，saveEdit 落盘时补发同款域事件） */
async function markStatus(item: CinemaItem, target: '在看' | '已看', sec: HTMLElement, app: App): Promise<void> {
  const fromSt = item.status === STATUS_WANT ? 'want' : item.status === STATUS_WATCHING ? 'watching' : 'watched';
  const prevRating = item.rating && item.rating > 0 ? item.rating : null;
  // G7：先记快照，落盘失败回滚内存（saveEdit 同法）——否则面板显示与磁盘相反
  const prev = { status: item.status, rating: item.rating, watchDate: item.watchDate };
  item.status = target === '已看' ? STATUS_WATCHED : STATUS_WATCHING;
  if (target === '在看') {
    item.rating = 0;
  } else if (!prevRating) {
    item.rating = DEFAULT_RATING;
  }
  item.watchDate = localNow();
  try {
    await persistItem(item, app);
    panelToast(sec, `已把「${item.name}」标记为${target}`);
    const toSt = target === '已看' ? 'watched' : 'watching';
    if (toSt !== fromSt) emitDomainEvent('movie', { kind: 'status', name: item.name, from: fromSt, to: toSt });
    if (item.rating !== null && item.rating > 0 && item.rating !== prevRating) {
      emitDomainEvent('movie', { kind: 'rated', name: item.name, fromRating: prevRating, toRating: item.rating });
    }
    renderAll(app);
  } catch (e) {
    Object.assign(item, prev);
    notifySaveError(e);
    console.error(e);
    renderAll(app);
  }
}

/** 菜单/抽屉动作列表（顺序即显示顺序） */
interface MenuAct { icon: string; label: string; danger?: boolean; run: () => void }
function itemActions(it: CinemaItem, sec: HTMLElement, app: App): MenuAct[] {
  const out: MenuAct[] = [{ icon: ICON.eye, label: '打开详情', run: () => openDetail(sec, it, app) }];
  if (it.status !== STATUS_WATCHING && it.status !== STATUS_WATCHED) {
    out.push({ icon: ICON.play, label: '标记在看', run: () => void markStatus(it, '在看', sec, app) });
  }
  if (it.status !== STATUS_WATCHED) {
    // 标记已看不直改状态/评分：改走编辑窗预选「已看」，评分影评由用户确认后保存（memo item-1789105594322）
    out.push({ icon: 'check', label: '标记已看', run: () => openForm(sec, it, app, '已看') });
  }
  out.push(
    { icon: ICON.ai, label: '找同类', run: () => void runSimilarRecommend(it, app) },
    { icon: ICON.globe, label: '在豆瓣打开', run: () => openDouban(it) },
    { icon: ICON.edit, label: '编辑', run: () => openForm(sec, it, app) },
    { icon: ICON.del, label: '删除', danger: true, run: () => openConfirm(sec, it, app) },
  );
  return out;
}

// ---------- 落盘（数据契约零改动） ----------

/** 文件名非法字符（Windows 保留集；名称源自文件名《X》，改名前拦截） */
const ILLEGAL_NAME_RE = /[\\/:*?"<>|]/;

/**
 * 把条目落盘：新增建笔记，编辑/快速状态写 frontmatter（保留海报/豆瓣字段）；
 * 改名走 fileManager.renameFile（自动更新双链）；类型写入 frontmatter tags。
 */
async function persistItem(item: CinemaItem, app: App, edit?: { prevName: string; prevTag: string }): Promise<void> {
  if (!item.file) {
    const folder = M.folderPath;
    if (!app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder);
    }
    const filePath = `${folder}/《${item.name}》.md`;
    const drama = episodesEligibleTag(item.typeTag);
    const epsLines = drama && item.episodesTotal !== null ? `总集数: ${item.episodesTotal}\n${item.episodesWatching !== null ? `正在看集数: ${item.episodesWatching}\n` : ''}` : '';
    const content = `---\ntags:\n- ${item.typeTag}\n${item.country ? `国家: ${item.country}\n` : ''}${item.genres.length ? `类型: ${item.genres.join('、')}\n` : ''}${epsLines}观影日期: ${item.watchDate || localNow()}\n评分: ${item.rating ?? 0}\n${item.review ? `影评: ${item.review}\n` : ''}海报: \n---\n`;
    const f = await app.vault.create(filePath, content);
    item.file = f;
    return;
  }
  if (edit && item.name !== edit.prevName) {
    const newPath = `${M.folderPath}/《${item.name}》.md`;
    if (newPath !== item.file.path) {
      await app.fileManager.renameFile(item.file, newPath);
      item.file = (app.vault.getAbstractFileByPath(newPath) as CinemaItem['file']) || item.file;
    }
  }
  await app.fileManager.processFrontMatter(item.file, (fm: Record<string, unknown>) => {
    fm['评分'] = item.rating ?? 0;
    fm['观影日期'] = item.watchDate || localNow();
    if (item.review) fm['影评'] = item.review;
    else delete fm['影评'];
    if (edit) {
      const tags = Array.isArray(fm['tags'])
        ? (fm['tags'] as unknown[]).map((t) => String(t))
        : typeof fm['tags'] === 'string' && fm['tags']
          ? [fm['tags'] as string]
          : [];
      const at = tags.indexOf(edit.prevTag);
      if (at >= 0) tags[at] = item.typeTag;
      else if (!tags.includes(item.typeTag)) tags.unshift(item.typeTag);
      fm['tags'] = tags;
      // 票 294：国家单选 / 题材多选（复用 fm 键「类型」，顿号分隔；空则删键）
      if (item.country) fm['国家'] = item.country;
      else delete fm['国家'];
      if (item.genres.length) fm['类型'] = item.genres.join('、');
      else delete fm['类型'];
      // 票 295：集数两键仅剧类写入，其余类型不残留
      if (episodesEligibleTag(item.typeTag)) {
        if (item.episodesTotal !== null) fm['总集数'] = item.episodesTotal;
        else delete fm['总集数'];
        if (item.episodesWatching !== null) fm['正在看集数'] = item.episodesWatching;
        else delete fm['正在看集数'];
      } else {
        delete fm['总集数'];
        delete fm['正在看集数'];
      }
    }
  });
}

/** 打开添加弹窗（命令 bz-cinema-add 直达；未开主面板则先建） */
export function openAddModalDirect(app: App): void {
  if (!M.currentOverlay) createOverlay(app);
  const root = M.currentOverlay?.querySelector<HTMLElement>('[data-cinema-root]');
  if (root) openForm(root, null, app);
}

// ---------- 面板统计/标题 ----------

function watchedCount(): number {
  return M.items.filter((it) => it.status === STATUS_WATCHED).length;
}
/** 列表标题 = 筛选名（组 + 国家 + 状态叠加） */
function listTitle(): string {
  let t = M.typeFilter || '全部';
  if (M.countryFilter) t += ` · ${M.countryFilter === '未填' ? '国家未填' : M.countryFilter}`;
  if (M.statusFilter) t += ` · ${M.statusFilter}`;
  return t;
}
/** 网格每行列数（设置 cinemaGridColumns；空值/非法回退 5，钳制 2~12） */
export function gridColumns(): number {
  const raw = Number((tryGetSettings() as Record<string, unknown>).cinemaGridColumns);
  if (!Number.isFinite(raw) || raw <= 0) return 5;
  return Math.min(12, Math.max(2, Math.round(raw)));
}

// ---------- 共享弹窗宿主（display:contents 午夜场锚类：三风格共用弹窗样式，ADR-0103 §3） ----------

function ovHost(sec: HTMLElement): HTMLElement {
  let host = sec.querySelector<HTMLElement>('[data-cinema-ovhost]');
  if (!host) {
    host = document.createElement('div');
    host.className = 'bz-cinema--midnight';
    host.setAttribute('data-cinema-ovhost', '');
    host.style.display = 'contents';
    sec.appendChild(host);
  }
  return host;
}

interface OvlHandle { el: HTMLDivElement; close: () => void }

let ovlSeq = 0;

/** 面板内弹窗层（.cn-ovl 挂共享宿主；ESC 走 escManager 层级，后注册先关） */
function ovl(sec: HTMLElement, html: string, opts: { sticky?: boolean } = {}): OvlHandle {
  const el = document.createElement('div');
  el.className = 'cn-ovl';
  el.innerHTML = html;
  ovHost(sec).appendChild(el);
  let close = () => {};
  const handle = escManager.register(`bz-cinema-ovl-${++ovlSeq}`, { isVisible: () => el.isConnected, close: () => close() });
  close = () => { handle.unregister(); el.remove(); };
  el.addEventListener('click', (e) => { if (e.target === el && !opts.sticky) close(); });
  return { el, close };
}

/** 面板内 toast（原型 .cn-toast 同构；无面板时回落 core notice） */
function panelToast(sec: HTMLElement | null, msg: string): void {
  if (!sec || !sec.isConnected) { notice(msg); return; }
  const t = document.createElement('div');
  t.className = 'cn-toast';
  t.textContent = msg;
  ovHost(sec).appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ---------- 弹窗：跟手菜单 / 长按抽屉（统一走 core/item-actions） ----------
//
// 手势与浮层实现全部交由共享层：桌面 contextmenu → core openItemMenu；移动端长按 →
// core/dom.longPress → core openItemSheet。防穿透（长按松手补发的合成 click 会命中刚
// 打开的遮罩把抽屉关掉，用户感知「长按没反应」）、下滑关闭、ESC、外部点击关闭、键盘导航
// 均由 core 承载；本域只传动作集与皮肤类（观感见 styles.css 的皮肤段）。

/** 浮层皮肤类（取色锚 cn-skin：core 浮层挂 body，不在面板树内，取不到午夜场调色板） */
const MENU_SKIN = 'cn-skin cn-menu-skin';
const SHEET_SKIN = 'cn-skin cn-sheet-skin';

/** 域动作 → core ItemAction（icon 为 lucide 名，与 ItemAction.icon 同源） */
function toItemActions(acts: MenuAct[]): ItemAction[] {
  return acts.map((a) => ({
    icon: a.icon as IconName,
    label: a.label,
    kind: a.danger ? 'danger' : undefined,
    onClick: a.run,
  }));
}

/** 抽屉头部节点（海报 + 名称 + meta）：markup 单源 shared.sheetHeadHtml，core 侧要元素 */
function sheetHeadEl(it: CinemaItem, url: string | null): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = sheetHeadHtml(it, url);
  return (box.firstElementChild as HTMLElement) ?? box;
}

/** 移动端长按 → 底部抽屉（手势 core/dom.longPress；卡片每次重渲染重建后重挂）。 */
function attachLongPress(sec: HTMLElement, app: App): void {
  sec.querySelectorAll<HTMLElement>('.m-grid .pcard').forEach((c) => {
    // 原生长按菜单（保存图片/复制链接）让位给抽屉
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
    longPress(c, () => {
      const it = itemByKeyInState(c.dataset.cinemaKey);
      if (!it) return;
      openSheet(sec, it, app);
    });
  });
}

/** 移动端抽屉：core openItemSheet（遮罩 + 底部滑入 + 头部信息 + 动作行，皮肤保午夜场观感） */
function openSheet(sec: HTMLElement, it: CinemaItem, app: App): void {
  if (!sec.isConnected) return;
  openItemSheet(toItemActions(itemActions(it, sec, app)), {
    sheetClass: SHEET_SKIN,
    sheetHead: sheetHeadEl(it, posterUrl(it, app)),
  });
}

// ---------- 弹窗：详情 ----------

function openDetail(sec: HTMLElement, it: CinemaItem, app: App): void {
  const url = posterUrl(it, app);
  const { el, close } = ovl(sec, detailModalHtml(it, url));
  mountIcons(el);
  el.querySelector('.j-edit')?.addEventListener('click', () => { close(); openForm(sec, it, app); });
  el.querySelector('.j-del')?.addEventListener('click', () => { close(); openConfirm(sec, it, app); });
  el.querySelector('.j-similar')?.addEventListener('click', () => { close(); void runSimilarRecommend(it, app); });
}

/**
 * 随机抽一部（命令 bz-cinema-random-pick，2026-09-11 首页入口菜单）：
 * 从「想看」池随机挑一部并**直接开详情**（选择困难时的出口）；想看池空则退到全量并说明，
 * 免得点了没反应。面板未打开则先冷开面板再叠详情弹窗（与「影视分析报告」同一打开口径）。
 */
export function openRandomMovie(app: App): void {
  rebuildItems(app);
  const want = M.items.filter((it) => it.status === STATUS_WANT);
  const pool = want.length ? want : M.items;
  if (!pool.length) {
    notice('娱乐里还没有条目可抽');
    return;
  }
  const it = pool[Math.floor(Math.random() * pool.length)];
  if (!M.currentOverlay) createOverlay(app);
  // C（补扫 cinema P3）：面板已开时先整刷（pickRandomCinema 已把 M.view 回落 list，样板同
  // openCinemaAnalysis 的「已开则 renderAll」分支）——否则详情弹窗叠在旧 ai/stat 页上，状态与画面错位
  else renderAll(app);
  const root = M.currentOverlay?.querySelector<HTMLElement>('[data-cinema-root]');
  if (!root) return;
  openDetail(root, it, app);
  notice(want.length ? `抽到「${it.name}」` : `想看清单空着，从全部条目里抽到「${it.name}」`, 'success');
}

// ---------- 弹窗：添加 / 编辑表单 ----------

/** 待选项并集（基础池在前，已选但不在池中的值补在尾——豆瓣解析出的题材直接可选，票 294） */
function mergePool(base: string[], extra: string[]): string[] {
  const out = [...base];
  for (const v of extra) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** 添加/编辑表单弹窗。presetSt：预选状态（中文口径，如「已看」）——「标记已看」入口传入，
 *  状态 chip 预选、评分滑杆（预填当前评分，无则默认分）与影评框自动展开；弹窗本身不落盘，保存才生效 */
function openForm(sec: HTMLElement, item: CinemaItem | null, app: App, presetSt?: string): void {
  const editing = !!item;
  const initTag = item ? item.typeTag : '电影';
  const initSt = presetSt ?? (item ? statusText(item.status) : '想看');
  const ratingVal = item && item.rating && item.rating > 0 ? item.rating : DEFAULT_RATING;
  const countryPool = mergePool(getCountryOptions(), item?.country ? [item.country] : []);
  // 票 299：题材池按顶级类型隔离（书籍=体裁默认中图法 22 大类）；已选值恒可见（mergePool 兜底）
  let genrePool = mergePool(getGenreOptions(getGroupSafe(initTag)), item?.genres ?? []);
  const { el, close } = ovl(sec, formModalHtml({
    editing, name: item ? item.name : '', typeTag: initTag, stText: initSt,
    rating: ratingVal, review: item ? item.review ?? '' : '',
    country: item?.country ?? null, genres: item?.genres ?? [],
    countryOptions: countryPool, genreOptions: genrePool,
    epsTotal: item?.episodesTotal ?? null, epsWatching: item?.episodesWatching ?? null,
  }));
  mountIcons(el);
  const cur = { tag: initTag, st: initSt, country: item?.country ?? null, genres: [...(item?.genres ?? [])] };
  // 票 299：切类型后题材池与「体裁/题材」行标签跟随目标组重取
  const syncGenrePool = (tag: string) => {
    genrePool = mergePool(getGenreOptions(getGroupSafe(tag)), cur.genres);
    const label = el.querySelector('.j-genre-label');
    if (label) label.textContent = genreLabel(getGroupSafe(tag), true);
    syncGenres();
  };
  // 票 295：集数行仅 剧类（电视剧/短剧）且「在看」时可见
  const epsVisible = () => episodesEligibleTag(cur.tag) && cur.st === '在看';
  const syncEps = () => {
    const eps = el.querySelector('.j-eps') as HTMLElement | null;
    if (eps) eps.style.display = epsVisible() ? '' : 'none';
  };
  el.querySelectorAll<HTMLElement>('[data-f-tag]').forEach((b) => b.addEventListener('click', () => {
    cur.tag = b.dataset.fTag ?? cur.tag;
    el.querySelectorAll('[data-f-tag]').forEach((x) => x.classList.toggle('is-on', x === b));
    syncGenrePool(cur.tag);
    syncEps();
  }));
  // 票 294：国家（单选，再点取消）与题材（多选）chips——委托绑在容器上，自定义添加后重绘行不丢事件
  const syncCountries = () => {
    const row = el.querySelector('.j-countries');
    if (row) row.innerHTML = optionChipsHtml(countryPool, cur.country ? [cur.country] : [], 'f-country', false);
  };
  const syncGenres = () => {
    const row = el.querySelector('.j-genres');
    if (row) row.innerHTML = optionChipsHtml(genrePool, cur.genres, 'f-genre', true);
  };
  el.querySelector('.j-countries')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.j-add-opt')) {
      promptOptionValue(sec, '添加国家', async (v) => {
        await addCountryOption(v);
        if (!countryPool.includes(v)) countryPool.push(v);
        cur.country = v;
        syncCountries();
      });
      return;
    }
    const b = t.closest('[data-f-country]') as HTMLElement | null;
    if (!b) return;
    cur.country = cur.country === (b.dataset.fCountry ?? null) ? null : (b.dataset.fCountry ?? null);
    syncCountries();
  });
  el.querySelector('.j-genres')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.j-add-opt')) {
      const g = getGroupSafe(cur.tag);
      promptOptionValue(sec, g === '书籍' ? '添加体裁' : '添加题材', async (v) => {
        await addGenreOption(g, v);
        if (!genrePool.includes(v)) genrePool.push(v);
        if (!cur.genres.includes(v)) cur.genres.push(v);
        syncGenres();
      });
      return;
    }
    const b = t.closest('[data-f-genre]') as HTMLElement | null;
    if (!b) return;
    const v = b.dataset.fGenre ?? '';
    if (!v) return;
    const at = cur.genres.indexOf(v);
    if (at >= 0) cur.genres.splice(at, 1);
    else cur.genres.push(v);
    syncGenres();
  });
  el.querySelectorAll<HTMLElement>('[data-f-st]').forEach((b) => b.addEventListener('click', () => {
    cur.st = b.dataset.fSt ?? cur.st;
    el.querySelectorAll('[data-f-st]').forEach((x) => x.classList.toggle('is-on', x === b));
    const show = cur.st === '已看';
    (el.querySelector('.j-rating') as HTMLElement).style.display = show ? '' : 'none';
    (el.querySelector('.j-review') as HTMLElement).style.display = show ? '' : 'none';
    syncEps();
  }));
  el.querySelector('.j-save')?.addEventListener('click', () => {
    const name = (el.querySelector('.j-name') as HTMLInputElement).value.trim();
    if (!name) { panelToast(sec, '请输入名称'); return; }
    if (editing && item && name !== item.name && M.items.some((x) => x.name === name)) { panelToast(sec, '已存在同名条目，请换个名称'); return; }
    if (!editing && M.items.some((x) => x.name === name)) { panelToast(sec, '已存在同名条目，请换个名称'); return; }
    const stChanged = !editing || !item || item.status !== (cur.st === '想看' ? STATUS_WANT : cur.st === '在看' ? STATUS_WATCHING : STATUS_WATCHED);
    const date = stChanged ? localNow() : (item!.watchDate || localNow());
    const rating = cur.st === '已看' ? parseFloat((el.querySelector('.j-range') as HTMLInputElement).value) : cur.st === '在看' ? 0 : null;
    const review = cur.st === '已看' ? (el.querySelector('.j-review-t') as HTMLTextAreaElement).value.trim() : '';
    // 票 295：集数仅剧类+在看时读取；不可见时置 null（非剧类落盘时删键，不残留）
    const epsW = epsVisible() ? parseEpisodeCount((el.querySelector('.j-eps-watching') as HTMLInputElement).value) : null;
    const epsT = epsVisible() ? parseEpisodeCount((el.querySelector('.j-eps-total') as HTMLInputElement).value) : null;
    if (editing && item) {
      void saveEdit(sec, item, { name, tag: cur.tag, st: cur.st, rating, date, review, country: cur.country, genres: [...cur.genres], epsTotal: epsT, epsWatching: epsW }, app, close);
    } else {
      void saveNew(sec, { name, tag: cur.tag, st: cur.st, rating, date, review, country: cur.country, genres: [...cur.genres], epsTotal: epsT, epsWatching: epsW }, app, close);
    }
  });
  syncEps();
}

/** 小输入弹窗：自定义添加选项（票 294「＋」按钮共用；确认后回调，弹窗自身不落盘） */
function promptOptionValue(sec: HTMLElement, title: string, onSubmit: (v: string) => void): void {
  const { el, close } = ovl(sec, `<div class="cn-modal" style="max-width:280px;width:100%">
    <div class="cn-modal-title">${esc(title)}</div>
    <div class="f-field"><input class="f-input j-opt-name" placeholder="输入新选项名称"></div>
    <div class="dm-actions"><button class="dm-btn j-cancel">取消</button><button class="dm-btn gold j-ok">确定</button></div>
  </div>`, { sticky: true });
  el.querySelector('.j-cancel')?.addEventListener('click', close);
  const ok = () => {
    const v = (el.querySelector('.j-opt-name') as HTMLInputElement).value.trim();
    close();
    if (v) onSubmit(v);
  };
  el.querySelector('.j-ok')?.addEventListener('click', ok);
}

interface FormPayload { name: string; tag: string; st: string; rating: number | null; date: string; review: string; country: string | null; genres: string[]; epsTotal: number | null; epsWatching: number | null }

/** 追剧追平提示（票 295）：正在看集数 ≥ 总集数时随保存 toast 提醒，不自动改状态 */
function catchUpSuffix(epsWatching: number | null, epsTotal: number | null): string {
  return epsWatching !== null && epsTotal !== null && epsTotal > 0 && epsWatching >= epsTotal
    ? ` · 已追平 ${epsTotal} 集，可标记已看` : '';
}

/** 新增落盘（CM2：重名/落盘失败回退；created 域事件 + 抓取队列接管） */
async function saveNew(sec: HTMLElement, p: FormPayload, app: App, close: () => void): Promise<void> {
  const group = getGroupForTag(p.tag) ?? '其他';
  const st = p.st === '想看' ? STATUS_WANT : p.st === '在看' ? STATUS_WATCHING : STATUS_WATCHED;
  const it: CinemaItem = { file: null, name: p.name, typeTag: p.tag, group, status: st, rating: p.rating, watchDate: p.date, review: p.review, poster: null, genre: null, director: null, actors: null, region: null, year: null, doubanRating: null, doubanUrl: null, synopsis: null, duration: null, seasonText: null, country: p.country, genres: p.genres, episodesTotal: episodesEligibleTag(p.tag) ? p.epsTotal : null, episodesWatching: episodesEligibleTag(p.tag) ? p.epsWatching : null };
  try {
    if (app.vault.getAbstractFileByPath(`${M.folderPath}/《${p.name}》.md`)) {
      panelToast(sec, '已存在同名条目，请换个名称');
      return;
    }
    M.items.unshift(it);
    await persistItem(it, app);
    emitDomainEvent('movie', { kind: 'created', name: p.name, status: st === STATUS_WANT ? 'want' : st === STATUS_WATCHING ? 'watching' : 'watched', rating: p.rating, review: p.review || null });
    if (it.file && doubanEligibleTag(it.typeTag)) enqueueDoubanFetch(it.file, it.name);
    close();
    panelToast(sec, `已添加「${p.name}」${catchUpSuffix(it.episodesWatching, it.episodesTotal)}`);
    renderAll(app);
  } catch (e) {
    if (!it.file) {
      const i = M.items.indexOf(it);
      if (i >= 0) M.items.splice(i, 1);
      renderAll(app);
    }
    notifySaveError(e);
    console.error(e);
  }
}

/** 编辑落盘：改名前置校验（非法字符/重名拦截）→ persistItem（rename + frontmatter tags）→ 域事件补发 */
async function saveEdit(sec: HTMLElement, item: CinemaItem, p: FormPayload, app: App, close: () => void): Promise<void> {
  const group = getGroupForTag(p.tag) ?? '其他';
  const st = p.st === '想看' ? STATUS_WANT : p.st === '在看' ? STATUS_WATCHING : STATUS_WATCHED;
  const prev = { name: item.name, typeTag: item.typeTag, group: item.group, status: item.status, rating: item.rating, watchDate: item.watchDate, review: item.review, country: item.country, genres: [...item.genres] };
  if (p.name !== item.name) {
    if (ILLEGAL_NAME_RE.test(p.name)) {
      notice('名称含非法字符（\\ / : * ? " < > |），请修改', 'error');
      return;
    }
    if (app.vault.getAbstractFileByPath(`${M.folderPath}/《${p.name}》.md`)) {
      panelToast(sec, '已存在同名条目，请换个名称');
      return;
    }
  }
  item.name = p.name; item.typeTag = p.tag; item.group = group;
  item.status = st; item.rating = p.rating; item.watchDate = p.date; item.review = p.review;
  item.country = p.country; item.genres = p.genres;
  item.episodesTotal = episodesEligibleTag(p.tag) ? p.epsTotal : null;
  item.episodesWatching = episodesEligibleTag(p.tag) ? p.epsWatching : null;
  try {
    await persistItem(item, app, { prevName: prev.name, prevTag: prev.typeTag });
    // 域事件补发（与快速标记 markStatus 同口径）：状态流转 + 评分变化 → 小橘行为流；
    // 「标记已看」改走本函数后由这里承接原 markStatus 的事件语义
    const fromSt = prev.status === STATUS_WANT ? 'want' : prev.status === STATUS_WATCHING ? 'watching' : 'watched';
    if (st !== prev.status) {
      const toSt = st === STATUS_WANT ? 'want' : st === STATUS_WATCHING ? 'watching' : 'watched';
      emitDomainEvent('movie', { kind: 'status', name: item.name, from: fromSt, to: toSt });
    }
    const prevRating = prev.rating && prev.rating > 0 ? prev.rating : null;
    if (item.rating !== null && item.rating > 0 && item.rating !== prevRating) {
      emitDomainEvent('movie', { kind: 'rated', name: item.name, fromRating: prevRating, toRating: item.rating });
    }
    close();
    panelToast(sec, `已保存「${p.name}」${catchUpSuffix(item.episodesWatching, item.episodesTotal)}`);
    renderAll(app);
  } catch (e) {
    Object.assign(item, prev);
    notifySaveError(e);
    console.error(e);
  }
}

// ---------- 弹窗：删除确认 ----------

function openConfirm(sec: HTMLElement, item: CinemaItem, app: App): void {
  const { el, close } = ovl(sec, confirmModalHtml(item), { sticky: true });
  mountIcons(el);
  el.querySelector('.j-cancel')?.addEventListener('click', close);
  el.querySelector('.j-del')?.addEventListener('click', async () => {
    if (item.file) {
      try {
        await app.vault.trash(item.file, true);
      } catch (e) {
        console.error('删除条目笔记失败:', e);
        notice('删除失败：文件可能被占用，请重试', 'error');
        return;
      }
      // G8：删除成功即出队豆瓣抓取——未开始的移出队列、在抓的不再记失败
      // （否则十几秒后弹「以下影片获取失败：《已删的片》」且「重启后会自动重试」文案不实）
      dequeueDoubanFetch(item.file.path);
    }
    const idx = M.items.indexOf(item);
    if (idx > -1) M.items.splice(idx, 1);
    emitDomainEvent('movie', { kind: 'deleted', name: item.name });
    close();
    panelToast(sec, `已删除「${item.name}」`);
    renderAll(app);
  });
}

// ---------- 共享页：AI 荐片（画像行 + 页面状态快照 → 纯层 aiPageHtml） ----------

/** 偏好行（buildTasteProfile 真实画像；无数据回退「暂无」） */
function aiPrefLine(): string {
  const p = buildTasteProfile();
  const parts = [p.groups[0] || '', p.genres[0] || '', p.directors[0] || '', p.actors[0] || ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : '暂无';
}

function aiInput(): AiPageInput {
  return {
    running: M.aiRunning,
    waitMsg: M.aiWaitMsg,
    error: M.aiError,
    results: M.aiResult,
    pref: aiPrefLine(),
    inLibrary: (name: string) => M.items.some((it) => it.name === name),
  };
}

// ---------- 渲染（布局胶水入参装配；vault 自动刷新与 M.renderFn 都走 renderAll） ----------

function midnightInput(app: App): MidnightRenderInput {
  return {
    items: M.items,
    list: getDisplayItems(),
    view: {
      view: M.view,
      typeFilter: M.typeFilter,
      statusFilter: M.statusFilter,
      countryFilter: M.countryFilter,
      sortMode: M.sortMode,
      searchKeyword: M.searchKeyword,
      multiSelect: M.multiSelect,
      selectedCount: M.selected.size,
    },
    cols: gridColumns(),
    title: listTitle(),
    watchedCount: watchedCount(),
    aiHtml: aiPageHtml(aiInput()),
    aiCount: M.aiResult && M.aiResult.length ? M.aiResult.length : null,
    statHtml: buildAnalysisHTML(),
    poster: (it) => posterUrl(it, app),
    fetching: (it) => isFetching(it.file?.path),
    picked: (it) => M.selected.has(itemKey(it)),
  };
}

// ---------- 多选导出感想（票 296） ----------

/** 单条目感想卡（markdown）：名称/类型/国家/题材（书籍=体裁，票 299）/评分/观影日期/感想 */
function reviewCardMd(it: CinemaItem): string {
  const lines: string[] = [`## 《${it.name}》`, ''];
  lines.push(`- 类型：${it.typeTag}`);
  if (it.country) lines.push(`- 国家：${it.country}`);
  if (it.genres.length) lines.push(`- ${genreLabel(it.group)}：${it.genres.join('、')}`);
  lines.push(`- 评分：${it.rating && it.rating > 0 ? Number(it.rating).toFixed(1) : '未评分'}`);
  if (it.watchDate) lines.push(`- 观影日期：${it.watchDate.slice(0, 10)}`);
  lines.push('', it.review || '（无感想）', '', '---', '');
  return lines.join('\n');
}

/** 导出勾选条目为单篇 markdown 笔记 → `我的/娱乐/感想导出/`（时间戳文件名，重名追加序号） */
async function exportReviews(sec: HTMLElement, app: App): Promise<void> {
  const picked = getDisplayItems().filter((it) => M.selected.has(itemKey(it))); // 复用当前排序
  if (!picked.length) {
    panelToast(sec, '请先勾选要导出的条目');
    return;
  }
  const folder = `${M.folderPath}/感想导出`;
  if (!app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }
  const stamp = localNow().slice(0, 16).replace(/[-: ]/g, ''); // YYYYMMDDHHmmss（截到分）
  let path = `${folder}/感想导出 ${stamp}.md`;
  let n = 2;
  while (app.vault.getAbstractFileByPath(path)) {
    path = `${folder}/感想导出 ${stamp}-${n++}.md`;
  }
  const head = `# 感想导出\n\n> ${picked.length} 条 · ${localNow().slice(0, 10)}\n\n`;
  await app.vault.create(path, head + picked.map(reviewCardMd).join('\n'));
  notice(`已导出 ${picked.length} 条感想到 感想导出/`, 'success');
  M.multiSelect = false;
  M.selected.clear();
  renderAll(app);
}

// ---------- 搜索（防抖；desk 部分刷新保焦点 / mob 全刷+回焦） ----------

function onSearchInput(app: App, sec: HTMLElement, isMob: boolean, raw: string): void {
  if (M.searchDebounceTimer) clearTimeout(M.searchDebounceTimer);
  M.searchDebounceTimer = setTimeout(() => {
    M.searchKeyword = raw.trim();
    M.view = 'list';
    if (isMob) {
      renderAll(app);
      const el = sec.querySelector('.j-mq') as HTMLInputElement | null;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    } else {
      refreshDeskList(app, sec);
    }
  }, 300);
}

/** 输入时只刷列表与计数（保焦点；空了整刷出空态，原型 refreshList 同语义） */
function refreshDeskList(app: App, sec: HTMLElement): void {
  const view = sec.querySelector('.j-view');
  if (!view) { renderAll(app); return; }
  const body = view.querySelector('.d-scroll');
  const head = view.querySelector('.d-head');
  const list = getDisplayItems();
  if (!body || !head || !list.length) { renderAll(app); return; }
  const cnt = head.querySelector('.j-cnt');
  if (cnt) cnt.textContent = `· ${list.length} 部`;
  const grid = body.querySelector('.grid');
  if (grid) grid.innerHTML = list.map((it) => pcardHtml(it, posterUrl(it, app), isFetching(it.file?.path))).join('');
  mountIcons(sec);
}

// ---------- 事件绑定（sec 级委托一次；重渲染内容全覆盖） ----------

function bindMidnight(sec: HTMLElement, app: App): void {
  sec.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    // AI 页按钮（开始/重试/换一批/加入想看）先行分流（页内与共享弹窗内同享）
    const aiBtn = t.closest('[data-cinema-ai-start],[data-rec-add]') as HTMLElement | null;
    if (aiBtn) {
      if (aiBtn.hasAttribute('data-rec-add')) {
        if (aiBtn.hasAttribute('disabled')) return;
        const rec = M.aiResult?.[Number(aiBtn.dataset.recAdd)];
        if (rec) void quickAddWant(app, rec.title || rec.name || '', rec.type || '');
      } else {
        if (M.aiBase) void runSimilarRecommend(M.aiBase, app);
        else void runAIRecommend(app);
      }
      return;
    }
    const clear = t.closest('[data-cinema-clear]') as HTMLElement | null;
    if (clear) {
      M.typeFilter = null; M.statusFilter = null; M.countryFilter = null; M.searchKeyword = '';
      renderAll(app);
      return;
    }
    // 票 296：多选导出工具条
    const msel = t.closest('[data-cinema-multiselect]') as HTMLElement | null;
    if (msel) {
      M.multiSelect = true;
      M.selected.clear();
      M.view = 'list';
      renderAll(app);
      return;
    }
    const mexit = t.closest('[data-cinema-multiselect-exit]') as HTMLElement | null;
    if (mexit) {
      M.multiSelect = false;
      M.selected.clear();
      renderAll(app);
      return;
    }
    const mexp = t.closest('[data-cinema-export]') as HTMLElement | null;
    if (mexp) { void exportReviews(sec, app); return; }
    const tool = t.closest('.j-tool') as HTMLElement | null;
    if (tool && tool.dataset.tool) {
      // 进 ai/stat 不动筛选状态：rail 高亮由渲染层按视图熄灭（render.ts listOn 门控），
      // 返回列表时先前选中的筛选高亮原样恢复
      M.view = M.view === tool.dataset.tool ? 'list' : (tool.dataset.tool as 'ai' | 'stat');
      renderAll(app);
      return;
    }
    const mb = t.closest('.j-mai,.j-mstat,.j-mclose') as HTMLElement | null;
    if (mb) {
      if (mb.classList.contains('j-mclose')) closeOverlay();
      else {
        const v = mb.classList.contains('j-mai') ? 'ai' : 'stat';
        M.view = M.view === v ? 'list' : v; // 落域适配：再点回列表
        renderAll(app);
      }
      return;
    }
    const back = t.closest('.j-back') as HTMLElement | null;
    if (back) { M.view = 'list'; renderAll(app); return; }
    const railBtn = t.closest('[data-g],[data-s],[data-cn]') as HTMLElement | null;
    if (railBtn) {
      M.view = 'list';
      if (railBtn.dataset.g) {
        M.typeFilter = railBtn.dataset.g === '全部' ? null : railBtn.dataset.g;
        M.statusFilter = null;
      } else if (railBtn.dataset.cn) {
        // 票 294：国家筛选（'未填' = 国家为空桶；再点取消）
        M.countryFilter = M.countryFilter === railBtn.dataset.cn ? null : railBtn.dataset.cn;
      } else {
        const s = railBtn.dataset.s ?? null;
        M.statusFilter = M.statusFilter === s ? null : s;
      }
      renderAll(app);
      return;
    }
    const chip = t.closest('.chip') as HTMLElement | null;
    if (chip) {
      M.view = 'list'; // chips 属列表视图：在 AI/分析页点 chips 必须回落列表（否则筛选生效但页面停在原视图，看着像「点了没反应」）
      if (chip.dataset.c) {
        M.typeFilter = chip.dataset.c === 'all' ? null : chip.dataset.c;
        M.statusFilter = null;
      } else if (chip.dataset.cn) {
        M.countryFilter = M.countryFilter === chip.dataset.cn ? null : chip.dataset.cn;
      } else {
        const s = chip.dataset.s ?? null;
        M.statusFilter = M.statusFilter === s ? null : s;
      }
      renderAll(app);
      return;
    }
    const sortBtn = t.closest('.j-sort button') as HTMLElement | null;
    if (sortBtn && sortBtn.dataset.k) {
      M.sortMode = sortBtn.dataset.k as CinemaSortMode;
      renderAll(app);
      return;
    }
    const add = t.closest('[data-cinema-analysis-add],[data-cinema-add]') as HTMLElement | null;
    if (add) { openForm(sec, null, app); return; }
    const cardEl = t.closest('.pcard') as HTMLElement | null;
    if (cardEl) {
      const it = itemByKeyInState(cardEl.dataset.cinemaKey);
      if (!it) return;
      // 票 296：多选模式下点卡片=勾选/取消勾选
      if (M.multiSelect) {
        const k = itemKey(it);
        if (M.selected.has(k)) M.selected.delete(k);
        else M.selected.add(k);
        renderAll(app);
        return;
      }
      openDetail(sec, it, app);
    }
  });
  sec.addEventListener('contextmenu', (e) => {
    // 桌面壳专属：右键菜单是鼠标惯用件。移动壳分流——触屏长按会同时发 pointerdown 与
    // contextmenu，不分流就会多弹一个鼠标菜单盖在抽屉上；移动端长按手势走 core/dom.longPress。
    if (sec.classList.contains('mob')) return;
    const cardEl = (e.target as HTMLElement).closest('.pcard') as HTMLElement | null;
    if (!cardEl) return;
    e.preventDefault();
    const it = itemByKeyInState(cardEl.dataset.cinemaKey);
    if (!it) return;
    // core 跟手菜单（防溢出定位/ESC/外部点击关闭/键盘导航由共享层承载）
    openItemMenu(e.clientX, e.clientY, toItemActions(itemActions(it, sec, app)), true, MENU_SKIN);
    // 右键时序会置位残余 click 抑制（Chromium：mousedown → contextmenu → mouseup 落在菜单外），
    // 吞掉下一次左键（菜单项要点两次才生效）；右键无补发 click，直调后立即复位
    resetItemMenuClickGuard();
  });
}

// ---------- 壳选择 / 创建 / 渲染总入口 ----------

export function createOverlay(app: App): void {
  const overlay = document.createElement('div');
  overlay.className = 'bz-panel-overlay';
  const mobile = isMobileEnv();
  overlay.innerHTML = mobile ? midnightMobHtml() : midnightDeskHtml();

  document.body.appendChild(overlay);
  topifyZ(overlay); // ADR-0067：显示即发号（谁后显示谁在上）
  M.currentOverlay = overlay;
  M.renderFn = () => renderAll(app);
  const root = overlay.querySelector<HTMLElement>('[data-cinema-root]');
  if (!root) return;
  // 点遮罩 = 关闭主面板（桌面；移动全屏无遮罩）
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  bindMidnight(root, app);
  // 搜索/滑杆输入（委托；input 冒泡）
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains('j-q') || t.classList.contains('j-mq')) {
      onSearchInput(app, root, t.classList.contains('j-mq'), (t as HTMLInputElement).value);
    } else if (t.classList.contains('j-range')) {
      const out = root.querySelector('.j-rval');
      if (out) out.textContent = Number((t as HTMLInputElement).value).toFixed(1);
    }
  });

  rebuildItems(app);
  renderAll(app);
}

/** 渲染总入口：按面板根的风格/端分发（vault 自动刷新与 M.renderFn 都走这里） */
export function renderAll(app: App): void {
  const overlay = M.currentOverlay;
  if (!overlay) return;
  const root = overlay.querySelector<HTMLElement>('[data-cinema-root]');
  if (!root) return;
  const inp = midnightInput(app);
  if (root.classList.contains('mob')) {
    renderMidnightMob(root, inp);
    attachLongPress(root, app); // m-grid 卡片重渲染重建后重挂（原 mob 渲染胶水同语义）
  } else renderMidnightDesk(root, inp);
  mountIcons(root);
}

export function closeOverlay(): void {
  if (M.searchDebounceTimer) clearTimeout(M.searchDebounceTimer);
  closeItemMenu(); // 浮层（跟手菜单/抽屉）挂 body，不随面板移除 → 关面板时一并收掉
  if (M.currentOverlay) {
    M.currentOverlay.remove();
    M.currentOverlay = null;
  }
  M.renderFn = null;
  M.view = 'list'; // 复位视图：重开回落列表页
  M.multiSelect = false; // 票 296：多选模式不跨开合残留
  M.selected.clear();
}

// ---------- ESC（主面板；弹窗层各自注册更高优先级） ----------

export function registerEscapeHandler(): void {
  registerPanelEsc('bz-cinema', () => !!M.currentOverlay, () => closeOverlay());
}
