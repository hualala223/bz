# issue 247：当日待办事项/日常行为记录——QuickAdd「日常时间记录」两个 Capture 宏换血进插件

## 目标

继 ticket 245（三个「生成条目」宏）与 issue 246（「日常收集」捕获宏换血）之后，把 QuickAdd
「日常时间记录」Multi 里剩下两个 Capture 宏（当日代办事项 / 日常行为记录）搬进插件 diary 域：

| 宏（QuickAdd data.json 逐字口径） | 行为 | 冻结格式（data.json format） | 插入位置（insertAfter.after） |
|---|---|---|---|
| 当日代办事项（task: true） | 输入待办 → 当天日记 | `{{VALUE:请输入待办事项}}-{{DATE:HH:mm}}` + task → `- [ ] 内容-HH:mm` | `### 代办事项` 小节末尾 |
| 日常行为记录 | 输入活动 → 当天日记 | `- {{DATE:HH:mm}}-{{VALUE:请输入已做活动}}` → `- HH:mm-活动` | `## 日常行为记录` 小节末尾 |

命令 id：`bz-diary-todo-capture` / `bz-diary-activity-capture`；面板头部入口 ✅ / 🏃。

## 设计（复用 issue 246 模式：与 QuickAdd 宏同格式共写）

这两个宏是「捕获行」语义（往当天日记 `我的/日记/YYYY-MM-DD.md` 指定小节末尾追加一行），与
ticket 245 三个「生成条目」宏不同，不经过 diary addEntry 条目链路，而是**文件级原样插行**：

- 两种现存文件形态都直接插入、其余行不动（模板形态 frontmatter 不受 P0 守卫拖累——它本来
  就对 diary 解析器不可见，与 QuickAdd 行为一致；条目形态的插行成为条目正文，parser 重写不丢）；
- 与 QuickAdd 宏同格式共写，两者共存互不干扰（铁律 1：数据格式冻结零迁移）；
- 写盘走 core/storage 同路径串行队列（键 = 日记文件路径），与 diary store `writeFile` 互斥，
  与外部 QuickAdH 写并发不再互踩；
- 小节未命中：不建小节（沿用 createIfNotFound=false 语义），整行追加文件末尾并在通知中说明——
  有意改进 QuickAdd 未定义行为；文件缺失：以「标记 + 首行」新建文件（不复制 QuickAdd 模板
  frontmatter，避免制造对解析器永不可见的新文件）。

## 实现

- `src/diary/daily-capture.ts`（diary 域新模块，与 daily.ts 并列）：
  - 纯函数：`buildTodoLine`/`buildActivityLine`（冻结格式行）、`insertIntoSection`
    （小节末尾插行：命中=最后一个非空行后 / 小节空=紧跟标记行 / 未命中=文末追加）、
    `sanitizeCaptureText`（输入换行折叠空格）；
  - 薄壳 IO：`captureToDiarySection`（enqueueFileTask 读改写 modify/create）；
  - UI：`openQuickCapture`（uiModal 单行输入弹窗，遮罩+ESC 无关闭钮，Enter 直提）+
    `openTodoCapture`/`openActivityCapture` 两入口。
- `src/main.ts`：COMMANDS 加两条。
- `src/diary/ui/panel.ts`：头部加 ✅ / 🏃 两按钮。
- `src/diary/styles.css`：`.bz-diary-capture` 弹窗内容排布（弹窗基座走 core uiModal）。

## 测试

- `tests/diary/daily-capture.test.ts`（node，16 例）：冻结格式行构建 / insertIntoSection
  六分支 / sanitizeCaptureText / 薄壳 IO 四例（新建、模板形态保留、条目形态 parser 回读、
  未命中追加）。
- `tests/diary/daily-capture-ui.test.ts`（jsdom，4 例）：弹窗打开、空输入拦截、两入口确认落盘。
- `tests/smoke.test.ts`：`EXPECTED_COMMAND_IDS` 补两条。

## 门禁

tsc 0 错 + 全量测试绿 + 构建部署。
