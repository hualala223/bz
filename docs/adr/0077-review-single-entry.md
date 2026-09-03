# 复习单一入口：命令与面板退役，交互收敛到「复习（按数量）」（ADR-0077）

ticket 168：用户要求「去除开始复习/复习计划/加入复习计划等命令，保留复习（按数量）」，并把被去功能中需要保留的能力（设置、逾期提醒、监控提示等）全部收敛进「复习（按数量）」。经三轮同人审（全推荐）+ 设计确认书确认后落地（grill-with-docs → to-spec → to-tickets 六切片）。

## 收敛面

- **命令 11 → 1**：`bz-review-open`/`bz-review-start`/`bz-review-add-current`/`bz-review-next`/`bz-review-speed-*` 等 10 个旧复习命令全部退役注册（命令 id 外部契约破坏接受，用户拍板），仅留 `bz-review-count`；注册命令总数 39 → 35。
- **主面板整体删除**：列表/卡片/统一抽屉/难度弹窗/归档/搜索/键盘路径随之删除；文件树标记（applyReviewStyles）、监听文件夹、逾期常驻通知（checkOverdueAndNotify）保留。
- **死代码与死设置键**：autoJumpOverdue/redoReviewLoop/quizReviewLoop/reviewLoop/batchGenerateQuestions/结果卡两函数等全部删除；`forceQuizForReview`（复习全面做题化，出题子项常显）、`reviewMobileDefaultFullscreen`（复习已无主窗口）两键删除。
- **设置入口**：⚙️ 收敛到篇数弹窗（空候选时弹窗仍打开、设置可达，防止候选文件夹为空时设置锁死）；新增「复习条目管理」组——面板删除后清理 review.json 条目的唯一入口（逐条移出确认 → toast 撤销原样恢复，阶段/排期/历史零丢失）。
- **「去复习」语义**：到期提醒通知挂的 action 不再单篇跳转，直接进全 vault 逾期按数量会话（`startOverdueCountSession`：min(逾期数, 每日上限) 截断，提示「本轮复习 N 篇，剩余 M 篇留到下次」；AI 未配置明确提示「无法按数量复习」）。

## 关键拍板

- **命令 id 100% 收敛是有意的外部契约破坏**（用户拍板接受，不保留兼容别名）。
- **review.json 只读兼容零迁移**；被删键/旧面板语义不迁移。
- **按数量复习既有行为冻结**（候选文件夹/历史配比/每日上限/汇总结算/重做本篇），只在其上收敛新语义。
- **做题全面化**：做题家 4 出题子项常显（forceQuizForReview 常开，键删）。
- **挂起记录与条目管理**：挂起（文件缺失）条目标灰展示；移出走确认弹窗 + 撤销恢复（ticket 141 通病 1 机制，与旧面板抽屉同构）。

## Considered and rejected

- 保留一个「开始复习」兼容命令别名（会继续分裂入口，用户要求单一入口）；
- 空候选时不打开篇数弹窗（反例：候选为空时 ⚙️ 设置入口会被锁死，故弹窗仍开、仅剩设置可修正——ticket 02 拍板）；
- 复习移动端默认全屏键保留（复习已无主窗口，开关失去意义）；
- review.json 迁移重做队列自动进度（旧待重做 FIFO 优先级随 autoJumpOverdue 删除；按数量会话对 pendingRedo 条目按重做语义处理，标记字段保留）。

## 存量数据兼容

review.json 格式零改动（ReviewItem 字段不变，pendingRedo 标记语义保留）；data.json 中被删键（forceQuizForReview/reviewMobileDefaultFullscreen）残留值读取时忽略。