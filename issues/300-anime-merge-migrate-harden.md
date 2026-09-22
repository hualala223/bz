# 票 300：动漫细分退役 + 娱乐目录迁移加固

**What to build:** 两项（同日 grill 确认「都做」）：

1. **动漫细分退役（用户裁决）**：动漫组的 日漫/国漫/美漫 三个细分 tag 取消——顶级类型收敛为单个「动漫」chip（表单类型行、fm 写入口径与其他六组一致）。旧 tag 日漫/国漫/美漫 经 `LEGACY_TAG_MAP` 读侧归一显示为「动漫」，fm 原值不改写（同票 293 剧集退役、票 299 小说正名先例）；手动重存条目才写新值「动漫」。
2. **娱乐目录迁移加固（票 292 缺陷修复）**：`migrateCinemaFolder` 的目录 renameFile 包 try/catch——失败（网络盘占用/外部同步进程锁等）不再中断插件 onLoad（此前表现为插件开关打不开），降级为 toast 提示「请手动重命名文件夹」，设置值平移照常生效。

**Why:** 用户质问「日漫国漫美漫是什么鬼？统统不是动漫吗？」——细分粒度无使用价值且与其余组口径不一致；rename 失败炸 onLoad 是实机观察到的加载失败根因假设（data.json 16:42 后未落盘 + 开关弹回）。

**Blocked by:** 292（迁移为其加固）、293（归一映射先例）

**Status:** done

- [x] constants.ts：TYPE_GROUPS 动漫组收敛 ['动漫']；LEGACY_TAG_MAP 加 日漫/国漫/美漫→动漫
- [x] shared.ts GROUP_SUBS_OF 动漫清空（表单单 chip）；recommend.ts GROUP_DEFAULT_TAG 动漫:'动漫'
- [x] migrate.ts rename try/catch + console.error + Notice 降级
- [x] migrate.test 补「rename 失败不抛异常」用例；data.test 补 国漫/美漫 归一断言；ui.test 美漫 seed 留作读侧归一活体验证
- [x] ADR-0129；PROGRESS 登记
