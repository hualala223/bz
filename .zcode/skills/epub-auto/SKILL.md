---
name: epub-auto
version: 2.0.0
description: "EPUB 书籍全自动处理（本机唯一 EPUB 技能，一句话触发）：对目录内全部书籍（支持 EPUB/MOBI/AZW3/PDF/DOCX/TXT/RTF/HTML/MD 等）递归执行——①格式识别与转换（智能检测扫描版PDF并跳过）；②合辑自动拆分成单本（TOC 顶层结构检测）；③按书内元数据自动改名（dc:title→文件名）；④繁体中文→简体中文（opencc t2s + 著→着语境 + lang 改 zh-Hans）；⑤错别字修正 + 格式体检修复（mimetype/OPF/XML/目录对齐/锚点重建）；⑥收尾自动清理——产出成品的原书默认直接删除，全部成功时报告/汇总/工作区一并清掉，目录只留成品书；--keep-source 保原书、--keep-reports 保报告。单项需求用参数：--no-convert 关格式转换、--no-typo 关错字、--no-fix 关格式修复、--force-split 强制拆分。触发方式：「书籍调整」（主）、「自动整理书籍」「书籍整理」「处理这个文件夹的书籍」、提供包含书籍的目录路径。"
metadata: {"openclaw":{"requires":{"bins":["python"]}}}
---

# epub-auto：EPUB 书籍全自动处理

> **本机唯一 EPUB 技能**（epub-adjust / epub-fix 已并入本技能 scripts/，作为引擎与旧三合一 --legacy 模式存在）。用户说「书籍调整」即本技能；不要把请求转给其他已删除的技能名。

> **旧会话兜底**：若当前会话技能列表里没有 epub-auto（新技能需新开会话才会被索引），而用户要的是「书籍调整」，直接按本文件流程执行 `scripts/epub_auto.py`，**不要**退化成 epub-adjust 的三合一（那样不会拆分、不会改名）。

给一个**目录**，一句话跑完整条链：**格式转换 → 合辑拆分 → 自动改名 → 繁体转简体 → 格式修复 → 收尾清理**。成品落在 `<目录>/_epub_自动调整/`；跑完后**原书与报告/工作区默认自动删除，目录里只留成品书**（用户明确要求；`--keep-source` / `--keep-reports` 可保留）。

## 支持的格式

| 格式 | 转换工具 | 说明 |
|------|----------|------|
| **EPUB** | 原生支持 | 直接进入处理流程 |
| **MOBI/AZW3** | Calibre | Kindle 格式，高质量转换 |
| **PDF** | Calibre | **智能检测**：自动跳过扫描版（图片版）PDF |
| **DOCX/ODT** | Pandoc | Word 文档 |
| **TXT** | 自定义 | 纯文本（需安装 ebooklib） |
| **HTML/HTM** | Pandoc | 网页格式 |
| **MD** | Pandoc | Markdown |
| **RTF/LIT/PDB** | Calibre | 其他常见电子书格式 |

> **扫描版 PDF 自动跳过**：通过文本提取统计智能识别，避免无意义的转换。

## 流水线

```
书籍目录/*.{epub,mobi,azw3,pdf,docx,txt,html,md,rtf,...}（递归扫描）
  ├─ ① 格式识别与转换（epub_auto.py）
  │    ├─ 原生 EPUB：直接进入下一阶段
  │    ├─ MOBI/AZW3/RTF/LIT/PDB → EPUB（Calibre 转换）
  │    ├─ PDF → EPUB：智能检测，跳过扫描版（图片版），转换可编辑版
  │    ├─ DOCX/ODT/HTML/MD → EPUB（Pandoc 转换）
  │    └─ TXT → EPUB（自定义转换，需 ebooklib）
  ├─ ② 合辑检测与拆分（epub_split.py）：TOC 顶层 = 多本书且各带章节 → 按 spine 区间切成单册；
  │    顶层是 卷/部/辑/篇 的单本书不误拆（--force-split 可强制）；每册只携带本册正文实际引用的 CSS/图片/字体
  ├─ ③ 单本直通：未检测到合辑结构的书原样进入流水线
  ├─ ④ 三合一调整（复用 epub-adjust 全部引擎）：繁体转简体（t2s+著→着语境+lang 改 zh-Hans）
  │    → 错别字修正（保守规则表）→ 格式体检与修复（目录对齐/锚点/缺目录重建）
  ├─ ⑤ 自动改名：读成品 dc:title → 安全字符清洗 → 作为最终文件名（重名自动 (2)(3)）
  └─ ⑥ 归位 + 汇总：成品在 _epub_自动调整/，逐本报告在 _报告/，总览在 _自动化汇总.md
```

## 使用方式

```powershell
python -X utf8 "<SKILL_DIR>/scripts/epub_auto.py" <书籍目录>              # 全自动（推荐）
python -X utf8 "<SKILL_DIR>/scripts/epub_auto.py" <书籍目录> --no-convert  # 关闭格式转换，只处理原生 EPUB
python -X utf8 "<SKILL_DIR>/scripts/epub_auto.py" <书籍目录> --no-typo    # 不做错别字修正
python -X utf8 "<SKILL_DIR>/scripts/epub_auto.py" <书籍目录> --no-fix     # 不做格式修复
python -X utf8 "<SKILL_DIR>/scripts/epub_auto.py" <书籍目录> --force-split # 分卷结构的单本书也强制拆
python -X utf8 "<SKILL_DIR>/scripts/epub_auto.py" <某.epub所在目录> --keep-staging  # 保留中间区排障
python -X utf8 "<SKILL_DIR>/scripts/epub_auto.py" <书籍目录> --keep-source    # 保留原书（默认：产出成品的原书自动删除）
python -X utf8 "<SKILL_DIR>/scripts/epub_auto.py" <书籍目录> --keep-reports   # 保留报告与汇总（默认：全部成功时自动删除）
```

单独微调（只繁转简 / 只修格式 / 只拆分）请直接用 `epub-adjust`、`epub-fix` 或 `epub-auto/scripts/epub_split.py <某.epub>`。

## 产物约定（相对输入目录）

| 路径 | 内容 |
|------|------|
| `_epub_自动调整/<书名>.epub` | 成品（已拆分/改名/繁转简/修复），重名自动加 (2)(3) |
| `_epub_自动调整/_自动化汇总.md` | 总览：每本来源 → 拆了几册 → 成品清单 |
| `_epub_自动调整/_报告/<书名>.md` | epub-adjust 逐本调整报告（判定/文本调整/修复动作） |
| `_epub_自动调整/_未完成/` | 调整阶段失败的书（原书同时保留在原位，读 `_报告` 排障后可重跑） |
| `_epub_自动调整/_staging/` | 中间工作区，默认跑完即删（`--keep-staging` 保留） |

> **收尾清理（默认）**：产出成品的原书直接删除；全部成功（无转换失败/跳过/未完成）时 `_报告/` 与 `_自动化汇总.md` 也一并删除，目录里只剩 `_epub_自动调整/` 里的成品书。有任何失败/跳过的书，其原书一律保留；`--keep-source` / `--keep-reports` 可整体保留。成品不放根目录，是为了防止下次运行把成品再当来源重复处理。扫描永远跳过 `_epub_*` 产物目录、`pdf2epub-paddle` 等工具目录、隐藏目录（`.` 开头）与 `node_modules`/`__pycache__`。

## 判定与纪律

- **合辑判定**：TOC 顶层条目 ≥2 且至少 2 个带下级章节 → 拆分；顶层多为「卷/部/辑/篇」视为单本书分卷，**不拆**；判不准时宁可少拆，汇总里写明理由。
- **PDF 智能判定**：通过文本提取统计识别扫描版（图片版）PDF，自动跳过避免无意义转换。判定标准：前5页提取文本 <200字符 或 平均每页 <50字符。
- **改名规则**：成品文件名 = 书内 `dc:title`（清洗非法字符、限 80 字）；拆分册书名 = 合辑 TOC 里该册的顶层标题。规则想换（如加作者前缀）改 `epub_auto.py` 的 `safe_name`/`read_title` 即可。
- **收尾清理**：产出成品的原书默认**直接删除**（用户要求：免手动清理）；失败/跳过/未完成的书原书**保留**；全部成功时报告与汇总也自动删除。想保留任何东西用 `--keep-source` / `--keep-reports`。成品写入前先在 `_epub_工作区` 中间区完成，确认产出成功才执行删除，避免误删。
- 长批次（几十本）建议后台跑；`_报告/_failures.txt` 列出需人工的书。
- 版权：仅处理用户有权处理的书籍文件。
- **新增本 skill 后需新开会话**，才会出现在平台的技能列表里。

## 依赖说明

### 必装依赖

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| Python 3.7+ | 运行环境 | [python.org](https://python.org) |
| opencc-python-reimplemented | 繁简转换 | `pip install opencc-python-reimplemented` |
| Calibre | MOBI/AZW3/PDF/RTF/LIT/PDB → EPUB | [calibre-ebook.com](https://calibre-ebook.com)（安装后自动提供 `ebook-convert` 命令） |

### 可选依赖

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| Pandoc | DOCX/ODT/HTML/MD → EPUB | [pandoc.org](https://pandoc.org) |
| PyPDF2 | PDF 类型检测 | `pip install PyPDF2` |
| pdfminer.six | PDF 类型检测（备选） | `pip install pdfminer.six` |
| EbookLib | TXT → EPUB | `pip install EbookLib` |

> **说明**：未安装的可选依赖不影响其他格式的处理。TXT 转换需要 EbookLib；PDF 检测优先使用 PyPDF2，不可用时尝试 pdfminer.six。
