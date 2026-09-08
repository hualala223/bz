# -*- coding: utf-8 -*-
"""epub_auto.py — EPUB 全自动处理编排（epub-auto 技能主入口）

流水线：扫描目录 → 格式识别与转换（PDF/MOBI/AZW3/DOCX/TXT等→EPUB）→ 合辑自动拆分成单本 → 按书内元数据改名 → 复用 epub-adjust
（繁体转简体 + 错别字修正 + 格式修复）→ 成品归位 + 收尾自动清理。
收尾清理（默认开启）：产出成品的原书直接删除；全部成功时报告/汇总/工作区也一并清掉，目录里只留成品书。
--keep-source 保留原书；--keep-reports 保留报告与汇总。
"""
import sys, os, re, json, shutil, zipfile, subprocess
import xml.etree.ElementTree as ET

NS_OPF = 'http://www.idpf.org/2007/opf'
NS_DC  = 'http://purl.org/dc/elements/1.1/'
HERE   = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import epub_split

# 支持的格式配置
CONVERTERS = {
    # Calibre 优先支持
    '.mobi': {'tool': 'calibre', 'target': '.epub', 'quality': 'high'},
    '.azw3': {'tool': 'calibre', 'target': '.epub', 'quality': 'high'},
    '.azw':  {'tool': 'calibre', 'target': '.epub', 'quality': 'medium'},
    '.lit':  {'tool': 'calibre', 'target': '.epub', 'quality': 'medium'},
    '.rtf':  {'tool': 'calibre', 'target': '.epub', 'quality': 'medium'},
    '.lrf':  {'tool': 'calibre', 'target': '.epub', 'quality': 'medium'},
    '.pdb':  {'tool': 'calibre', 'target': '.epub', 'quality': 'medium'},
    '.tcr':  {'tool': 'calibre', 'target': '.epub', 'quality': 'medium'},

    # PDF 特殊处理（需要类型检测）
    '.pdf': {'tool': 'calibre', 'target': '.epub', 'quality': 'medium',
             'needs_detection': True, 'skip_scanned': True},

    # Pandoc 支持的格式
    '.docx': {'tool': 'pandoc', 'target': '.epub', 'quality': 'medium'},
    '.html': {'tool': 'pandoc', 'target': '.epub', 'quality': 'high'},
    '.htm':  {'tool': 'pandoc', 'target': '.epub', 'quality': 'high'},
    '.md':   {'tool': 'pandoc', 'target': '.epub', 'quality': 'high'},
    '.odt':  {'tool': 'pandoc', 'target': '.epub', 'quality': 'medium'},
    '.txt':  {'tool': 'custom', 'target': '.epub', 'quality': 'high'},

    # 原生 EPUB（不需要转换）
    '.epub': {'tool': None, 'target': '.epub', 'quality': 'native'},
}

# 不处理的格式（明确排除）
SKIP_FORMATS = {
    '.djvu', '.cbr', '.cbz',  # 漫画格式
    '.zip', '.rar', '.7z', '.tar', '.gz',  # 压缩包
    '.exe', '.msi',  # 可执行文件
    '.iso',  # 镜像文件
}

def safe_name(s):
    s = re.sub('[' + re.escape(chr(92)) + '/:*?"<>|' + chr(0) + '-' + chr(31) + ']', '_', s or '')
    s = re.sub(r'\s+', ' ', s).strip().rstrip('.')
    return s[:80] or '未命名'

def read_title(epub_path):
    try:
        z = zipfile.ZipFile(epub_path)
        ctr = ET.fromstring(z.read('META-INF/container.xml'))
        opfp = ctr.find('.//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile').get('full-path')
        opf = ET.fromstring(z.read(opfp))
        t = opf.findtext('.//{%s}title' % NS_DC)
        return (t or '').strip()
    except Exception:
        return ''

# 扫描时跳过的目录：流水线自身产物目录、本机工具项目目录、依赖/缓存目录
EXCLUDE_DIRS = {
    '_epub_调整', '_epub_自动调整', '_epub_工作区', '_拆分输出', '_converted',
    'pdf2epub-paddle',      # 本机 PDF→EPUB 工具项目（.venv/README 等，不是书）
    'node_modules', '__pycache__',
}

def find_books(root):
    """扫描所有支持的格式（不仅仅是 EPUB）"""
    SUPPORTED_EXTS = set(CONVERTERS.keys()) - SKIP_FORMATS
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith('.')]
        for f in filenames:
            ext = os.path.splitext(f)[1].lower()
            if ext in SUPPORTED_EXTS:
                out.append(os.path.join(dirpath, f))
    return sorted(out)

def dedupe(path):
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    i = 2
    while os.path.exists(f'{base}({i}){ext}'):
        i += 1
    return f'{base}({i}){ext}'

# ========== 格式检测与转换函数 ==========

def detect_pdf_type(pdf_path):
    """检测 PDF 是扫描版还是可编辑版"""
    try:
        # 尝试用 PyPDF2 检测文本层
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(pdf_path)
            page_count = len(reader.pages)
            
            # 提取前几页的文本
            text_samples = []
            for i, page in enumerate(reader.pages[:min(5, page_count)]):
                try:
                    text = page.extract_text()
                    if text:
                        text_samples.append(text)
                except:
                    pass
            
            combined_text = '\n'.join(text_samples)
            text_len = len(combined_text.strip())
            
            # 如果前5页提取的文本非常少，判定为扫描版
            if text_len < 200:
                return 'scanned', f'文本过少（{text_len}字符，{page_count}页）'
            
            # 计算平均每页文本量
            avg_text_per_page = text_len / min(5, page_count)
            if avg_text_per_page < 50:
                return 'scanned', f'平均每页文本仅{avg_text_per_page:.1f}字符'
            
            return 'editable', f'检测到可提取文本（{text_len}字符，{page_count}页）'
            
        except ImportError:
            # PyPDF2 不可用，尝试用 pdfminer
            try:
                import pdfminer.high_level as pdfminer
                text = pdfminer.extract_text(pdf_path)
                text_len = len(text.strip())
                
                if text_len < 500:
                    return 'scanned', f'文本过少（{text_len}字符）'
                
                return 'editable', f'检测到可提取文本（{text_len}字符）'
                
            except ImportError:
                return 'unknown', '缺少 PDF 检测库（pdfminer.six 或 PyPDF2）'
                
    except Exception as e:
        return 'unknown', f'检测失败: {e}'

def convert_to_epub(src_path, staging_dir, seq, no_convert=False):
    """统一格式转换入口"""
    if no_convert:
        return {'success': False, 'reason': '用户禁用格式转换（--no-convert）', 'skipped': True, 'skip_reason': 'disabled'}
    
    ext = os.path.splitext(src_path)[1].lower()
    
    if ext not in CONVERTERS:
        return {'success': False, 'reason': f'不支持的格式: {ext}'}
    
    cfg = CONVERTERS[ext]
    
    # 原生 EPUB 不需要转换
    if cfg['tool'] is None:
        return {'success': True, 'native': True, 'epub_path': src_path}
    
    base_name = safe_name(os.path.splitext(os.path.basename(src_path))[0])
    output_path = os.path.join(staging_dir, f's{seq:03d}_{base_name}_converted.epub')
    
    # PDF 特殊检测
    if cfg.get('needs_detection'):
        pdf_type, pdf_reason = detect_pdf_type(src_path)
        if pdf_type == 'scanned' and cfg.get('skip_scanned'):
            return {'success': False, 'reason': f'扫描版 PDF，跳过转换（{pdf_reason}）',
                    'skipped': True, 'skip_reason': 'scanned_pdf'}
        print(f'[检测] PDF 类型: {pdf_type} - {pdf_reason}', file=sys.stderr)
    
    # 根据工具选择转换方式
    try:
        if cfg['tool'] == 'calibre':
            result = convert_with_calibre(src_path, output_path, ext)
        elif cfg['tool'] == 'pandoc':
            result = convert_with_pandoc(src_path, output_path, ext)
        elif cfg['tool'] == 'custom':
            result = convert_custom(src_path, output_path, ext)
        else:
            return {'success': False, 'reason': f'未知转换工具: {cfg["tool"]}'}
            
        if result['success']:
            return {'success': True, 'epub_path': output_path, 'title': base_name,
                    'original_format': ext, 'conversion_tool': cfg['tool']}
        else:
            return result
            
    except Exception as e:
        return {'success': False, 'reason': f'转换异常: {e}'}

def convert_with_calibre(src, dst, src_ext):
    """使用 Calibre 转换"""
    try:
        cmd = ['ebook-convert', src, dst, '--output-profile', 'tablet']
        # 针对不同格式的优化参数
        if src_ext == '.pdf':
            cmd.extend(['--pdf-engine', 'mupdf', '--no-process'])
        elif src_ext in ('.rtf', '.lit', '.pdb'):
            cmd.extend(['--markup-chapter-headings'])
            
        result = subprocess.run(cmd, check=True, capture_output=True, text=True,
                               encoding='utf-8', errors='replace')
        return {'success': True}
    except subprocess.CalledProcessError as e:
        return {'success': False, 'reason': f'Calibre 转换失败: {e.stderr or e}'}
    except FileNotFoundError:
        return {'success': False, 'reason': '未找到 Calibre (ebook-convert)，请先安装'}

def convert_with_pandoc(src, dst, src_ext):
    """使用 Pandoc 转换"""
    try:
        cmd = ['pandoc', src, '-o', dst, '--split-level=2']  # Pandoc 3.x 使用 --split-level
        if src_ext in ('.html', '.htm'):
            cmd.extend(['--standalone'])
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        return {'success': True}
    except subprocess.CalledProcessError as e:
        return {'success': False, 'reason': f'Pandoc 转换失败: {e.stderr or e}'}
    except FileNotFoundError:
        return {'success': False, 'reason': '未找到 Pandoc，请先安装'}

def convert_custom(src, dst, src_ext):
    """自定义转换（如 TXT → EPUB）"""
    if src_ext == '.txt':
        return txt_to_epub(src, dst)
    return {'success': False, 'reason': f'暂不支持的自定义转换: {src_ext}'}

def txt_to_epub(src, dst):
    """TXT 转 EPUB（简单实现）"""
    try:
        from ebooklib import epub
        book = epub.EpubBook()
        
        # 设置元数据
        title = safe_name(os.path.splitext(os.path.basename(src))[0])
        book.set_title(title)
        book.set_language('zh')
        
        # 读取文本
        with open(src, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
        
        # 按段落分割（空行分隔）
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        # 如果没有段落，按行分割
        if not paragraphs:
            paragraphs = [line.strip() for line in text.split('\n') if line.strip()]
        
        # 创建章节
        chapters = []
        for i, para in enumerate(paragraphs):
            c = epub.EpubHtml(title=f'段落 {i+1}', file_name=f'chap_{i+1}.xhtml')
            c.content = f'<p>{para}</p>'
            book.add_item(c)
            chapters.append(c)
        
        # 设置目录
        book.toc = chapters
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())
        
        # 写入
        epub.write_epub(dst, book, {})
        return {'success': True}
    except ImportError:
        return {'success': False, 'reason': '未找到 ebooklib，请执行: pip install EbookLib'}
    except Exception as e:
        return {'success': False, 'reason': f'TXT 转换失败: {e}'}

# ========== 主流程 ==========

def main():
    import argparse
    ap = argparse.ArgumentParser(description='EPUB 全自动处理：格式转换→拆分→改名→繁简→修复')
    ap.add_argument('dir', nargs='?', default='', help='包含书籍的目录（递归扫描，支持 EPUB/MOBI/AZW3/PDF/DOCX/TXT 等）；省略时使用默认书库 N:/新建文件夹/书')
    ap.add_argument('--no-t2s', action='store_true', help='关闭繁体→简体')
    ap.add_argument('--no-typo', action='store_true', help='关闭错别字修正')
    ap.add_argument('--no-fix', action='store_true', help='关闭格式修复')
    ap.add_argument('--no-convert', action='store_true', help='关闭格式转换（跳过非 EPUB 文件）')
    ap.add_argument('--force-split', action='store_true', help='对分卷结构的书也强制按顶层目录拆分')
    ap.add_argument('--keep-staging', action='store_true', help='保留中间工作区（排障用）')
    ap.add_argument('--keep-source', action='store_true', help='保留原书（默认：产出成品的原书自动删除）')
    ap.add_argument('--keep-reports', action='store_true', help='保留报告与汇总（默认：全部成功时自动删除）')
    a = ap.parse_args()

    DEFAULT_DIR = os.path.join('N:/', '新建文件夹', '书')
    if a.dir:
        root = os.path.abspath(a.dir)
    elif os.path.isdir(DEFAULT_DIR):
        root = os.path.abspath(DEFAULT_DIR)
        print('[目录] 未指定路径，使用默认书库: ' + root, file=sys.stderr)
    else:
        root = os.path.abspath('.')
        print('[目录] 默认书库不存在且未指定路径，回退当前目录: ' + root, file=sys.stderr)
    if not os.path.isdir(root):
        print(json.dumps({'error': f'目录不存在: {root}'}, ensure_ascii=False))
        return 2
    out_root = os.path.join(root, '_epub_自动调整')
    staging = os.path.join(root, '_epub_工作区')
    report_dir = os.path.join(out_root, '_报告')
    if os.path.isdir(staging):
        shutil.rmtree(staging)
    os.makedirs(staging, exist_ok=True)
    os.makedirs(report_dir, exist_ok=True)

    sources = find_books(root)
    if not sources:
        print(json.dumps({'error': '目录里没有找到支持的书籍文件', 'dir': root, 'supported': list(CONVERTERS.keys())}, ensure_ascii=False))
        return 2

    # 统计信息
    stats = {
        'total': len(sources),
        'converted': 0,
        'native_epub': 0,
        'skipped': 0,
        'convert_failed': 0,
    }
    
    plan, seq = [], 0
    
    # ========== 阶段1: 格式转换（流程最前面） ==========
    print('\n[阶段1] 格式识别与转换...', file=sys.stderr)
    converted_files = {}  # 记录转换后的文件映射
    skipped_files = []    # 记录跳过的文件
    
    for src in sources:
        seq += 1
        ext = os.path.splitext(src)[1].lower()
        rel = os.path.relpath(src, root)
        
        # 原生 EPUB 直接进入下一阶段
        if ext == '.epub':
            converted_files[src] = src
            stats['native_epub'] += 1
            print(f'[跳过转换] {rel} - 原生 EPUB', file=sys.stderr)
            continue
        
        # 非原生 EPUB，尝试转换
        print(f'[转换] 检测到 {ext} 格式: {rel}', file=sys.stderr)
        conv = convert_to_epub(src, staging, seq, no_convert=a.no_convert)
        
        if not conv['success']:
            if conv.get('skipped'):
                # 被跳过的文件（扫描版PDF或用户禁用转换）
                stats['skipped'] += 1
                skipped_files.append({'source': rel, 'reason': conv.get('reason', ''), 'skip_reason': conv.get('skip_reason', '')})
                print(f'[跳过] {rel} - {conv["reason"]}', file=sys.stderr)
            else:
                # 转换失败
                stats['convert_failed'] += 1
                plan.append({'source': rel, 'type': '转换失败', 'staged': None,
                            'title': '', 'info': conv['reason']})
                print(f'[失败] {rel} - {conv["reason"]}', file=sys.stderr)
            continue
        
        # 转换成功，记录映射
        if conv.get('native'):
            converted_files[src] = src
        else:
            converted_files[src] = conv['epub_path']
            stats['converted'] += 1
            print(f'[成功] {ext} → EPUB: {os.path.basename(conv["epub_path"])}', file=sys.stderr)
    
    print(f'\n[阶段1完成] 总计: {stats["total"]} | 转换: {stats["converted"]} | 原生EPUB: {stats["native_epub"]} | 跳过: {stats["skipped"]} | 失败: {stats["convert_failed"]}\n', file=sys.stderr)
    
    # ========== 阶段2: 合辑拆分 ==========
    print('[阶段2] 合辑检测与拆分...', file=sys.stderr)
    processed_epubs = []
    for src, epub_path in converted_files.items():
        seq += 1
        rel = os.path.relpath(src, root)
        ext = os.path.splitext(src)[1].lower()
        
        # 如果是转换而来的文件，在info中标注
        source_info = f'{ext}'
        if ext != '.epub':
            source_info = f'{ext} → EPUB'
        
        try:
            r = epub_split.split_epub(epub_path, staging, force=a.force_split)
        except Exception as e:
            r = {'omnibus': False, 'reason': f'拆分引擎异常: {e}', 'books': []}
        if r.get('omnibus'):
            for bk in r['books']:
                seq += 1
                dst = os.path.join(staging, f's{seq:03d}_{os.path.basename(bk["file"])}')
                shutil.move(bk['file'], dst)
                plan.append({'source': rel, 'type': '合辑拆分', 'staged': dst,
                             'title': bk['title'], 'info': f"{source_info}，spine {bk['spine']}，{bk['chapters']} 章"})
            note = f"拆出 {len(r['books'])} 册"
        else:
            dst = dedupe(os.path.join(staging, f's{seq:03d}_{safe_name(os.path.splitext(os.path.basename(src))[0])}.epub'))
            if src != epub_path:
                # 转换来的文件：直接改名挪用，避免转换中间件与副本都被调整、产出重复成品
                shutil.move(epub_path, dst)
            else:
                # 原生 EPUB，复制原文件（原文件永不改动）
                shutil.copy2(src, dst)
            plan.append({'source': rel, 'type': '单本直通', 'staged': dst,
                         'title': '', 'info': f'{source_info}，{r.get("reason", "")}'})
            note = f'单本（未检测到合辑结构：{r.get("reason", "")}）'
        processed_epubs.append(dst)
        print(f'[拆分] {rel} → {note}', file=sys.stderr)

    # ========== 阶段3: 三合一调整 ==========
    print('\n[阶段3] 运行 epub-adjust 三合一（繁转简/错字/格式修复）...', file=sys.stderr)
    adj_flags = [sys.executable, '-X', 'utf8',
                 os.path.join(HERE, 'epub_adjust.py'), staging]
    if a.no_t2s:
        adj_flags.append('--no-t2s')
    if a.no_typo:
        adj_flags.append('--no-typo')
    if a.no_fix:
        adj_flags.append('--no-fix')
    adj = subprocess.run(adj_flags, capture_output=True, text=True, encoding='utf-8', errors='replace', env={**os.environ, 'EPUB_AUTO_CHILD': '1'})
    os.makedirs(report_dir, exist_ok=True)
    with open(os.path.join(report_dir, '_adjust_运行日志.txt'), 'w', encoding='utf-8') as _lf:
        _lf.write((adj.stdout or '') + chr(10) + (adj.stderr or ''))
    adj_rc = adj.returncode

    # ========== 阶段4: 成品归位与汇总 ==========
    adj_dir = os.path.join(staging, '_epub_调整')
    finals, failures, promoted_stems = [], [], set()
    if os.path.isdir(adj_dir):
        for f in sorted(os.listdir(adj_dir)):
            fp = os.path.join(adj_dir, f)
            if f.lower().endswith('.epub'):
                title = read_title(fp) or safe_name(re.sub(r'_adjusted$', '', os.path.splitext(f)[0]))
                final = dedupe(os.path.join(out_root, safe_name(title) + '.epub'))
                shutil.move(fp, final)
                finals.append({'file': final, 'title': title})
                promoted_stems.add(re.sub(r'_adjusted$', '', os.path.splitext(f)[0]))
            elif f.endswith('.md'):
                shutil.copy2(fp, os.path.join(report_dir, f))
    
    # staged 原件：已产出成品的直接清除；没有成品的（调整失败）移入 _未完成
    unfinished = []
    if os.path.isdir(staging):
        for f in sorted(os.listdir(staging)):
            if f.lower().endswith('.epub'):
                sp = os.path.join(staging, f)
                if os.path.splitext(f)[0] in promoted_stems:
                    os.remove(sp)
                else:
                    dst = dedupe(os.path.join(out_root, '_未完成', f))
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.move(sp, dst)
                    unfinished.append(dst)
        if not a.keep_staging:
            shutil.rmtree(staging, ignore_errors=True)
    for f in ('_汇总.md', '_failures.txt', '_typo_llm_候选.md'):
        fp = os.path.join(adj_dir, f)
        if os.path.isfile(fp):
            shutil.copy2(fp, os.path.join(report_dir, f))

    # ========== 阶段5: 收尾清理（默认：产出成品的原书自动删除；全部成功时报告/汇总一并清掉） ==========
    def _rm_file(p):
        try:
            os.remove(p)
            return True
        except PermissionError:
            try:
                os.chmod(p, 0o666)
                os.remove(p)
                return True
            except Exception:
                return False
        except Exception:
            return False

    staged_by_src = {}
    for p in plan:
        if p.get('staged'):
            staged_by_src.setdefault(p['source'], []).append(
                os.path.splitext(os.path.basename(p['staged']))[0])
    deleted_sources, kept_sources = [], []
    for src in sorted(staged_by_src):
        stems = staged_by_src[src]
        sp = os.path.join(root, src)
        if (not a.keep_source) and stems and all(s in promoted_stems for s in stems) \
                and os.path.isfile(sp) and _rm_file(sp):
            deleted_sources.append(src)
            print(f'[清理] 已删除原书: {src}', file=sys.stderr)
        else:
            kept_sources.append(src)

    all_done = (stats['convert_failed'] == 0 and len(unfinished) == 0
                and len(skipped_files) == 0 and not kept_sources)
    clean_reports = all_done and not a.keep_reports
    if clean_reports:
        shutil.rmtree(report_dir, ignore_errors=True)
        print('[清理] 全部成功：报告与汇总已删除，目录只留成品书。', file=sys.stderr)

    # ========== 汇总报告（包含格式转换信息） ==========
    lines = ['# EPUB 全自动处理汇总', '',
             f'- 输入目录：`{root}`',
             f'- 来源书籍：{stats["total"]} 本',
             f'  - 格式转换成功：{stats["converted"]} 本',
             f'  - 原生 EPUB：{stats["native_epub"]} 本',
             f'  - 跳过（扫描版PDF等）：{stats["skipped"]} 本',
             f'  - 转换失败：{stats["convert_failed"]} 本',
             f'- 成品（已拆分/改名/繁转简/修复）：{len(finals)} 本',
             f'- 未完成（调整阶段失败）：{len(unfinished)} 本',
             f'- 原书：自动删除 {len(deleted_sources)} 本，保留 {len(kept_sources)} 本', '',
             '| 来源 | 处理 | 成品 |', '|---|---|---|']

    by_src = {}
    for p in plan:
        by_src.setdefault(p['source'], []).append(p)
    for src, items in by_src.items():
        for it in items:
            lines.append(f"| {src} | {it['type']}（{it['info']}） | 见下方成品清单 |")

    lines += ['', '## 成品清单', '']
    for x in finals:
        lines.append(f"- `{os.path.basename(x['file'])}`（书名：{x['title']}）")

    if deleted_sources:
        lines += ['', '## 已自动删除的原书', '']
        for s in deleted_sources:
            lines.append(f'- `{s}`')

    if kept_sources:
        lines += ['', '## 保留的原书（未产出成品，或指定 --keep-source）', '']
        for s in kept_sources:
            lines.append(f'- `{s}`')

    if unfinished:
        lines += ['', '## 未完成（需人工或重跑）', '']
        for u in unfinished:
            lines.append(f'- `{os.path.relpath(u, root)}`')

    if skipped_files:
        lines += ['', '## 跳过的文件', '']
        for sk in skipped_files:
            lines.append(f'- `{sk["source"]}` - {sk["reason"]}')

    lines += ['', '单本调整详情见 `_报告/`（epub-adjust 逐本报告）。',
              '', '> 本报告仅供参考，仅处理用户有权处理的书籍文件。']

    if not clean_reports:
        with open(os.path.join(out_root, '_自动化汇总.md'), 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(lines) + '\n')

    print(json.dumps({'sources': stats['total'], 'converted': stats['converted'],
                      'native_epub': stats['native_epub'], 'skipped': stats['skipped'],
                      'convert_failed': stats['convert_failed'], 'finals': len(finals),
                      'unfinished': len(unfinished), 'out_root': out_root,
                      'deleted_sources': len(deleted_sources), 'kept_sources': len(kept_sources),
                      'reports_cleaned': bool(clean_reports),
                      'adjust_returncode': adj_rc}, ensure_ascii=False, indent=2))
    return 0

if __name__ == '__main__':
    sys.exit(main())
