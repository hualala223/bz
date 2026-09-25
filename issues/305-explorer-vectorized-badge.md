# 票 305 — 文件列表「已入脑」角标（向量化状态可视）

**日期**：2026-09-25　**域**：secondbrain　**状态**：已交付

## 需求

用户提出：给已被向量化的文档加个标志，「一看就知道这篇文档已经被向量化」。背景：每周知识动态（issue 360）面板只报聚合数字，单篇笔记的向量化状态此前只能开主面板看「最近向量化」列表或翻 secondbrain.json。

## 决策（ADR-0133）

| 问题 | 备选 | 拍板 |
|---|---|---|
| Q1 标记形态 | (a) 写 frontmatter 属性 / (b) 文件浏览器 UI 角标（派生自索引） | **(b)**：见 ADR-0133 拒绝项——写笔记触发 modify 监听链空转、Syncthing 冲突文件高发、移出白名单后残留假信息；派生标记永远与索引真相一致 |
| Q2 挂点 | (a) 文件行圆点 / (b) 打开笔记时状态栏 / (c) 仅主面板 | **(a)**：文件列表扫一眼即是需求原义；状态栏与主面板为后续可选追加 |
| Q3 默认值 | 缺省开 / 缺省关 | **缺省开**（`secondBrainExplorerBadge !== false`）：需求即「让人一看就知道」，关闭路径走 ⚙️ 弹窗 |

## 实现

- `src/secondbrain/vector-store.ts`：`onIndexUpdated(cb)` 订阅 + `notifyIndexUpdated()`——load 与每轮 refresh 成功收敛各触发一次（失败不通知，订阅方只拿有效索引态）；回调抛错仅告警不拖垮索引管线
- `src/secondbrain/explorer-badge.ts`（新）：装饰模块——挂点 Obsidian 原生 `.tree-item-self.nav-file-title[data-path]`（文件夹行不标）；MutationObserver(childList+subtree) 兜懒展开/重排行，store 收敛回调与 workspace `layout-change`（防抖 120ms）驱动重装饰；装饰是幂等全量 pass（只扫当前 DOM 行集）；开关关闭 = 空集合 pass 清场
- `src/secondbrain/index.ts`：`ensureSecondBrain` 建库即初始化（订阅先于 initialLoad，首载完成即首轮装饰）；`unloadSecondBrain` 全量清理（订阅/观察器/定时器/已挂类）
- `src/settings.ts`：`secondBrainExplorerBadge` 布尔键，默认 `true`
- `src/secondbrain/panel.ts`：⚙️ 域设置弹窗「外观」组加 toggle 行（onChange 就地重跑装饰）；行名过 ticket 131 文案 lint（4-8 字宽零符号）
- `src/secondbrain/styles.css`：`.tree-item-self.bz-sb-vec .tree-item-inner::after` 绿点（`--color-green` 回退 `#43b563`，opacity .75）

## 冻结自查（ADR-0121）

用户主动新增 secondbrain 可视化功能，非上游吸收，不触冻结；索引数据格式零改动（meta.notes 键集即真相，不写任何笔记文件）；命令面零新增（smoke 口径不变）。

## 测试

- `tests/secondbrain/explorer-badge.test.ts`（jsdom）：登记/未登记/文件夹行三分支、收敛回调驱动挂摘、开关关闭清场与重开恢复、卸载全清、无叶子静默
- `tests/secondbrain/vector-store.test.ts` 追加 onIndexUpdated 契约：load/refresh 各通知一次、失败不通知、退订即停、回调抛错不拖垮管线
- 范围内 vitest 全绿（193）+ `tsc --noEmit` 零错 + 构建产物（根 styles.css 与 vault 产物均含 `bz-sb-vec`）
- 附注：同窗另一会话正在本 worktree 进行批 5cine 收口（cinema ui-revived 为其未跟踪 WIP），其失败不计入本票门禁
