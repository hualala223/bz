# 票 302 — 「每日复盘」更名「每日触动点记录」

用户原话：将这个插件里的每日复盘改成「每日触动点记录」，其他保持不变。

## 裁决（grill 四问）

- Q1 改 diary 域入口（命令/面板按钮/首页/通知）；recap「今日回顾」面板不动 —— 推荐。
- Q2 (a) 落点小节标题改，旧文件不迁移。**初裁**标题 `# 每日触动点记录` + 旧 `# 当日复盘` 别名兼容；**二次裁定（用户实测后，同日）**：标题定 `# 当日触动点`，且**不再兼容旧落点**——不往 `# 当日复盘` 追加，写入固定文末新建/节内按顺序追加 `# 当日触动点`，别名管道回收。
- Q3 命令 id `bz-diary-review` 不变，只改显示名。
- Q4 标签「复盘」→「触动点」；emoji 🪞 与模板正文不动。

## 落地

- [x] daily-write.ts：REVIEW_HEADING = `# 当日触动点`（无别名兼容；旧 LEGACY_REVIEW_HEADING 已回收）
- [x] daily-capture.ts：`aliases` 参数整体回收，findMarkerLine/locateSection/insertBlockIntoSection/writeBlockToDiarySection 回到「精确优先、旧层级兜底」原貌
- [x] daily.ts：REVIEW_TAG='触动点'；config.ts 标签键 复盘→触动点（emoji 🪞 不变）
- [x] main.ts 命令名 / diary 面板 tooltip / home 快捷入口 label / 通知文案（sectionTitle 派生）跟随
- [x] 测试：add-dialog-content（新建/按顺序追加/旧落点不兼容三用例）/ add-dialog-steps / daily-tasks / daily-flow 同步
- [x] ADR-0131；CONTEXT.md 术语（分步写日记/日记内容块/日常时间记录）同步
- [x] 门禁：tsc --noEmit 0 错；esbuild production 过（vault 产物 + 根三件套再生，不提交）；vitest diary 域 33 文件 485 用例全绿（初跑 32/477 亦全绿；全量基线见下）；全量 **Test Files 3 failed | Tests 6 failed**——同票 297/299/300 记录的并行会话遗留基线（clipbook news-fetcher/ui + core/obsidian-adapter），与本票无关
