# ADR-0107：新增 collect（日常收集）域——QuickAdd「日常收集」宏换血进插件

## 背景

「日常收集」原先依赖外部 QuickAdd 插件的 Multi 宏：命令面板选分类 → 输内容 → 按
`- YY/MM/DD-HH:MM:SS 内容` 追加到 `我的/日常收集/*.md` 的 `## 非文件收集` 标题下。
入口散在 QuickAdd 的命令面板里，与插件其余工作流割裂，也无法被面板/首页/命令体系复用
（ticket 246）。宏内配 16 个分类，另有若干未纳入宏的文件（冲突类型/情感/想法/疑问等）由用户自行管理。

## 决策

新增第 26 个功能域 `collect`，把宏的捕获能力整体搬进插件，写入行为与 QuickAdd **完全同构**（同格式、同位置），两者可共存共写同一批 md 文件：

1. **数据形态为追加式 md，无 json 存储**。唯一状态是分类配置（`collectCategories` 映射 + `collectFolderPath` 目标文件夹，默认 `我的/日常收集`），落在 `data.json`，由 ⚙️ 域设置弹窗编辑。
2. **纯层与 IO 分离**（ADR-0002）：`src/collect/data.ts` 纯函数——`appendCollect(原文, 内容, 时间) → 新原文` 捕获管线 + `parseEntries(原文) → 条目数组` 解析器 + 分类清单纯操作（normalize/upsert/remove/rename）；`src/collect/store.ts` 是唯一触碰 vault 的薄壳（读文件 → 纯函数 → 写文件）。
3. **三套入口**（用户拍板）：统一入口命令（弹窗内选分类）、每分类 16 条**汉字 id** 命令（`bz-collect-<分类名>`，Obsidian 支持非 ASCII 命令 id，自用裸调用直观优先）、`bz-collect-selection` 选区收集（多行选区保持换行）。另加面板命令与 ribbon 图标。
4. **展示三件**：ribbon → 统一入口；主面板 v1 = 分类启动器（`.bz-win-head` + ⚙️ + 关闭，点分类直达该分类输入）；home 首页「今日收集」快照卡 = 今日条数 + 最近 3 条摘要（分类名 + 内容截断）。
5. **目标文件不存在自动创建**（frontmatter + `## 非文件收集`）。QuickAdd 原配是报错，此处有意改进——新配置的分类没有现成文件，报错会让用户卡在第一步。
6. **兼容冻结**：时间戳沿用 `YY/MM/DD-HH:MM:SS`；写入位置与格式逐字同构；现存条目秒位越界等历史怪值**不校验不清洗**。
7. **分类为空 = 未配置**：`getCategories()` 与 ⚙️ 编辑区在清单为空时回落内置 16 分类；首次编辑才把整份清单落盘。
8. **未预置分类就地受理**：`openCollectCapture(app, preset)` 对不在配置清单里的 preset 也照常受理（按名派生 `分类名.md`），冲突类型/情感/想法/疑问等可由用户加分类后再直达。

## 后果

- 命令数 +19（面板/统一入口/选区 + 16 汉字分类命令），命令注册仍单点收口 `main.ts` COMMANDS 表（铁律 2），卸载全量 removeCommand。
- 样式源头新增 `src/collect/styles.css`，进 `scripts/build-css.mjs` 聚合清单；`bz-` 前缀，禁运行时注入。
- home 域清单新增 `collect` 磁贴（`DOMAIN_ICONS.collect`、`DOMAIN_DOT.collect`、`riverCountText` case、`buildDots` case），`RiverCounts` 增 `collectToday`、`RiverData` 增 `collectRecent`；快照**只读**，不改写任何收集文件（沿用 river.ts 只读契约）。
- 依赖方向不变：`collect → core`（settings-provider），home → collect 仅 `store` 层只读读取，无环。
- 数据格式与 QuickAdd 宏完全共存；卸载插件后 QuickAdd 宏照常可用，反之亦然。
