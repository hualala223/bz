# -*- coding: utf-8 -*-
"""
epub_adjust.py — EPUB 完整调整（三合一：繁体转简体 + 格式修复 + 错别字修正）

整合思路：
  - 格式修复引擎复用 epub-fix 技能（scripts/epub_fix.py 的 Epub 类，纯标准库）；
  - 在引擎的 check_docs 之后、目录分析之前注入两个"内容变换器"：
      1) 繁体 → 简体（opencc t2s + 「著→着」语境后处理 + lang 声明改写）
      2) 错别字修正（保守规则表自动修 + 可选 LLM 辅助扫描/应用）
  - 调目录对齐与重打包逻辑都在简体、改正后的文本上运行，保证 TOC 一致。

用法:
    python -X utf8 epub_adjust.py <目录>                     # 三合一（默认全开）
    python -X utf8 epub_adjust.py <目录> --no-t2s            # 不转简体
    python -X utf8 epub_adjust.py <目录> --no-typo           # 不错别字修正（仅规则表/LLM 均关）
    python -X utf8 epub_adjust.py <目录> --typo-llm          # 加 LLM 错别字扫描（需 OPENCODE_API_KEY）
    python -X utf8 epub_adjust.py <目录> --apply-llm         # 应用 LLM 高置信修正（谨慎）
    python -X utf8 epub_adjust.py <目录> --no-fix            # 只做文本调整，不做格式修复
    python -X utf8 epub_adjust.py <目录> --skip-ok           # 跳过上次全 OK 且文件未变的书
    python -X utf8 epub_adjust.py <某.epub>                  # 单本

依赖:
    - epub-fix 技能（自动在同级 skills 目录/环境变量定位，找不到会提示）
    - opencc（python -m pip install opencc-python-reimplemented）
    - 可选：OPENCODE_API_KEY（LLM 错别字扫描）

产物（相对输入目录）:
    _epub_调整/<书名>.md              单本调整报告
    _epub_调整/<书名>_adjusted.epub   调整件（原文件从不改动）
    _epub_调整/_汇总.md / _failures.txt / _state.json
    _epub_调整/_typo_llm_候选.md      LLM 疑似错别字候选清单（--typo-llm 时）
    _epub_调整/_llm_cache.json        LLM 结果缓存（断点续跑）
"""
import argparse
import glob
import json
import os
import re
import sys
import time

# ---------- 1) 定位并加载 epub-fix 引擎 ----------

def _engine_candidates():
    here = os.path.dirname(os.path.abspath(__file__))
    cands = [os.path.join(here, 'epub_fix.py')]
    skills_root = os.path.normpath(os.path.join(here, '..', '..'))
    cands += [
        os.path.join(skills_root, 'epub-fix', 'scripts', 'epub_fix.py'),
        os.path.join(os.path.expanduser('~'), '.dsh', 'skills', 'epub-fix', 'scripts', 'epub_fix.py'),
    ]
    if os.environ.get('EPUB_FIX_SCRIPT'):
        cands.insert(0, os.environ['EPUB_FIX_SCRIPT'])
    return cands


def load_engine():
    import importlib.util
    for p in _engine_candidates():
        if os.path.isfile(p):
            spec = importlib.util.spec_from_file_location('epub_fix', p)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
    raise RuntimeError(
        '找不到 epub-fix 引擎脚本（scripts/epub_fix.py）。'
        '请确认 epub-fix 技能已安装，或用环境变量 EPUB_FIX_SCRIPT 指定其绝对路径。')


EPUB_FIX = load_engine()

# ---------- 2) 繁转简 transformer（opencc + 著→着语境处理） ----------

try:
    from opencc import OpenCC
    _CC = OpenCC('t2s')
except Exception:  # noqa: BLE001
    _CC = None

# 「著」助词→「着」，保留 zhù 读音固定词（与 pdf-to-epub/t2s_epub.py 同规则）
ZHE_KEEP_NEXT = set('书名作录墨述者称想急落手力衣装身地意重实')
ZHE_PRE_KEEP = set('土编著合遗译撰名论巨专原显执凡手文')
CONTENT_ATTRS = {
    'title', 'alt', 'summary', 'label', 'placeholder', 'content',
    'aria-label', 'epub:title',
}
SCRIPT_STYLE_RE = re.compile(r'(<(?:script|style)\b[^>]*>)(.*?)(</(?:script|style)>)', re.I | re.S)
ATTR_RE = re.compile(r"""([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')""")
LANG_HANT_RE = re.compile(
    r"(\s)(xml:lang|lang)\s*=\s*[\"'](?:zh-Hant(?:-TW|-HK)?|zh-TW|zh-HK)[\"']", re.I)
META_LANG_RE = re.compile(
    r"(<dc:language>)(?:zh-Hant(?:-TW|-HK)?|zh-TW|zh-HK)(</dc:language>)", re.I)


def _convert_zhe(s):
    """把助词「著」转「着」，保留 zhù 固定词。"""
    if '著' not in s:
        return s
    chars = list(s)
    out = list(chars)
    n = len(chars)
    for i in range(n):
        if chars[i] != '著':
            continue
        prev = chars[i - 1] if i > 0 else ''
        nxt = chars[i + 1] if i + 1 < n else ''
        if prev and prev in ZHE_PRE_KEEP:
            continue
        if nxt and nxt in ZHE_KEEP_NEXT:
            continue
        out[i] = '着'
    return ''.join(out)


def _convert_text_content(text):
    """正文文本层的繁转简：lang 声明、script/style 内容、白名单属性、著→着。"""
    text = LANG_HANT_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}=\"zh-Hans\"", text)
    text = META_LANG_RE.sub(r"\1zh-Hans\2", text)

    def ss(m):
        open_tag, inner, close_tag = m.groups()
        if open_tag.lower().startswith('<style'):
            inner = re.sub(r'/\*(.*?)\*/',
                           lambda mm: '/*' + _convert_zhe(_CC.convert(mm.group(1))) + '*/',
                           inner, flags=re.S)
        return open_tag + inner + close_tag

    text = SCRIPT_STYLE_RE.sub(ss, text)

    def conv_tag(tag):
        def rep(am):
            name, val = am.group(1), am.group(2)
            if name.lower() not in CONTENT_ATTRS:
                return am.group(0)
            quote = val[0]
            return f"{name}={quote}{_convert_zhe(_CC.convert(val[1:-1]))}{quote}"
        return ATTR_RE.sub(rep, tag)

    parts = re.split(r'(<[^>]*>)', text)
    out = []
    for p in parts:
        if p.startswith('<'):
            out.append(conv_tag(p))
        else:
            out.append(_convert_zhe(_CC.convert(p)))
    return ''.join(out)


def make_t2s_transformer(opts):
    """返回 transformer(book, docs)：繁转简。全书繁体占比超过阈值才真正转换。"""
    if _CC is None:
        raise RuntimeError('缺少 opencc 库：python -m pip install opencc-python-reimplemented')

    def transformer(book, docs):
        exts = ('.xhtml', '.html', '.htm', '.xml', '.opf', '.ncx', '.svg', '.txt')
        # 预检：统计全书汉字与转换后变化
        han_before = han_diff = 0
        for name in list(docs):
            if not name.lower().endswith(exts):
                continue
            src = docs[name]
            han_before += len(re.findall(r'[\u4e00-\u9fff]', src))
        if han_before == 0:
            book.report('I', '繁转简', '未检测到汉字文本，跳过')
            return
        # 抽样前 10 个文本条目估算变化率，避免对超大全量转换两遍；
        # 占比以抽样文本自身为分母，防止已简化的扉页/前言稀释全书占比造成误跳过
        sampled = han_sampled = 0
        for name in list(docs):
            if not name.lower().endswith(exts) or sampled >= 10:
                continue
            src = docs[name]
            hans = re.findall(r'[\u4e00-\u9fff]', src)
            han_sampled += len(hans)
            han_diff += sum(1 for ch in hans if _CC.convert(ch) != ch)
            sampled += 1
        if han_sampled == 0 or han_diff / max(han_sampled, 1) < 0.005:
            book.report('I', '繁转简', '文本基本已是简体（抽样变化率 %.2f%%），跳过转换' % (100 * han_diff / max(han_sampled, 1)))
            return
        # 真正转换
        changed_files = 0
        for name in list(docs):
            if not name.lower().endswith(exts):
                continue
            new = _convert_text_content(docs[name])
            if new != docs[name]:
                docs[name] = new
                changed_files += 1
                book.fixlog(name, '繁体转简体', 'opencc t2s + 著→着')
        # .css 注释（不在 docs 中，直接改 entries）
        for name in list(book.entries):
            if not name.lower().endswith('.css'):
                continue
            try:
                css = book.entries[name].decode('utf-8')
            except Exception:  # noqa: BLE001
                continue
            new = re.sub(r'/\*(.*?)\*/', lambda m: '/*' + _convert_zhe(_CC.convert(m.group(1))) + '*/',
                         css, flags=re.S)
            if new != css:
                book.entries[name] = new.encode('utf-8')
                changed_files += 1
                book.fixlog(name, '繁体转简体', 'CSS 注释')
        book.report('I', '繁转简', '已转简体：%d 个文件' % changed_files)

    return transformer


# ---------- 3) 错别字 transformer（保守规则表 + 可选 LLM） ----------

def _load_typo_rules(opts):
    """加载规则表：auto（≥3字确定短语，自动修）与 suggest（双字高概率，仅报告）。"""
    here = os.path.dirname(os.path.abspath(__file__))
    path = opts.typo_rules or os.path.join(here, 'typo_rules.json')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    return data.get('auto', {}), data.get('suggest', {})


def _apply_auto_rules(book, docs, auto):
    for name in list(docs):
        if not name.lower().endswith(('.xhtml', '.html', '.htm')):
            continue
        src = docs[name]
        changed = False
        for bad, good in auto.items():
            cnt = src.count(bad)
            if cnt:
                src = src.replace(bad, good)
                changed = True
                book.fixlog(name, '错别字修正', '%s → %s（%d 处）' % (bad, good, cnt))
                book.report_capped('错别字', '%s：%s → %s（%d 处）' % (name, bad, good, cnt), cap=20)
        if changed:
            docs[name] = src


def _scan_suggest_rules(book, docs, suggest):
    for name in list(docs):
        if not name.lower().endswith(('.xhtml', '.html', '.htm')):
            continue
        src = docs[name]
        for bad, good in suggest.items():
            cnt = src.count(bad)
            if cnt:
                book.report_capped('错别字(疑似)', '%s：%s 出现 %d 次，可能应作 %s（未自动改）' % (name, bad, cnt, good), cap=20)


def _llm_chunk_text(src):
    """抽取 XHTML 正文纯文本（去标签、压缩空白），供 LLM 扫描。"""
    body = re.sub(r'<(script|style)\b.*?</\1>', '', src, flags=re.I | re.S)
    body = re.sub(r'<[^>]+>', '', body)
    body = re.sub(r'\s+', ' ', body).strip()
    return body


def make_typo_transformer(opts):
    auto, suggest = _load_typo_rules(opts)
    llm_cache = {}

    def transformer(book, docs):
        _apply_auto_rules(book, docs, auto)
        _scan_suggest_rules(book, docs, suggest)
        if opts.typo_llm or opts.apply_llm:
            _llm_pass(book, docs, opts, llm_cache, auto)

    return transformer


def _llm_pass(book, docs, opts, llm_cache, auto):
    """LLM 分块扫描正文找疑似错别字；默认写入候选清单，--apply-llm 时应用高置信候选。"""
    key = os.environ.get('OPENCODE_API_KEY', '')
    if not key:
        book.report('I', '错别字(LLM)', '未设置 OPENCODE_API_KEY，跳过 LLM 扫描')
        return
    try:
        import subprocess
        import tempfile
    except Exception as e:  # noqa: BLE001
        book.report('I', '错别字(LLM)', 'LLM 模块加载失败：%s' % e)
        return

    cache_path = os.path.join(os.path.dirname(book.path), '_epub_调整', '_llm_cache.json')
    st = os.stat(book.path)
    fp = '%s-%s-%s' % (book.name, st.st_size, int(st.st_mtime))
    cache = {}
    if os.path.exists(cache_path):
        try:
            cache = json.load(open(cache_path, encoding='utf-8'))
        except Exception:  # noqa: BLE001
            cache = {}

    prompt_head = (
        '你是中文图书校对专家。找出下面文本中的错别字（形近/音近误字、成语或固定搭配写错）。'
        '要求：1.只列确定性错误，专有名词、方言、网络用语不算；'
        '2.输出 JSON 数组，每项 {"原词": "错误写法", "建议": "正确写法", "理由": "简短", "置信度": 0-1};'
        '3.只输出数组本身，不要任何解释或引号包裹。'
    )
    API_URL = os.environ.get('OPENCODE_API_URL', 'https://opencode.ai/zen/go/v1/chat/completions')
    model = os.environ.get('OC_MODEL', 'deepseek-v4-flash')

    candidates = []
    all_changed = False
    for name in list(docs):
        if not name.lower().endswith(('.xhtml', '.html', '.htm')):
            continue
        text = _llm_chunk_text(docs[name])
        if len(text) < 50:
            continue
        ckey = '%s::%s' % (fp, name)
        if ckey in cache:
            cands = cache[ckey]
        else:
            cands = _llm_query(key, API_URL, model, prompt_head, text)
            cache[ckey] = cands
            time.sleep(0.4)
        for c in cands:
            if not isinstance(c, dict):
                continue
            bad = str(c.get('原词') or '').strip()
            good = str(c.get('建议') or '').strip()
            conf = float(c.get('置信度', 0) or 0)
            if not bad or not good or bad == good or len(bad) > 12:
                continue
            candidates.append((name, bad, good, str(c.get('理由', ''))[:40], conf))
            if opts.apply_llm and conf >= 0.9 and bad in docs[name] and good not in auto.values():
                docs[name] = docs[name].replace(bad, good)
                book.fixlog(name, '错别字修正(LLM)', '%s → %s' % (bad, good))
                all_changed = True

    # 缓存落盘
    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        json.dump(cache, open(cache_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    except Exception:  # noqa: BLE001
        pass
    book.typo_llm_candidates = candidates
    book.report('I', '错别字(LLM)', '扫描完成：%d 个候选（--apply-llm 已应用 %s）' % (
        len(candidates), '是，并附加规则表白名单去重' if all_changed else '否'))


def _llm_query(key, api_url, model, prompt_head, text):
    import json
    import subprocess
    import tempfile
    body = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': prompt_head},
            {'role': 'user', 'content': text[:12000]},
        ],
        'max_tokens': 2000,
        'temperature': 0.1,
    }
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(body, f, ensure_ascii=False)
        bodyfile = f.name
    try:
        cmd = ['curl.exe', '-sS', '-X', 'POST', api_url,
               '-H', 'Authorization: Bearer ' + key,
               '-H', 'Content-Type: application/json',
               '--data-binary', '@' + bodyfile, '--max-time', '40']
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8',
                              errors='replace', timeout=75)
        if proc.returncode != 0:
            return []
        data = json.loads(proc.stdout)
        content = data['choices'][0]['message']['content']
        m = re.search(r'\[[\s\S]*\]', content)
        if not m:
            return []
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        return []
    finally:
        try:
            os.unlink(bodyfile)
        except Exception:  # noqa: BLE001
            pass


# ---------- 4) 主流程 ----------

def _skip_list(p):
    b = os.path.basename(p)
    return (b.endswith('_adjusted.epub') or b.endswith('_fixed.epub')
            or '_epub_自动调整' in p.replace('\\', '/')
            or '_epub_修复' in p.replace('\\', '/')
            or '_epub_原始备份' in p.replace('\\', '/'))


def _write_report(book, out_dir):
    L = ['# 调整报告：%s\n' % book.name,
         '- 判定：**%s**' % getattr(book, 'verdict', '?'),
         '- 文件：`%s`（%d 个条目）' % (book.path, len(book.entries))]
    if book.meta:
        L.append('- 元数据：%s' % '；'.join('%s=%s' % kv for kv in sorted(book.meta.items())))
    L.append('')
    # 文本调整小节
    t2s_fixes = [f for f in book.fixes if f[1] in ('繁体转简体',)]
    typo_fixes = [f for f in book.fixes if f[1] in ('错别字修正', '错别字修正(LLM)')]
    L.append('## 文本调整\n')
    if t2s_fixes:
        L.append('繁转简：%d 个文件\n' % len(t2s_fixes))
    if typo_fixes:
        L.append('错别字修正：%d 处\n' % len(typo_fixes))
    if not t2s_fixes and not typo_fixes:
        L.append('无文本调整（已是简体且无明显错别字/LLM 未启用）。\n')
    L.append('')
    if book.issues:
        L += ['## 体检结果\n', '| 级别 | 类别 | 说明 |', '|------|------|------|']
        for sev, cat, msg in book.issues:
            L.append('| %s | %s | %s |' % (sev, cat, msg))
        L.append('')
    if book.fixes:
        L += ['## 调整动作\n', '| 文件 | 动作 | 说明 |', '|------|------|------|']
        for f, a, d in book.fixes:
            L.append('| %s | %s | %s |' % (f, a, d))
        L.append('')
    llm_c = getattr(book, 'typo_llm_candidates', None)
    if llm_c:
        L += ['## LLM 疑似错别字候选（未自动应用，需人工核对）\n',
              '| 文件 | 原文 | 建议 | 理由 | 置信度 |', '|------|------|------|------|------|']
        for name, bad, good, why, conf in llm_c:
            L.append('| %s | %s | %s | %s | %.2f |' % (name, bad, good, why, conf))
        L.append('')
    if not book.issues and not book.fixes:
        L.append('未发现问题。\n')
    if getattr(book, 'fixed_path', ''):
        L.append('## 产物\n\n- 调整件：`%s`（原文件未改动，确认无误后自行替换）\n' % book.fixed_path)
    L.append('\n---\n*由 epub_adjust.py 生成（引擎 epub-fix；保守规则：拿不准的只报告不修改）*\n')
    safe = re.sub(r'[\\/:*?"<>|]', '_', book.name[:-5])
    with open(os.path.join(out_dir, safe + '.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))


def run(book, opts, transformers):
    """单本流程：注入变换器 → 走 epub-fix.process() → 写报告，产物改名/搬移。"""
    book.transformers = transformers
    report_only = opts.no_fix
    verdict = book.process(report_only)
    out_dir = os.path.join(os.path.dirname(book.path), '_epub_调整')
    os.makedirs(out_dir, exist_ok=True)
    # 移动产物到 _epub_调整/ 并改名 _adjusted.epub
    if book.fixed_path and os.path.exists(book.fixed_path):
        new_fixed = os.path.join(out_dir, book.name[:-5] + '_adjusted.epub')
        os.replace(book.fixed_path, new_fixed)
        book.fixed_path = new_fixed
        # 清理引擎重打包时留下的 _epub_修复 目录（无残留文件）
        engine_dir = os.path.join(os.path.dirname(book.path), '_epub_修复')
        try:
            if os.path.isdir(engine_dir) and not os.listdir(engine_dir):
                os.rmdir(engine_dir)
        except Exception:  # noqa: BLE001
            pass
    _write_report(book, out_dir)
    return verdict


def run_folder(folder, opts):
    epubs = sorted(set(
        glob.glob(os.path.join(folder, '**', '*.epub'), recursive=True) +
        glob.glob(os.path.join(folder, '**', '*.EPUB'), recursive=True)))
    epubs = [p for p in epubs if not _skip_list(p)]
    out_dir = os.path.join(folder, '_epub_调整')
    os.makedirs(out_dir, exist_ok=True)
    state_path = os.path.join(out_dir, '_state.json')
    try:
        state = json.load(open(state_path, encoding='utf-8')) if os.path.exists(state_path) else {}
    except Exception:  # noqa: BLE001
        state = {}
    transformers = []
    if not opts.no_t2s:
        transformers.append(make_t2s_transformer(opts))
    if not opts.no_typo:
        transformers.append(make_typo_transformer(opts))
    summary, new_state, fails = [], {}, []
    for ep in epubs:
        try:
            st = os.stat(ep)
        except Exception:  # noqa: BLE001
            continue
        fp = [st.st_size, int(st.st_mtime)]
        if opts.skip_ok and state.get(ep, {}).get('fp') == fp and state[ep].get('v') == 'OK':
            summary.append((os.path.basename(ep), 'OK(跳过)', ''))
            new_state[ep] = state[ep]
            continue
        try:
            book = EPUB_FIX.Epub(ep)
            verdict = run(book, opts, transformers)
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            summary.append((os.path.basename(ep), '异常', str(e)[:100]))
            fails.append((os.path.basename(ep), '异常', str(e)[:100]))
            continue
        nf = len([1 for i in book.issues if i[0] == 'F'])
        nw = len([1 for i in book.issues if i[0] == 'W'])
        ni = len([1 for i in book.issues if i[0] == 'I'])
        fixed = getattr(book, 'fixed_path', '')
        detail = 'F%d/W%d/I%d%s' % (nf, nw, ni, ('  →' + os.path.basename(fixed)) if fixed else '')
        summary.append((os.path.basename(ep), verdict, detail))
        if verdict in ('需人工', '无法处理', '异常'):
            fails.append((os.path.basename(ep), verdict, detail))
        new_state[ep] = {'fp': fp, 'v': verdict, 'f': nf, 'w': nw, 'i': ni}
    json.dump(new_state, open(state_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    byv = {}
    for _, v, _ in summary:
        byv[v] = byv.get(v, 0) + 1
    with open(os.path.join(out_dir, '_汇总.md'), 'w', encoding='utf-8') as f:
        f.write('# EPUB 调整汇总\n\n%s：共 %d 本（%s）\n\n'
                % (folder, len(summary), '；'.join('%s %d' % kv for kv in byv.items())))
        for name, v, d in summary:
            f.write('- `%s`  [%s]  %s\n' % (name, v, d))
    with open(os.path.join(out_dir, '_failures.txt'), 'w', encoding='utf-8') as f:
        for t in fails:
            f.write(' | '.join(str(x) for x in t) + '\n')
    try:  # 控制台可能是 GBK，中文用 sys.stdout.reconfigure 防 UnicodeEncodeError
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:  # noqa: BLE001
        pass
    for name, v, d in summary:
        print('%-44s [%s] %s' % (name[:44], v, d))
    print('\n完成：%d 本。报告与调整件见 %s' % (len(summary), out_dir))
    # LLM 候选汇总
    all_cands = []
    for ep in epubs:
        rep = os.path.join(out_dir, re.sub(r'[\\/:*?"<>|]', '_', os.path.basename(ep)[:-5]) + '.md')
        if not os.path.exists(rep):
            continue
        with open(rep, encoding='utf-8') as f:
            if 'LLM 疑似错别字候选' in f.read():
                all_cands.append(os.path.basename(ep))
    if all_cands:
        with open(os.path.join(out_dir, '_typo_llm_候选.md'), 'w', encoding='utf-8') as f:
            f.write('# LLM 疑似错别字候选汇总\n\n以下书籍的 LLM 扫描有疑似错别字候选，详见各书报告：\n\n')
            for n in all_cands:
                f.write('- %s\n' % n)
    return 1 if fails else 0


def main():
    # ── epub-auto 委托层：直接调用本脚本 = 默认执行全自动四步流水线（拆分→改名→转简→修复）──
    # 旧三合一仅在 --legacy 显式指定、或被 epub_auto.py 内部调用（EPUB_AUTO_CHILD=1）时执行
    import subprocess as _sp
    here = os.path.dirname(os.path.abspath(__file__))
    auto_script = os.path.normpath(os.path.join(here, '..', '..', 'epub-auto', 'scripts', 'epub_auto.py'))
    legacy_mode = ('--legacy' in sys.argv) or os.environ.get('EPUB_AUTO_CHILD') == '1'
    if not legacy_mode and os.path.isfile(auto_script):
        pos = [x for x in sys.argv[1:] if not x.startswith('-')]
        if pos and os.path.isdir(pos[0]):
            fwd = [sys.executable, '-X', 'utf8', auto_script, pos[0]]
            for _f in ('--no-t2s', '--no-typo', '--no-fix'):
                if _f in sys.argv:
                    fwd.append(_f)
            print('【epub-adjust → epub-auto】默认执行全自动四步流水线：合辑拆分 → 改名 → 繁转简 → 格式修复。'
                  '若只要旧三合一（不拆分不改名），加 --legacy 重跑。')
            sys.exit(_sp.call(fwd))
        if pos and os.path.isfile(pos[0]):
            print('提示：传入单个 EPUB 按旧三合一执行；要全自动四步（拆分/改名）请传入目录。')
    ap = argparse.ArgumentParser(description='EPUB 完整调整：繁转简 + 格式修复 + 错别字修正')
    ap.add_argument('path')
    ap.add_argument('--no-t2s', action='store_true', help='关闭繁体→简体')
    ap.add_argument('--no-typo', action='store_true', help='关闭错别字修正（规则表与 LLM）')
    ap.add_argument('--typo-llm', action='store_true', help='启用 LLM 错别字扫描（报告候选，需 OPENCODE_API_KEY）')
    ap.add_argument('--apply-llm', action='store_true', help='应用 LLM 置信度≥0.9 的修正（谨慎）')
    ap.add_argument('--no-fix', action='store_true', help='只做文本调整，不做格式修复')
    ap.add_argument('--skip-ok', action='store_true', help='跳过上次判定 OK 且文件未变化的书')
    ap.add_argument('--typo-rules', default='', help='自定义错别字规则表 JSON 路径')
    ap.add_argument('--legacy', action='store_true', help='只跑旧三合一（不拆分合辑、不改名）')
    a = ap.parse_args()
    module = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, module)  # 供引擎内部相对查找
    if os.path.isdir(a.path):
        sys.exit(run_folder(a.path, a))
    if os.path.isfile(a.path) and a.path.lower().endswith('.epub'):
        out = os.path.join(os.path.dirname(a.path), '_epub_调整')
        os.makedirs(out, exist_ok=True)
        transformers = []
        try:
            if not a.no_t2s:
                transformers.append(make_t2s_transformer(a))
            if not a.no_typo:
                transformers.append(make_typo_transformer(a))
            book = EPUB_FIX.Epub(a.path)
            v = run(book, a, transformers)
            # 单本 LLM 候选落盘
            cands = getattr(book, 'typo_llm_candidates', None)
            if cands:
                with open(os.path.join(out, '_typo_llm_候选.md'), 'w', encoding='utf-8') as f:
                    f.write('# LLM 疑似错别字候选（未自动应用，需人工核对）\n\n')
                    for name, bad, good, why, conf in cands:
                        f.write('- `%s`：%s → %s（%s，置信度 %.2f）\n' % (name, bad, good, why, conf))
        except Exception as e:  # noqa: BLE001
            print('异常：%s' % e)
            sys.exit(1)
        print('[%s] %s' % (v, os.path.basename(a.path)))
        return
    print('路径不存在或不是 EPUB: %s' % a.path)
    sys.exit(2)


if __name__ == '__main__':
    main()