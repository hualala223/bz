# 票 273：吸收第二大脑（secondbrain）原型重写 + 移动端滚动/全屏 + issue 298 即时建链

日期：2026-09-13 ｜ 队列第 5 张（272 之后）｜ 上游来源：issue 251（ADR-0110 原型三界面重写）/ ADR-0114 + issue 272（移动端整体滚动模型 + 真全屏 + 头行关闭钮）/ issue 298（文献笔记生成即跑）/ issue 270（皮肤键）/ issue 291（danger 按钮语义）

## 一句话结论

secondbrain 域 UI/markup/link-agent 监听整体换上游（251 原型重写 + ADR-0114/272 移动端 + 298 即时建链），**本地 ticket 173 / ADR-0078 的「正文指纹三层判定 + 挪动继承向量（换文件夹不重嵌）」完整保留不动**（vector-store.ts / chunk.ts 一字未改，上游仍是 v9 无对应物）。

## 用户约束（本轮补充）

- **「文件更换文件夹位置之后，不再再次向量化，而是能保持持续的向量化」这个功能不要改变** → vector-store.ts（v10 指纹 + 孤儿池迁移）、chunk.ts（hashChunks）、其测试（vector-store.test.ts / vector-store-cov.test.ts，含 v10 断言）全部保留本地版本。✅ 已做到：这两个文件不在改动清单。
- 其余都可以按上游走。✅

## 吸收改动（18 改 + 4 新增）

### 整文件换上游（字节复制，双方均 CRLF）

| 文件 | 内容 |
|---|---|
| `src/secondbrain/render.ts`（新） | ADR-0104 纯层：computeStats / buildSourceTree / panel*Html / chat*Html / refCardHtml / 色板常量（上游 251） |
| `src/secondbrain/panel.ts` | 重写为行为层（原型六卡 + 索引健康/存储占用并入底部状态行）；ADR-0114 移动端整体滚动模型（`.bz-sb-panel-content` 唯一滚动容器/操作行吸底）；issue 272 真全屏（`.bz-panel-mtop` 44px 顶部避让 + `#bz-sb-panel-close` 头行关闭钮）；isRefreshing 在途 → 进度视图（等价本地票 173 的 open 修复）；设置改 schema 单源（外观组含面板布局/主题 choiceCards） |
| `src/secondbrain/chat-panel.ts` | 原型重写（模型徽标/气泡/检索呼吸点/常驻推荐 chips/引用卡仅会话内展示）；清空确认 danger + `bz-sb-flow-dialog` 皮肤类（issue 291） |
| `src/secondbrain/reference-panel.ts` | 卡片 markup 走 render.ts（分数条/来源色点），密度切换/悬停预览/拖出浮卡行为逐行保留 |
| `src/secondbrain/mobile-panel.ts` | 移动对齐（issue 251）：标签气泡 + 推荐问法 + 聚焦态输入行 + 分数条；chatHistory 落盘读回（与桌面同源） |
| `src/secondbrain/index.ts` | 启动即自动加载语义（secondBrainEnabled 开关退役为「仅控启动自动加载」）；issue 298 接线（LinkAgentWatcher 传 initialLoad）；`requestRebuildAndOpen` / 异步 `rebuildSecondBrainIndex`（带 confirmFullRebuild 确认）；注释口径 knowledge→literature 归一化 |
| `src/secondbrain/ui-tools.ts` | 类型化（去 `as any`） |
| `src/secondbrain/styles.css` | 全量重写（米白 #fbfaf7 / 红棕 #a33d2a；面板固定浅色；移动抽屉段重画；@media 真全屏升格） |
| `src/secondbrain/link-agent/data.ts` | isUnderFolder 改转发 core 单源；stripMdExt 收口；Record 类型化校验 |
| `src/secondbrain/link-agent/pipeline.ts` | issue 298 `processNoteNow`（单篇即时建链，串行锁互斥）；encryptRoot 收口 |
| `src/secondbrain/link-agent/watch.ts` | issue 298 订阅 `'literature:tasks'`（**本地归一化**：上游 `knowledge:tasks` → 本地 `literature:tasks`，本地文献盒域事件名，ADR-0118）；initialLoad 等待；索引白名单一次性引导 |

### core / settings

| 文件 | 内容 |
|---|---|
| `src/core/utils.ts` | 追加 `isUnderFolder(folder, path)`（上游实现原样，插在 cmpZh 后；本地原先无此导出） |
| `src/settings.ts` | 补 `secondbrainSkin: 'default'` / `secondbrainSkinTheme: 'graphite'` 两键（interface + DEFAULT_SETTINGS；上游 issue 270 皮肤键，对齐 bookshelf/pomodoro/clipbook 各域 Skin 先例） |

### 测试（8 换/增，3 保留）

| 动作 | 文件 |
|---|---|
| 换上游 | `chat-ux` / `index-mobile`（pill 锚点改 aria-label）/ `link-agent-ui`（+224 行，issue 298 全覆盖；**15 处 `knowledge:tasks`→`literature:tasks` 归一化**）/ `onboarding-ui` / `panel-settings-ip` |
| 新增 | `render.test.ts`（纯层 139 行）/ `skin-dark.test.ts`（皮肤 token 186 行）/ `panel-close-reset.test.ts`（头行关闭钮 108 行） |
| 保留本地 | `vector-store.test.ts`（票 173 指纹/v10 迁移断言）/ `vector-store-cov.test.ts`（同）/ `settings-migrate.test.ts`（本地独有） |
| 本地骨架小改 | `tests/core/settings-copy-lint-c.test.ts`：白名单加 `secondbrain#本机局域网 IP:*`（上游 ticket 122 豁免，随新 schema 生效）；删已退役 `secondbrain#启用:title-length`（该行随上游 schema 消失）。**smartcat mock 保持本地口径（冻结域不跟上游删 mobileFullscreen 参数）** |

## 明确不吸 / 行为差异（已记录）

1. **`bz-secondbrain-rebuild-index` 命令未注册**：上游在 main.ts COMMANDS 表登记 + 首页入口菜单；本地 main.ts 是您在制改动文件，一票红线「不碰 main.ts」。index.ts 已导出该函数（闲置），后续您点头可单独登记。
2. **`secondBrainMobileDefaultFullscreen` 设置键成为惰性键**：上游 issue 272 把移动端 ≤768px 升格**永远真全屏**，原「移动端默认全屏」开关语义被取代；键与默认值留在 settings.ts（不迁移不删除），⚙️ 面板不再出该行。
3. **⚙️「启用」开关行消失**：上游把 secondBrainEnabled 退役为「仅控启动自动加载」；本地 main.ts 的启动门保留（键默认 true，行为不变），仅 UI 行不再出现。
4. **term-generated 即时建链本地不生效**：本地文献盒 `literature:tasks` 的 term-generated 载荷无 notePath（上游知识盒带），issue 298 处理器只认带路径的成功事件 → 术语笔记走既有 md-created 批次防抖路径兜底；视频 converted（带 notePath）即时建链正常。
5. **`_cdp-selftest.mjs` 未搬**（上游开发自检脚本，无引用）。
6. **本地 `scripts/build-preview.mjs` 的 PREVIEW_DOMAINS 维持不含 secondbrain**（本地口径注释在案）→ render-purity 守卫不要求 secondbrain/prototype-render.js，无需预构建产物。
7. 上游 chat-panel `welcomeText(topK)` 改回内部 `buildConfig().CHAT_TOP_K`——本地曾经的参数化版本被上游形态覆盖（行为等价）。

## 门禁

- tsc --noEmit：0 错（首轮 2 错 = 缺皮肤键，第 3 批补齐后过）
- tests/secondbrain + tests/core：60 文件 / 849 例全绿（首轮仅 copy-lint 1 例失败 = 白名单缺豁免）
- 全量：**285 文件 / 4501 例全绿**（票 272 后 282/4465 → +3 文件 / +36 例，与新测试吻合）
- production 构建：通过；产物抽查命中 `literature:tasks` / `正在初始化向量数据库` / `bz-panel-mtop` / `bz-sb-panel-close` / `本机当前局域网 IP 为` / styles 含 `bz-sb-panel-content`+`bz-panel-mtop`+米白 token；构建产物已还原未提交

## 冻结域零接触核查

改动全集 = `src/secondbrain/*` 12 + `src/core/utils.ts` + `src/settings.ts` + `tests/secondbrain/*` 8 + `tests/core/settings-copy-lint-c.test.ts`。`src/diary|review|recap|smartcat` / 设置页 AI 设置与小橘设置板块：零字节接触。`src/settings.ts` 仅追加 secondbrain 皮肤两键，不涉冻结板块的键与文案。

## 环境事件

- 无。worktree `wt-sb`（`N:/新建文件夹/.dsh-worktrees/sb`），提交后摘 node_modules 联接 → remove → prune → 删分支。
