# 279 — 读书报告：去内联收编域 CSS + 暗色提亮 + G10 热力图翻月修复

日期：2026-09-13 ｜ 类型：style+fix（吸收补全）｜ 状态：已交付
来源：用户裁决「④跟上游保持一致」+「处理读书报告部分」（票 277 遗留：reading-report UI 收编暂缓项）
关联：上游 77cc6676（去内联+暗色，上游 issue 270）、17c55363（G10）、05e8da46（批次 A 上收）；ADR-0121 皮肤例外

## 安全性预验证（先核实再动手）

- 本地 `src/reading-report/` 四文件 + `tests/reading-report/` 五文件经 blob hash 比对，**全部为上游 85f38a99（09-10 大扫除）血统原文，零本地私有改动**，工作区干净 → 整域文件对齐上游 HEAD = 纯 fast-forward，零丢失。
- 域不在五块红线内；去内联属纯视觉层（交互行为零变化），符合 ADR-0121 皮肤例外；G10 属非红线域功能修复，符合「非红线按上游走」。
- 跨域消费方三个（main.ts / bookshelf/ui.ts / bookshelf/index.ts）所依赖的 4 个导出在上游版全部保留，DOM 契约 `data-rr-*` 属性集合两侧一致。

## 交付内容

1. **去内联收编域 CSS**（77cc6676）：report.ts 生成 HTML 的 198 处 `style="..."` 内联 → styles.css 类（252→854 行），stats.ts 同步小规模清理；含**暗色指标色提亮**（.theme-dark 对档）。
2. **G10 修复**（17c55363）：热力图翻月后两导航按钮 disabled 不同步——点一次 ‹ 后 › 永久失效的边界 bug（7 行，含注释）。
3. **批次 A 上收补全**（05e8da46）：`yieldToMainThread(timeoutMs)` 进 core/utils.ts（requestIdleCallback 优先 + 超时兜底；此前本地只有本域私有副本），index.ts 改用 core 单源。
4. **测试同步**：report/stats/index 三测试随新类名标记更新 + 新增 style.test.ts（122 行样式守卫：断言域 CSS 规则与内联残留为零）。

## 冻结核查

- diary 系 / review 系 / AI 设置 / 小橘设置：零接触。
- 改动全集 = src/reading-report 4 文件 + tests/reading-report 4 文件 + core/utils.ts 1 处新增导出 + 本票。
- core/utils.ts 为纯新增导出（无既有函数改动），其他域不受影响。

## 门禁

- [x] 域测试 6 文件 88 例全绿（含新 style.test.ts）
- [x] tsc --noEmit 0 错误
- [x] 全量 vitest + production 构建见 PROGRESS 收尾记录
