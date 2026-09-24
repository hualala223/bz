# 票 303 — 打开今日日记（编辑器右键 + 命令直达）

**日期**：2026-09-24　**域**：diary　**状态**：已交付

## 需求

在日记功能上右键添加一个「打开日记」功能，使用时直接打开当天日记文件（`{日记目录}/{YYYY-MM-DD}.md`）。

## 决策（grill-with-docs，一轮三问，用户答「全部推荐」）

| 问题 | 备选 | 拍板 |
|---|---|---|
| Q1 右键挂哪 | (a) 编辑器右键（editor-menu）/(b) 文件浏览器右键/(c) 日记面板内/(d) launcher 磁贴 | **(a) + 追加 (c) 头部**：编辑器右键为基准位；用户实测后追认「日记本面板里也要」→ 头部（diary-popup-header）右键，与编辑器右键并存 |
| Q2 当天文件不存在 | (a) 按模板自动建档/(b) 只提示/(c) 弹确认框 | **(a)**：配得上「直接打开」；建档逻辑复用 planDiary 链路，不新写 |
| Q3 是否注册命令 | 注册 `bz-diary-open-today` 与右键同函数 / 仅右键 | **注册**：快捷键 + 命令面板入口，成本一条表行 |

菜单文案定「**打开今日日记**」，与既有 `bz-diary-open`「日记本」（开面板）区分。

## 实现

- `src/diary/daily.ts`：`todayDiaryPath`（纯函数）+ `openTodayDiary`（已存在原样打开；缺失按模板建档——`readDiaryTemplate` 内置兜底 + `buildDiaryFileContent` 规整，写盘走 core/storage 同路径串行队列，与 diary store writeFile 互斥）+ `ensureDiaryEditorMenu`（editor-menu 挂菜单项，注册失败静默）
- `src/main.ts`：COMMANDS 表 +1（`bz-diary-open-today`，icon file-text，**不带 editorCallback**——避免 Obsidian「待选命令」区与右键项重复）；onload 调 `ensureDiaryEditorMenu(this)`
- `src/diary/ui/panel.ts`（Q1a 追加）：`wireDiaryPanelHeaderMenu`——日记本面板头部（diary-popup-header）桌面壳右键弹 core 跟手菜单「打开今日日记」（openItemMenu，防溢出/ESC/外点关闭由共享层承载；移动壳分流防长按叠菜单；残余 click 抑制直调后立即复位，影院域同口径），createHeader 末尾接线

## 冻结自查（ADR-0121）

用户主动新增 diary 功能，非上游吸收，不触冻结；既有面板/条目链路/数据格式零触碰。

## 测试

`tests/diary/open-today.test.ts` 8 用例：路径口径 / 目录随设置 / 建档 frontmatter 规整（删 title、date_creation 填今日）/ 已存在一字不写 / 模板缺失走兜底 / editor-menu 挂载且点击同函数 / 注册失败静默 / 面板头部右键弹菜单且点项同函数（wireDiaryPanelHeaderMenu）。

## 门禁

tsc 0 错；新测试 + smoke 全绿；全量 + 构建复核见 PROGRESS 当日记录。
