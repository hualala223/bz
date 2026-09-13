# issue 252：写日记 / 复盘改为「按小节落块」（ADR-0114）

## 需求（用户）

> 以后日记的文件模板都是根据「日程规划」得到的模板定文件内容格式，然后以后「写日记」功能得到的内容，都放在 `## 随笔` 下面放置，复盘除外，复盘仍旧按照原本该怎么放就怎么放。

> 我不想在日记面板列表、标签筛选、回忆墙、smartcat 这些什么里面看到，那个什么日记解析功能最好是给我取消，我不希望我的日记被解析。

> 我每天会最开始运行「日程规划」功能，得到当天或者明天的日记文件，然后写日记功能，只需要将写的内容，放入相应的日记文件的相应位置就行。

## 裁定（问答五轮，逐条落定）

| 问题 | 选择 |
|---|---|
| 写日记的块长什么样 | **加粗行** `**✍️ 20:30**` + 正文（不用 h3、不用 h1 头条） |
| 弹窗「类型」还有意义吗 | 保留，**只决定 emoji**（多选连写）；落点恒为 `# 随笔` |
| 复盘往哪写 | 文件最下面 `# 当日复盘` 小节；**缺失则写时新建**；多条按 `## 🪞 HH:mm` 时间标题堆叠 |
| 日程规划语义 | 已是「建当天/明天的日记文件」（ADR-0112），本次不动 |
| 骨架小节清单 | 沿用五节、不砍任何内容（后续要加功能） |
| 骨架 frontmatter | `card_type: 日记`（ADR-0112 已规整；本次不动） |
| 「检测日记解析」 | **删除**按钮 + 面板 + `repair.ts` / `repair-modal.ts`；写前守卫保留（改静默人话） |
| 存量文件 | **一律不动**（ADR-0113 决策 3 延续） |
| 保存后跳转 | 降级为**打开该日期日记文件**（块模型下没有条目可跳） |
| 旧文件的 `## 随笔` / `## 当日复盘` | **宽容匹配**：新层级 `#` 优先、旧层级 `##` 兜底（只往已有段里写字，不改建） |

## 改动

**新增**

| 文件 | 内容 |
|---|---|
| `src/diary/daily-write.ts` | 落点层：`ESSAY_HEADING` = `# 随笔`、`REVIEW_HEADING` = `# 当日复盘`；纯函数 `buildEntryTitle` / `buildEntryBlock` / `writeNoticeText`；`sectionCreatesIfMissing`（只有复盘允许现场建节）；薄壳 `writeDiaryEntry` |

**改造**

| 文件 | 改动 |
|---|---|
| `src/diary/daily-capture.ts` | 抽出 `locateSection`（两入口共用）；新增 `insertBlockIntoSection`（多行块 + `createIfNotFound`）；单行 `insertIntoSection` 行为逐字不变 |
| `src/diary/ui/dialogs.ts` | `AddDialogPreset` 增 `section`；`saveNewEntry` 改走 `writeDiaryEntry`（不再 `addEntry` / 不再 `insertCard` / 不再标签筛选联动）；`jumpToEntry` 降级 `openDiaryFile` |
| `src/diary/daily.ts` | `REVIEW_TEMPLATE` 去掉首行 `# 当日复盘`（小节名由落点提供，避免重复标题）；`openReviewDialog` 指定 `section: REVIEW_HEADING` |
| `src/diary/ui/panel.ts` | 删「维护」组与「检测日记解析」按钮及其 import |
| `src/diary/store.ts` ×3 / `src/recap/summarize.ts` ×1 | 守卫文案改为不指向已删工具的人话 |
| `src/diary/styles.css` | 删 `bz-diary-repair-*` 与 `.bz-button` 区块 |

**删除**

`src/diary/repair.ts`、`src/diary/ui/repair-modal.ts`、`tests/diary/repair.test.ts`、`tests/diary/ui/repair-modal.test.ts`；`tests/core/d3-write-gate.test.ts` 白名单去掉 `repair-modal.ts` 条目。

## 测试

`tests/diary/` 32 文件 479 例全绿（定向）。更新 8 个文件：

| 文件 | 改动 |
|---|---|
| `add-dialog-content.test.ts` | 新写：写日记落 `# 随笔`、复盘落 `# 当日复盘`（缺失新建）、二次复盘不重复小节标题 |
| `add-dialog-steps.test.ts` | preset 正文断言去首行；成功文案改正则 |
| `dialogs-entries.test.ts` | 原「saveNewEntry 插卡后计数 +1」→「块模型不插卡，计数与 DOM 均不动」 |
| `dialogs-cov.test.ts` | 原「搜索命中即插卡」三条 → 「无论命中与否都不插卡、内容只落 `# 随笔`」 |
| `coverage-extra2.test.ts` | 失败分支改从 `vault.create` 注入；成功分支断言不插卡 + 落 `# 随笔` |
| `panel.test.ts` | 文件断言改 `# 随笔` + `**📖 10:30**` |
| `ux-2026.test.ts` | 成功文案改正则；失败分支改从 `vault.create` 注入 |
| `daily-tasks.test.ts` / `write-guard.test.ts` / `parser.test.ts` | 文案与模板首行断言随改 |

## 验收产物

写日记（选「日记」类型、20:30、正文「今天下午去河边走了走，风很大。」）落到 `# 随笔`：

```md
# 随笔

**📖 20:30**

今天下午去河边走了走，风很大。
```

复盘（21:40，预填内层模板）落到文件末尾新建的 `# 当日复盘`：

```md
# 当日复盘

## 🪞 21:40

### 触动点
#### 描述经过（具体场景）
- 
#### 分析原因（why→启发）
- 
#### 改进措施（提炼认知点或行动点）
- 
```

## 影响与残留

- 新内容**不进**日记面板列表 / 标签筛选 / 回忆墙 / 智能猫 / 今日回顾（用户要求），代价是插件里无法编辑/删除这些内容（只能直接开文件改）。
- 条目模型与 `parseFile` **保留**：回忆墙、智能猫、今日回顾、加密域仍读存量条目。
- 写前守卫保留：遇到条目区无法解析行仍拒写（防丢行），只是文案不再指向已删工具。
- 存量 621 个日记文件一字未动；`## 随笔` / `## 当日复盘` 旧层级按宽容匹配继续可用。
