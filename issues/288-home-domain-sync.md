# 288 — home 域整体吸收（上游 267/283/287/288/290/305 + H11-H13）

## 背景与结论

上游差量第二次核对（2026-09-14）后，真实功能差量收敛为 home（内容首页）域一项。
上游 `8e126e58`（09-13）相对本地 `264fb279` 的 home 域增强：

1. 入口顺序/显隐**按设备端独立** + 域快捷菜单（上游 267）
2. 入口彩点五条件点亮（上游 283）
3. 时间线六项设置（上游 287）
4. 首页设置五组结构 + 入口菜单九条命令（上游 288）
5. 首页秒开三件套：首次骨架秒开 / 关闭保留 DOM / 重开复用（上游 290）
6. 时间线改吃小橘行为流（上游 305 / ADR-0132，`behavior-timeline.ts` 新文件，外部文件改动免疫）
7. 入口编辑器（`entry-editor.ts` 新文件）与连击/采集修复 H11–H13

## 为什么不能整域 fast-forward（血统核查结论）

- 本地 `src/home` 7 个 blob 不在上游历史：`prototype-render.js`（构建产物，忽略）+
  6 个源文件，私有改动**只有一个完整功能：「今日收集快照卡」**（collect 域 issue 246，
  本地独有域）+ weekly.ts 一处注释措辞（书库 vs 书架）。
- 上游新版 home 引了两个本地没有/不能用的依赖：
  - `../core/diary-format`（上游日记契约 v3 产物，**冻结域**，不吸）→ 本地日记文件命名是
    `我的/日记/YYYY-MM-DD.md`（ADR-0113 章节模型），连击/周计数直接按文件名日期解析即可；
  - `../core/pomodoro-phase`（重构上收 core，Q3 决议跳过）→ 类型改引 `../pomodoro/state` 的 `Phase`。
- `../review/app`、`../review/data` 本地已有同名导出（`reviewApp.ensure`/`dataManager`/`ReviewItem`
  字段 `isMissing/isOverdue/completed/nextReviewDate` 全齐），只读消费，review 域零改动。

## 实施方案（worktree `wt-home-sync`，主仓零接触）

1. 以上游 `FETCH_HEAD` 全量覆盖 `src/home/`（15 文件）+ 补 5 个上游 home 测试
   （behavior-timeline / entry-drag / entry-menu / review-fix-panel-b / timeline-settings），
   更新 3 个共有测试（river / ui-river / weekly）。
2. 本地适配（全部记录在本票）：
   - river.ts：`hasDiaryDay` 改按 `dir/YYYY-MM-DD.md` 直判（`fileExists`），去 `diary-format` 引；
   - weekly.ts：`countDiaryThisWeek` 直接 `parseLocalDay(basename)`（本地名即 `YYYY-MM-DD`）；
   - shared.ts / state.ts / ui.ts：`import type { Phase as PomodoroPhase } from '../pomodoro/state'`；
   - 回植「今日收集快照卡」：shared.ts（入口项+类型+`truncateCollect`）、river.ts
     （`collectCollectSnapshot`+计数+recent）、layouts/river/render.ts（`collectHtml` 卡）、
     render.ts（导出名）、styles.css（`.bz-home-collect*` 样式）。
3. main.ts 不动：上游 home 新功能未新增命令 id（差量核查为空），`bz-home` 两表皆有。
4. 门禁（worktree 内，junction node_modules）：`tsc --noEmit` → vitest 全量 → `esbuild production`。
5. 门禁全绿后主仓显式路径提交（src/home/** + tests/home/**），构建产物还原不提交。

## 实施记录（2026-09-14 完成）

- 门禁：tsc 0 错 / vitest 全量 **303 文件 4762 用例全绿** / esbuild production 构建通过。
- 实际改动面比原方案多三块（均为 home 新功能的依赖）：
  1. **`src/core/pomodoro-phase.ts` 新增**（Q3「跳过重构」的边界修正）：home 相位菜单的
     类型单源依赖，零依赖纯文件，随上游吸收；
  2. **`src/pomodoro/ui.ts` 移植 5 函数**（`isFocusing/toggleFocus/menuPhase/skipBreak/togglePause`）
     + index 导出 + **main.ts 新增 3 命令**（`bz-pomodoro-focus-toggle/skip/pause`），
     smoke 清单 68 → **71**；
  3. **`src/core/item-actions.ts` 整文件换上游版**：`menuHeadHtml` 盒头参数 + C6 触屏误吞修复
     （上游血统纯，含 H12 修复批）。
- **settings 新增 11 键**（`homeLayout/homeSkin/homeTimelineSize/Range/Skipped/Produce/Progress/Notes/homeDefaultDay/homeTimelineTime/homeNextCards`），DEFAULT_SETTINGS 默认值随上游。
- 本地适配落点（票内登记）：
  - 日记口径：river `hasDiaryDay` 按 `dir/YYYY-MM-DD.md` 直判、weekly `countDiaryThisWeek`
    直接 `parseLocalDay(basename)`，去 diary-format 依赖（冻结域不吸）；
  - todo 命名映射：`memoOpen/memoUrgentOpen/memoCreated/memoDone` → `todo*`，
    行为流文案「新增备忘录」→「新增待办」，SOURCE_DOMAIN 目标 id 走本地（memo→todo、
    knowledge/literature/bili-downloader→literature）；
  - **DOMAINS**：+待办（todo）、+第二大脑（secondbrain）两条上游新增入口；**保留 attach**
    （上游移除属上游用户拍板，本地保留现状，可经隐藏列表配置）；保留 wall/collect/literature
    本地入口；不吸 vault（密码本并入保险库，ADR-0085）；
  - **DOMAIN_MENU**：diary 菜单剔除（bz-diary-write 属冻结域产物）；review 映射本地命令
    （开始复习→bz-review-today）；vault 组剔除；+collect（bz-collect-capture）；
  - **回植「今日收集快照卡」**（本地私有功能，collect 域 issue 246）：shared 类型/彩点/计数文案、
    river 采集、layouts/river collectHtml、styles.css 全套样式；测试两条回植。
- 测试适配：tests/home 8 文件（上游 5 新 + 3 更新），日记夹具改本地 `YYYY-MM-DD.md` 口径
  （条目标题行 `# emoji HH:mm`），entry-drag 行数改 `DOMAINS.length` 驱动。

## 验收

- [x] tsc / vitest / build 三道门禁全绿（4762 用例）
- [x] 「今日收集快照卡」数据层 + 渲染层测试回植并通过
- [x] 日记连击/周计数按本地 `YYYY-MM-DD.md` 口径工作（测试锁定）
- [x] 时间线来自小橘行为流（smartcat-behavior.json），外部文件改动不再导致时间线漂移
- [x] 冻结域（review/diary 行为、AI 设置、小橘设置）零改动（diary-format / 上游日记契约未引入）

## 关联

- 上游 issue 267/283/287/288/290/305、ADR-0132；冻结排除：上游 304/305（日记契约）+ ADR-0130/0131
- 差量证据：`.scratch/cmp_home_priv_out.txt`（私有改动定性）、`.scratch/upstream-diff-report-2026-09-14.md`
