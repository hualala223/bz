# ADR-0133 — 第二大脑「已入脑」角标：派生标记，不写笔记文件

**日期**：2026-09-25　**票**：305　**状态**：已采纳

## 背景

单篇笔记「是否已被向量化入索引」此前没有可视标识：主面板只有聚合统计与「最近向量化」列表，用户想知道某篇笔记入没入脑得开面板或翻 secondbrain.json（票 305 用户原话：「让人一看就知道这篇文档已经被向量化」）。

## 决策

在 Obsidian 文件浏览器给 `meta.notes` 已登记的笔记行挂一枚绿点（类 `bz-sb-vec`，样式源头 `src/secondbrain/styles.css`），装饰实时**派生自索引**：`VectorStore.onIndexUpdated`（load 与每轮 refresh 收敛点）+ MutationObserver 兜 DOM 增量 + `layout-change` 重挂。开关 `secondBrainExplorerBadge` 缺省开（⚙️ 域设置弹窗「外观」组）。

**为什么不写 frontmatter 属性（拒绝项，后续勿再提）**：

1. **事件链空转**：插件写笔记触发 `vault:md-modified` → 索引 5s 防抖 refresh（正文指纹同不重嵌，但仍多一轮登记与写盘）+ link agent 哈希比对监听；首次全量标记 = 对全库存量逐篇写盘。
2. **Syncthing 冲突**：多设备同步场景插件写用户笔记 = 冲突文件高发（STORAGE 已有 `secondbrain.sync-conflict-*` 自愈先例，ticket 152；该自愈只覆盖自家数据文件，不覆盖笔记）。
3. **残留假信息**：笔记移出白名单 / 从索引删除后，文件内标记无从感知，残留成「已向量化」假象；追删又是一轮全量写放大。派生标记则天然随索引真相走——索引删，角标即消失。

**为什么挂文件行而非状态栏/详情**：需求原义是「扫一眼文件列表就知道」；状态栏仅在打开笔记时可见。文件夹行不标（「已入脑」是文件级语义，文件夹聚合数可用主面板来源分布看）。

## 后果

- 装饰 pass 是 O(当前 DOM 行数) 的幂等全量扫，万级行毫秒级；折叠目录子行同在 DOM，无需展开处理。
- explorer DOM 契约（`.tree-item-self.nav-file-title[data-path]`）是 Obsidian 内部结构，Obsidian 大版本改版需回归本模块（全插件仅此一处消费 explorer DOM）。
- `VectorStore` 新增轻量订阅面 `onIndexUpdated`：回调抛错仅告警，不反噬索引管线；后续凡「索引变更 → 视觉刷新」类需求统一走它，不再各挂 modify 监听。
