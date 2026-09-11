# ADR-0109：写日记弹窗两步化（类型+时间 → 正文）

## 背景

写日记弹窗原本是单弹窗，自上而下：`标题 → 日期时间 → 类型(label+按钮容器) → 内容(textarea) → 保存`。
弹窗是垂直居中卡（`top:50%; transform:translate(-50%,-50%)`、`max-height:80vh; overflow-y:auto`），移动端只有 `width:85%` / `padding` / 隐藏滚动条三条适配，**没有任何软键盘避让**。

移动端实际症状：点正文框 → 软键盘顶起 → 弹窗下半部被键盘覆盖，正文框与保存按钮都在被覆盖区，无法输入也无法保存。

## 决策

**拆成两步，共用一个 mask、两个 popup**（第一步隐藏而非销毁）：

1. **第一步** `#add-diary-popup`：标题 + 日期时间 + 类型容器 + 吸底按钮行（「下一步」）。
   点「下一步」先校验 `readSelectedAddTags()` 非空，为空则弹冻结文案「请至少选择一个类型」并留在第一步。
2. **第二步** `#add-diary-content-popup`：标题 + 内容 label + `#add-diary-content` + 吸底按钮行（「上一步」「保存」）。

配套决策（grill 共识）：

| 项 | 决策 |
|---|---|
| 键盘避让（dvh / visualViewport / 全屏） | **不做**——第二步只有「一个 textarea + 两枚按钮」，几何上不存在被遮元素 |
| 桌面端 | 与移动端**同一套两步流程**（不搞 CSS order 反转的双渲染路径） |
| 保存按钮 | 放 `.bz-diary-add-foot` 吸底（body 限高滚动，foot 不随内容滚走） |
| 第一步聚焦 | 移动端**不自动聚焦**（`isMobileEnv()` 判定），避免打开即弹键盘 |
| 第二步聚焦 | 自动聚焦正文框（用户主动点「下一步」进来，意图明确） |
| preset 入口（如每日复盘预选「复盘」） | 带分类时**跳过第一步**直接进第二步，正文照常预填 |
| 草稿语义 | 「上一步」**保留**草稿，取消（遮罩）/ 保存**丢弃** |

### 关键实现约束

- **数据源仍在第一步**：第二步显示期间第一步只是 `display:none`，`#add-diary-datetime` 与 `#add-diary-type-container` 连同选中态都在，因此 `saveNewEntry()` 取值逻辑不变，9 个既有测试文件的断言无需重写。
- **id 一个没动**：`add-diary-mask` / `add-diary-popup` / `add-diary-content` / `add-diary-type-container` / `add-diary-datetime` 全部保留（铁律 3 DOM 契约）。
- 新增样式走源头 `src/diary/styles.css`（`.bz-diary-add-body` / `-foot` / `-btn` / `-btn-ghost`），不新增内联视觉样式（铁律 8）。

## 后果

- 写日记从「一次填完」变「两步」，桌面端也如此——多一次点击换来移动端可用。这是本次的核心代价，用户已确认接受。
- 「上一步/下一步」是新增流程状态（模块级 `addDialogDraft`），跨步数据不落盘；关闭弹窗即丢弃，不存在半条脏数据。
- 若日后要做键盘避让（更大屏幕键盘 / 分屏场景），第二步弹窗高度足够低，仍是改造成本最低的形态。
