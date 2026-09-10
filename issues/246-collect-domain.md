# issue 246：collect 日常收集域（QuickAdd 日常收集宏换血进插件）

标签：`ready-for-agent`

## Problem Statement

日常收集目前依赖外部 QuickAdd 插件的「日常收集」Multi 宏：选分类 → 输内容 → 追加到 `我的/日常收集/*.md`。入口散在 QuickAdd 命令面板里，与 bz 插件其余工作流割裂，且无法被插件的面板/首页/命令体系复用。

## Solution

新增第 26 个功能域 `collect`（日常收集），把 QuickAdd 宏的捕获能力整体搬进插件：统一入口弹窗（选分类 → 输内容）、每分类独立命令、ribbon 图标、分类启动器面板、home 首页快照卡片。写入行为与 QuickAdd 完全同构（同格式、同位置），两者可共存共写。

## 用户决策记录（grill 会话结论）

1. **独立新域**：不并入现有域；「日常收集」下一个域，下面分不同收集内容（分类）。
2. **入口 C**：统一入口命令 + 选区收集命令 + 每分类独立命令，三套都要。
3. **分类可配置**：内置 16 分类（照 QuickAdd 宏迁移），⚙️ 弹窗可增删改「分类名 → 目标文件」映射；其余未纳入宏的文件（冲突类型、情感、想法、疑问等）不预置，用户自行添加。
4. **写入格式照搬**（兼容冻结）：`- YY/MM/DD-HH:MM:SS 内容`，追加到「## 非文件收集」标题下末尾，找不到标题则追加文件末尾。
5. **v1 输入**：多行输入框 + 选区收集；剪贴板收集不做。
6. **路径可配置**：目标文件夹默认 `我的/日常收集`（vault 根相对）。
7. **文件不存在自动创建**：含 frontmatter + `## 非文件收集` 标题（QuickAdd 原配是报错，此处有意改进，因新配置分类无现成文件）。
8. **展示层三件**：ribbon 图标 → 统一入口；面板 v1 = 分类启动器（点分类进入该分类捕获输入）；home 快照 = 今日条数 + 最近 3 条摘要（分类名 + 内容截断）。
9. **命令 id 用汉字**：`bz-collect-灵感` 等（自用裸调用直观优先；Obsidian 支持非 ASCII id）。
10. **隐私不纳入 diaryPrivacyGuard**：recap/AI 摘要**保留**日常收集痕迹，与日记不同待遇（有意决策，ADR 留痕）。

## Implementation Decisions

- **域结构**：`src/collect/`（index + data + ui + styles.css），依赖方向遵循 ADR-0002（core ← config/state ← parser ← store ← ui ← main），store 无 DOM，UI 刷新靠回调订阅。
- **数据为追加式 md**：无 json 存储；唯一状态是分类配置（settings schema `collect*` 前缀键：分类映射 + 目标文件夹路径），存 data.json，⚙️ 域设置弹窗编辑。
- **捕获管线核心为纯函数**：`(文件原文, 收集内容, 当前时间) → 新文件原文`——条目格式化（`YY/MM/DD-HH:MM:SS` 时间戳前缀）、`## 非文件收集` 标题定位、标题缺失兜底追加文件末尾、文件缺失时生成初始内容（frontmatter + 标题）。副作用（读文件 → 纯函数 → 写文件）为薄壳。
- **条目解析器纯函数**：`文件原文 → 条目数组`（只认标准时间戳格式行，其余行忽略），供面板与 home 快照共用。
- **命令注册**（铁律 2）：仅 main.ts COMMANDS 表，id 三段式 `bz-collect-<动作>`；统一入口、选区收集、16 个分类命令（汉字 id）；卸载全量 removeCommand。
- **主窗口规范**：面板走 bz-win-head 头部 + ⚙️ + 关闭按钮秩序；捕获弹窗不放关闭按钮，mask + ESC。
- **样式**：写 `src/collect/styles.css`，`bz-` 前缀，构建聚合，禁止运行时注入。
- **流程配套**：`.scratch` spec、新 ADR（域新增 + 「隐私门不纳入日常收集」例外决策）、CONTEXT.md 术语（收集条目 / 非文件收集 / 分类）、领域清单表更新、PROGRESS 同步。

## Testing Decisions

- 只测外部行为：给文件原文与输入，断言新文件原文/条目数组；UI 测渲染结果与交互回调，不测内部实现。
- **数据层缝**（node 环境，`// @vitest-environment node`）：捕获管线纯函数——正常追加到标题下末尾、标题缺失兜底、时间戳格式、文件不存在初始内容、多行内容；解析器——标准行识别、非标行忽略、跨分类聚合。先例：`tests/diary/daily-tasks.test.ts` 的 `selectDueTasks` 测法。
- **UI 层缝**（jsdom + mock-obsidian）：统一入口弹窗（分类选择 → 输入 → 写入调用参数）、面板渲染（16 分类入口）、⚙️ 分类增删改。先例：`tests/diary/daily-flow.test.ts`。
- `tests/smoke.test.ts` 的 `EXPECTED_COMMAND_IDS` 补齐全部新命令 id。

## Out of Scope

- 剪贴板收集、面板最近条目流（v2 候选）。
- 「文件收集」区（dataview 卡片盒聚合）的读写——继续由 dataview 自行维护。
- recap/AI 摘要对日常收集痕迹的剔除（明确不纳入隐私门）。
- 既有 16 个 md 文件内容的任何迁移/改写。

## Further Notes

- 与 QuickAdd 宏**共存不替换**：同格式共写，用户旧入口继续可用；后续若删除 QuickAdd 配置不影响本域。
- 时间戳沿用 QuickAdd 的 `YY/MM/DD-HH:MM:SS` 形态（含现存条目里秒位越界的历史怪值，兼容冻结，不校验不清洗）。
