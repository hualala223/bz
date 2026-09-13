# Issue 264 · 吸收上游番茄钟 10 套面板皮肤（B 类「全域皮肤」实底收敛后唯一真皮肤块）

**Status:** 已交付
**来源:** 上游 `yeshimei/bz` master `7b06f4b4`（基线同审计报告）
**关联:** ADR-0121（review/diary 冻结 + 设置页 AI/小橘板块冻结）、issue 256 审计、issue 263（choiceCards/预览卡基建已在）

## 背景

审计 B 类列「全域皮肤 13 组」。本票开工前逐域实底核查，**推翻审计的乐观计数**：

| 上游皮肤组 | 实底结论 | 本票处置 |
|---|---|---|
| **pomodoro 10 主题**（tomato/ink/grid/moss/mist/sand/citrus/sakura/latte/night） | **真皮肤**：CSS :root 色值表 + 亮/暗两版皮 + applySkinClass + 设置行 | ✅ 本票吸收 |
| todoSkin（上游 memoSkin） | 本地已有，paper/editorial 两肤与上游同款 | 无需动 |
| bookshelfSkin（5 肤） | 本地已有 | 无需动 |
| settingsPanelSkin | 本地已有 | 无需动 |
| cinemaSkinTheme（nightfall） | **占位**：上游官方注释「主题行占位，域消费待皮肤设计时接入」，CSS 零消费；本地菜单本就挂面板树内（`.bz-cinema--midnight .cn-menu`），不缺浮层调色板 | 跳过 |
| secondbrainSkin（graphite） | **占位**：styles.css 零消费 | 跳过 |
| belongings/clipbook/encrypt/favorites/knowledge(→literature)/home/passwordVault 各 Skin | **占位单卡**：上游注释自证「外观组占位，域 UI 消费待皮肤设计时接入」，无 apply 函数、无 CSS（favorites 的 linen 是面板常驻视觉非皮肤档） | 跳过（搬来=设置页多出一排只有一个选项的假卡片，纯噪音） |
| diarySkin / reviewSkin | 冻结（ADR-0121） | 排除 |
| smartcatSkin | 冻结（小橘板块） | 排除 |

## 改动（7 文件）

| 文件 | 内容 |
|---|---|
| `src/pomodoro/skin.ts` | **新增**：主题单源（type + POMODORO_SKIN_THEMES 清单 + normalizeSkinTheme + skinClassOf）。上游在 render.ts（markup 单源重构），本地 markup 仍在 ui.ts，故只取皮肤清单段独立成文件 |
| `src/pomodoro/ui.ts` | import skin；`applySkinClass()`（render 内重挂，换肤即时生效）；SKIN_THEME_OPTIONS（prevClass `bz-sp-prev-pomo-<id>`）；出口 POMODORO_SKIN_THEMES（对齐上游测试消费面）；schema groups 头部插「外观」组（布局行 pomodoroSkin + 主题行 pomodoroSkinTheme + 配套回落） |
| `src/pomodoro/styles.css` | 整体换装为上游 token 化底座（--pz-* 兜底链）+ 10 套 × 亮/暗皮肤段；**本地独有段全部保留**（#pomodoro-btn-settings 3 规则、.pomodoro-hours 小时柱 3 规则、max-width:768 媒体查询、pointer:coarse 设置钮 padding） |
| `src/settings.ts` | 接口 + 默认值：`pomodoroSkin: 'default'`、`pomodoroSkinTheme: 'tomato'` |
| `src/settings-panel/styles.css` | 追加 10 张 `bz-sp-mini.bz-sp-prev-pomo-*` 预览卡（色值引用 --pz-* 表，零手抄 hex） |
| `tests/pomodoro/settings.test.ts` | 既有「打开设置弹窗」计数 13/12→15/14、组头/names 同步；新增「面板主题（皮肤单源）」2 例 + 「外观组链路」3 例 |
| `tests/pomodoro/ui.test.ts` | 样式基线用例遮罩 token 换代（--background-modifier-cover→--bz-overlay，随上游底座）；新增弹窗皮肤类挂摘 2 例 |

## 用户可见变化

- 设置（⚙️ 弹窗与设置面板同步）番茄钟新增「外观」组：面板布局（计时盘）+ 面板主题 10 选 1，每套带预览卡，亮暗自适应。
- 弹窗开着改主题即时换皮；重开面板/换皮后 ring、按钮、文字配色随皮走。
- 默认主题「番茄」为暖白底红强调——与旧版（跟随 Obsidian 变量）观感略有差异，属上游拍板的皮肤化口径。

## 验收

- `tests/pomodoro` 169 例全绿（含 7 新增皮肤用例）。
- 门禁：tsc / 全量 / 构建见工作日志（提交 `7ab5c85a`）。

## 冻结核查（ADR-0121）

review/diary 系零接触；AI 设置/小橘设置板块零接触（本票未动 settings-model-picker 与任何 smartcat 文件）；设置默认键为**新增**键，不改任何既有配置项行为。
