# ADR-0115: 复习计划挪动兜底——同名唯一自动接回

日期：2026-09-11 ｜ 状态：已采纳

## 背景

复习计划按 `filePath` 精确匹配条目与文件（`loadItems` 逐条 `getAbstractFileByPath`）。监听文件夹内文件被挪到别处时，若 Obsidian 正在运行会触发 rename 事件 → `onVaultRename` 自动更新路径（ticket 099），一切正常。但 **Obsidian 未运行期间**（或经外部工具）挪动文件，启动时不补发任何事件——rename 兜底链路完全失效，条目永久滞留旧路径：

- `loadItems` 判定文件不存在 → 挂起记录（删除线）；
- 挂起条目**不计逾期、不进复习队列**；
- 用户视角 =「那批笔记从复习计划里消失了」。

实例：2026-09-10 自动加入的 23 篇笔记被挪到 `卡片盒/文献/`，全部挂起，逾期列表不再显示。

## 决策

新增「挪动兜底」：**路径失效条目 × vault 同名文件，双向唯一 → 自动接回原排期**（沿用 `updateFilePath`，进度/排期原样保留）。

两个触发时机（`src/review/watch.ts`）：

1. **启动收敛** `relinkMissingByBasename()`：`ensureReview` 的 2s 首查定时器内全量扫一次挂起条目；接回 ≥1 条时 toast「已重新关联 N 篇被移动笔记的复习路径」。
2. **created 实时接回** `relinkOneByBasename()`：`onVaultCreate` 入口先试接回（不限监听目录）——外部挪动在 Obsidian 运行中发生时以 delete+created 补发，created 先行接回即可；接回成功则跳过后续自动加入。

**双向唯一判据**（任一不满足即不动，保持挂起）：

- vault 内该文件名（basename，去 `.md`）的 md 文件**恰好 1 个**（`.trash` 等隐藏目录不入 vault 索引，天然排除）；
- 挂起条目中该文件名**恰好 1 条**（多条同名 → 目标歧义）；
- 目标路径不在计划内、不在排除名单（`reviewExcludedNotes`）。

## 理由与边界

- **正文变动无从校验**：计划条目不存内容哈希（review.json 数据格式冻结，铁律 1，不加字段）。以「同名双向唯一」为充分条件近似——同名文件在真实 vault 中几乎唯一，误接风险极低；歧义场景（重名、批量挪动同名序列）保守放弃，行为退化为今天的挂起，不会更差。
- **不改既有语义**：挂起仍不计逾期；删除确认「移除/保留」（ticket 098）与 rename 自动跟随（ticket 099）原样保留；排除名单条目不被接回。
- `baseNameOf()` 与 `TFile.basename` 同口径（路径末段去 `.md`）。

## 影响

- `src/review/watch.ts`：新增 `baseNameOf` / `relinkOneByBasename` / `relinkMissingByBasename`；`onVaultCreate` 入口先试接回。
- `src/review/index.ts`：`ensureReview` 2s 定时器追加启动收敛调用。
- 测试：`tests/review/watch.test.ts` +3 例（接回+通知 / 三类歧义不动 / created 实时接回）。
