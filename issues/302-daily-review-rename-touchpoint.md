# 票 302 — 「每日复盘」更名「每日触动点记录」

用户原话：将这个插件里的每日复盘改成「每日触动点记录」，其他保持不变。

## 裁决（grill 四问）

- Q1 改 diary 域入口（命令/面板按钮/首页/通知）；recap「今日回顾」面板不动 —— 推荐。
- Q2 (a) 落点小节标题改 `# 每日触动点记录`，旧文件 `# 当日复盘` 兼容定位、不迁移。
- Q3 命令 id `bz-diary-review` 不变，只改显示名。
- Q4 标签「复盘」→「触动点」；emoji 🪞 与模板正文不动。

## 落地

- [x] daily-write.ts：REVIEW_HEADING 更名 + LEGACY_REVIEW_HEADING 常量；writeDiaryEntry 传 aliases
- [x] daily-capture.ts：findMarkerLine/locateSection 加 aliases（同级异名旧标题两轮查找，单源）；insertBlockIntoSection / writeBlockToDiarySection 透传
- [x] daily.ts：REVIEW_TAG='触动点'；config.ts 标签键 复盘→触动点（emoji 🪞 不变）
- [x] main.ts 命令名 / diary 面板 tooltip / home 快捷入口 label / 通知文案（sectionTitle 派生）跟随
- [x] 测试：add-dialog-content（新旧两代标题 + 新增旧文件兼容用例）/ add-dialog-steps / daily-tasks / daily-flow 同步
- [x] ADR-0131；CONTEXT.md 术语（分步写日记/日记内容块/日常时间记录）同步
- [x] 门禁：tsc --noEmit 0 错；esbuild production 过（vault 产物 + 根三件套再生，不提交）；vitest diary 域 32 文件 477 用例全绿；全量 **Test Files 3 failed | 303 passed (306)，Tests 6 failed | 4824 passed (4830)**——6 失败同票 297/299/300 记录的并行会话遗留基线（clipbook news-fetcher/ui + core/obsidian-adapter），与本票无关
