# -*- coding: utf-8 -*-
"""
epub_fix.py — 批量 EPUB 体检 + 修复（纯标准库，无第三方依赖）

用法:
    python -X utf8 epub_fix.py <目录>              # 扫描目录下所有 *.epub(递归)，体检并修复
    python -X utf8 epub_fix.py <目录> --no-fix     # 只体检出报告，不写修复产物
    python -X utf8 epub_fix.py <目录> --skip-ok    # 跳过"上次判定 OK 且文件未变"的书
    python -X utf8 epub_fix.py <某.epub>           # 单本处理

产物（写入 <目录>/_epub_修复/）:
    <书名>.md           单本体检报告
    <书名>_fixed.epub   修复后的 EPUB（原文件从不改动）
    _汇总.md / _failures.txt   批量汇总
    _state.json         每本 (大小, mtime) 指纹，用于 --skip-ok

安全原则: 永不改写原文件；修复动作全部保守、可解释；拿不准的只报告不修改。
"""
import argparse
import glob
import html
import json
import os
import re
import sys
import zipfile
import urllib.parse
from xml.etree import ElementTree as ET
from difflib import SequenceMatcher

OPF_NS = 'http://www.idpf.org/2007/opf'
NCX_NS = 'http://www.daisy.org/z3986/2005/ncx/'
CONTAINER_NS = 'urn:oasis:names:tc:opendocument:xmlns:container'

MIMETYPE = 'application/epub+zip'

# XML 不合法但 HTML 常用的实体 → 数字实体（修复 &nbsp; 之类报错）
HTML_ENTITIES = {
    'nbsp': '160', 'copy': '169', 'reg': '174', 'trade': '8482', 'hellip': '8230',
    'mdash': '8212', 'ndash': '8211', 'laquo': '171', 'raquo': '187',
    'lsquo': '8216', 'rsquo': '8217', 'ldquo': '8220', 'rdquo': '8221',
    'middot': '183', 'times': '215', 'divide': '247', 'deg': '176',
    'plusmn': '177', 'sup2': '178', 'sup3': '179', 'frac12': '189',
    'frac14': '188', 'frac34': '190', 'sect': '167', 'para': '182',
    'bull': '8226', 'euro': '8364', 'pound': '163', 'yen': '165',
    'cent': '162', 'curren': '164', 'dagger': '8224', 'Dagger': '8225',
    'permil': '8240', 'prime': '8242', 'Prime': '8243', 'infin': '8734',
    'radic': '8730', 'ne': '8800', 'le': '8804', 'ge': '8805',
    'minus': '8722', 'lowast': '8727', 'sim': '8764', 'asymp': '8776',
    'larr': '8592', 'uarr': '8593', 'rarr': '8594', 'darr': '8595',
    'harr': '8596', 'lceil': '8968', 'rceil': '8969', 'lfloor': '8970',
    'rfloor': '8971', 'loz': '9674', 'spades': '9824', 'clubs': '9827',
    'hearts': '9829', 'diams': '9830',
}
ENTITY_RE = re.compile(r'&([a-zA-Z][a-zA-Z0-9]+);')
BARE_AMP_RE = re.compile(r'&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]+;)')
TAG_RE = re.compile(r'<[^>]+>')
H_RE = re.compile(r'<h([1-6])([^>]*)>(.*?)</h\1>', re.S | re.I)
ID_IN_TAG_RE = re.compile(r'\bid=["\']([^"\']+)["\']', re.I)
A_HREF_RE = re.compile(r'<a[^>]+href=["\']([^"\']+?)(?:"|\')[^>]*>(.*?)</a>', re.S | re.I)
NAV_TOC_BLOCK_RE = re.compile(r'<nav[^>]*epub:type=["\']toc["\'][^>]*>(.*?)</nav>', re.S | re.I)
LINK_RE = re.compile(r'(href|src)=["\']([^"\']+)["\']')

CJK_CH = '一二三四五六七八九十百千万零〇'
CHAPTER_PREFIX_RE = re.compile(
    r'^(第[0-9%s]+[章回节卷部篇集册輯][ 　]*|chapter\s*[0-9ivxlcdm]+[ :.\-]*'
    % CJK_CH + r'|\d+[.:、．]\s*|part\s*\d+[:\s.-]*)', re.I)

FULL2HALF = str.maketrans({
    '\u3000': ' ', '\u00a0': ' ', '．': '.', '：': ':', '，': ',', '。': '.',
    '、': ',', '；': ';', '！': '!', '？': '?', '（': '(', '）': ')',
    '《': '<', '》': '>', '「': '[', '」': ']', '『': '[', '』': ']',
    '‘': '"', '’': '"', '“': '"', '”': '"', '·': '-', '―': '-', '—': '-',
    '–': '-', '…': '...', '⋯': '...',
})
PUNCT_RE = re.compile(r'[.,:;!?"\'()\[\]{}<>~\-_+=|/*\\%^&@#$]')


def norm_text(s):
    s = html.unescape(s or '').lower()
    s = s.translate(FULL2HALF)
    s = re.sub(r'\s+', '', s)
    s = CHAPTER_PREFIX_RE.sub('', s)
    s = PUNCT_RE.sub('', s)
    s = s.replace('〇', '零')
    return s


def sim(a, b):
    a, b = norm_text(a), norm_text(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.92
    return SequenceMatcher(None, a, b).ratio()


def extract_headings(src):
    """返回 [(level, id_or_None, text)]；过滤超长(整页被包进 h)标题。"""
    out = []
    for m in H_RE.finditer(src or ''):
        lvl = int(m.group(1))
        tid = ID_IN_TAG_RE.search(m.group(2) or '')
        text = TAG_RE.sub('', m.group(3))
        text = html.unescape(re.sub(r'\s+', ' ', text).strip())
        if not text or len(text) > 200:
            continue
        out.append((lvl, tid.group(1) if tid else None, text))
    return out


def all_ids(src):
    return set(m.group(1) for m in ID_IN_TAG_RE.finditer(src or ''))


def fix_html_entities(src):
    def rep(m):
        code = HTML_ENTITIES.get(m.group(1))
        return '&#%s;' % code if code else m.group(0)
    return ENTITY_RE.sub(rep, src)


class Epub:
    def __init__(self, path):
        self.path = path
        self.name = os.path.basename(path)
        self.issues = []      # (severity F/W/I, category, msg)
        self.fixes = []       # (file, action, detail)
        self.entries = {}     # zip name -> bytes
        self._lower_map = {}
        self.meta = {}
        self.opf_name = None
        self.opf_dir = ''
        self.manifest = {}
        self.spine = []
        self.nav_name = None
        self.ncx_name = None
        self.nav_name_orig = None
        self.ncx_name_orig = None
        self.spine_heads = {}
        self.toc_final = []
        self.verdict = '?'
        self.fixed_path = ''
        self._cat_counts = {}
        # 内容变换钩子（epub-adjust 等上游技能注入）：transformers = [callable(book, docs)]
        # 在 check_docs 之后、目录分析之前依次执行；默认空列表，行为完全不变。
        self.transformers = []

    def report(self, sev, cat, msg):
        self.issues.append((sev, cat, msg))

    def report_capped(self, cat, msg, cap=10, sev='I'):
        """同类 I 级信息封顶，超出只计数，末尾汇总。"""
        self._cat_counts[cat] = self._cat_counts.get(cat, 0) + 1
        if self._cat_counts[cat] <= cap:
            self.issues.append((sev, cat, msg))

    def finish_caps(self):
        for cat, n in self._cat_counts.items():
            if n > 10:
                self.issues.append(('I', cat, '……同类问题共 %d 条，其余已省略（判断口径见报告维护说明）' % n))

    def fixlog(self, f, action, detail=''):
        self.fixes.append((f, action, detail))

    def resolve(self, raw_href, base_dir):
        """多基准解析 href → (zip 内条目名, 锚点)。找不到文件返回 (None, anch)。"""
        href = (raw_href or '').replace('\\', '/').strip()
        if not href or href.startswith(('#', 'http:', 'https:', 'mailto:', 'data:')):
            return None, None
        path, _, anch = href.partition('#')
        try:
            path = urllib.parse.unquote(path)
        except Exception:
            pass
        parts = []
        for seg in path.split('/'):
            if seg == '..':
                if parts:
                    parts.pop()
            elif seg not in ('', '.'):
                parts.append(seg)
        path = '/'.join(parts)
        bases = [base_dir, self.opf_dir, '']
        if self.opf_dir:
            bases += [self.opf_dir + '/Text', self.opf_dir + '/text', self.opf_dir + '/OEBPS']
        for b in bases:
            if not b:
                cand = path
            else:
                cand = b + '/' + path
            if cand in self.entries:
                return cand, anch
        lc = path.lower()
        if lc in self._lower_map:
            return self._lower_map[lc], anch
        return None, anch

    # ---------- 读入 ----------
    def load(self):
        try:
            z = zipfile.ZipFile(self.path)
        except Exception as e:
            self.report('F', '包结构', '无法打开 zip: %s' % e)
            return False
        self.entries = {i.filename: z.read(i.filename) for i in z.infolist()}
        self._lower_map = {}
        for n in self.entries:
            self._lower_map.setdefault(n.lower(), n)
        # 1) container.xml → OPF
        if 'META-INF/container.xml' not in self.entries:
            self.report('F', '包结构', '缺少 META-INF/container.xml，无法定位 OPF')
            return False
        try:
            ct = ET.fromstring(self.entries['META-INF/container.xml'])
        except Exception as e:
            self.report('F', '包结构', 'container.xml 解析失败: %s' % e)
            return False
        opfs = [rf.get('full-path') for rf in ct.iter('{%s}rootfile' % CONTAINER_NS) if rf.get('full-path')]
        if not opfs:
            self.report('F', '包结构', 'container.xml 未声明 rootfile')
            return False
        self.opf_name = self.resolve(opfs[0], '')[0] or opfs[0]
        self.opf_dir = os.path.dirname(self.opf_name)
        if self.opf_name not in self.entries:
            self.report('F', '包结构', 'OPF 文件不存在: %s' % self.opf_name)
            return False
        # 2) mimetype 检查（可靠性问题，不致命）
        names = list(self.entries)
        if 'mimetype' not in names:
            self.report('W', '包结构', '缺少 mimetype 文件（部分阅读器拒绝打开）')
        else:
            if names[0] != 'mimetype':
                self.report('W', '包结构', 'mimetype 不是压缩包首项（规范要求首项且不压缩）')
            if z.getinfo('mimetype').compress_type != zipfile.ZIP_STORED:
                self.report('W', '包结构', 'mimetype 被压缩存储（规范要求不压缩）')
            if self.entries['mimetype'].decode('ascii', 'replace').strip() != MIMETYPE:
                self.report('W', '包结构', 'mimetype 内容异常: %r' % self.entries['mimetype'][:40])
        return True

    def parse_opf(self):
        try:
            root = ET.fromstring(self.entries[self.opf_name])
        except Exception as e:
            self.report('F', '元数据', 'OPF XML 解析失败: %s' % e)
            return False
        for m in root.iter('{%s}metadata' % OPF_NS):
            for tag in m:
                local = tag.tag.split('}')[-1]
                if local.startswith('dc:'):
                    local = local[3:]
                if local in ('title', 'language', 'identifier', 'creator'):
                    self.meta.setdefault(local, (tag.text or '').strip())
        for it in root.iter('{%s}item' % OPF_NS):
            iid, href = it.get('id'), it.get('href')
            if iid and href:
                self.manifest[iid] = (it.get('media-type') or '', href, it.get('properties') or '')
        for ir in root.iter('{%s}itemref' % OPF_NS):
            self.spine.append((ir.get('idref'), ir.get('linear', 'yes'), ir.get('properties') or ''))
        spine_toc = None
        sp = root.find('{%s}spine' % OPF_NS)
        if sp is not None:
            spine_toc = sp.get('toc')
        if not self.meta.get('title'):
            self.report('I', '元数据', 'OPF 缺 dc:title（文件名可作参考）')
        if not self.meta.get('identifier'):
            self.report('I', '元数据', 'OPF 缺 dc:identifier')
        if not self.meta.get('language'):
            self.report('I', '元数据', 'OPF 缺 dc:language')
        for iid, (mt, href, props) in self.manifest.items():
            rname, _ = self.resolve(href, self.opf_dir)
            if rname is None:
                self.report('W', '清单', 'manifest 条目 %s 指向不存在的文件: %s' % (iid, href))
                continue
            if mt == 'application/x-dtbncx+xml' or rname.lower().endswith('.ncx'):
                self.ncx_name, self.ncx_id = rname, iid
            elif mt == 'application/xhtml+xml' and 'nav' in props:
                self.nav_name, self.nav_id = rname, iid
        if self.nav_name is None:
            for nm in self.entries:
                if nm.lower().endswith('nav.xhtml'):
                    self.nav_name = nm
                    break
        self.nav_name_orig, self.ncx_name_orig = self.nav_name, self.ncx_name
        if self.nav_name is None and self.ncx_name is None:
            self.report('W', '目录', '既无 nav.xhtml 也无 toc.ncx（无目录文件，正文有标题时可重建）')
        elif self.nav_name is None:
            self.report('I', '目录', '仅有 NCX 无 EPUB3 nav（老版样式）')
            if spine_toc is None or spine_toc != self.ncx_id:
                self.report('I', '目录', 'spine 未通过 toc 属性声明 NCX')
        return True

    def check_docs(self):
        """文档级检查：解码、XML 合法性（含 nbsp 修复）。返回 name->文本。"""
        decoded = {}
        for name in list(self.entries):
            if not name.lower().endswith(('.xhtml', '.html', '.opf', '.ncx')):
                continue
            data = self.entries[name]
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    text = data.decode('gb18030')
                    self.report('W', '编码', '%s 为 GBK/GB18030 编码，将转 UTF-8' % name)
                    self.fixlog(name, '转码', 'gb18030 → utf-8')
                except Exception:
                    self.report('W', '编码', '%s 无法按 UTF-8/GBK 解码' % name)
                    continue
            fixed = fix_html_entities(text)
            if fixed != text:
                self.fixlog(name, '实体修复', 'HTML 实体 → XML 数字实体')
                self.report('W', 'XML', '%s 含 XML 非法实体（如 &nbsp;），已修复' % name)
                text = fixed
            fixed2 = BARE_AMP_RE.sub('&amp;', text)
            if fixed2 != text:
                self.fixlog(name, '转义裸&', '未转义的 & → &amp;')
                self.report('W', 'XML', '%s 含未转义的裸 &，已转义' % name)
                text = fixed2
            try:
                ET.fromstring(text.encode('utf-8'))
            except ET.ParseError as e:
                self.report('W', 'XML', '%s XML 解析失败: %s（结构性问题，未自动修复）' % (name, str(e)[:70]))
            decoded[name] = text
        return decoded

    # ---------- 目录 ----------
    def read_toc(self, docs):
        entries = []
        if self.nav_name and self.nav_name in docs:
            src = docs[self.nav_name]
            block = NAV_TOC_BLOCK_RE.search(src)
            scope = block.group(1) if block else src
            for m in A_HREF_RE.finditer(scope):
                href, body = m.group(1), m.group(2)
                label = TAG_RE.sub('', body).strip()
                if label and not href.lstrip().lower().startswith(('http', 'mailto', '#')):
                    entries.append((label, href, 0))
        if not entries and self.ncx_name and self.ncx_name in docs:
            try:
                nx = ET.fromstring(docs[self.ncx_name].encode('utf-8'))
                for np_ in nx.iter('{%s}navPoint' % NCX_NS):
                    try:
                        lbl = np_.find('{%s}navLabel/{%s}text' % (NCX_NS, NCX_NS)).text or ''
                        s = np_.find('{%s}content' % NCX_NS).get('src')
                        entries.append((lbl.strip(), s or '', 0))
                    except Exception:
                        pass
            except Exception as e:
                self.report('W', '目录', 'NCX 解析失败: %s' % str(e)[:70])
        return entries

    def _is_chaptery(self, h):
        """章级标题判定：h1，或文本带 第X章/回/卷 等前缀，或常见前后附件标题。"""
        lvl, tid, t = h
        if lvl == 1:
            return True
        n = norm_text(t)
        return bool(re.match(r'^(第[0-9%s]+[章回节卷部篇集][^一二三四五六七八九十]|卷[0-9%s]+|前言|序言|自序|引言|附录|后记|跋|结语|后记)' % (CJK_CH, CJK_CH), n))

    def analyze_toc(self, entries, docs):
        fixed_entries = []
        base = os.path.dirname(self.nav_name or self.ncx_name or self.opf_name or '')
        prev_key = None
        for i, (label, href, depth) in enumerate(entries):
            if not href:
                self.report('W', '目录', '第 %d 条 TOC 无目标地址，已移除' % (i + 1))
                continue
            doc, anch = self.resolve(href, base)
            if doc is None:
                self.report('W', '目录', '第 %d 条「%s」指向不存在的文件 %s，已移除' % (i + 1, label[:40], href))
                continue
            hh = self.spine_heads.get(doc) or extract_headings(docs.get(doc, ''))
            doc_ids = all_ids(docs.get(doc, ''))
            # 1) 强标签匹配优先：文档内有 ≥0.92 相似标题 → 锚定它、按包含规则定标签
            best = None
            for h in hh:
                r = sim(label, h[2])
                if r >= 0.92 and (best is None or r > best[0]):
                    best = (r, h)
            cand, via_label = (best[1], True) if best else (None, False)
            # 2) 锚点匹配兜底（锚定的标题与标签相似时才改标签）
            anchored = None
            if cand is None and anch:
                for h in hh:
                    if h[1] == anch:
                        anchored = h
                        break
                if anchored is None and anch not in doc_ids:
                    self.report('W', '目录', '「%s」锚点 #%s 在 %s 中不存在，将按正文标题重新定位' % (label[:30], anch, doc))
                cand = anchored
            # 3) 单标题文档兜底（仅定位；标签仅强相似才对齐）
            if cand is None and len(hh) == 1 and sim(label, hh[0][2]) >= 0.7:
                cand = hh[0]
            if cand:
                lvl, tid, t = cand
                nl, nh = norm_text(label), norm_text(t)
                if via_label:
                    if nl == nh:
                        new_label = t
                    elif nh in nl:
                        new_label = t          # 标题是标签子串 → 用标题（更短更准）
                    else:
                        new_label = label      # 标签是标题子串/同义 → 保住标签语义
                else:
                    new_label = t if sim(label, t) >= 0.92 else label
                if not tid:
                    tid = self._ensure_heading_id(docs, doc, t)
                new_href = doc + ('#' + tid if tid else '')
                if norm_text(new_label) != nl:
                    self.fixlog(doc or 'nav', 'TOC 标签', '%s → %s' % (label[:30], new_label[:30]))
                    self.report('I', '目录', '「%s」对齐为正文标题「%s」' % (label[:30], new_label[:34]))
            else:
                new_label, new_href = label, doc if not anch else doc + '#' + anch
            key = (norm_text(new_label), doc)
            if key == prev_key:
                self.report_capped('目录', '「%s」为重复目录条目，已去重' % new_label[:30], cap=20)
                continue
            prev_key = key
            fixed_entries.append((new_label, new_href, depth))
        self.toc_final = fixed_entries
        # 漏章报告（不自动添加，避免误扩目录）
        mapped = set(h.split('#')[0] for _, h, _ in fixed_entries)
        for idref, linear, _ in self.spine:
            if idref not in self.manifest:
                self.report('W', '目录', 'spine 引用 manifest 中不存在的 idref=%s（未自动改写阅读顺序）' % idref)
                continue
            sd, _ = self.resolve(self.manifest[idref][1], self.opf_dir)
            if not sd or not sd.lower().endswith(('.xhtml', '.html')) or 'nav' in sd.lower():
                continue
            if sd in mapped:
                continue
            hh = self.spine_heads.get(sd) or extract_headings(docs.get(sd, ''))
            if hh and any(self._is_chaptery(h) for h in hh):
                shown = '、'.join(t[:22] for _, _, t in hh[:3])
                self.report_capped('目录', '文档 %s 有 %d 个标题且含章级标题，但目录未收录（未自动添加，需人工核对）: %s…' % (sd, len(hh), shown))
        return fixed_entries

    def _ensure_heading_id(self, docs, doc, heading_text):
        src = docs.get(doc, '')
        for m in H_RE.finditer(src):
            body = re.sub(r'\s+', ' ', TAG_RE.sub('', m.group(3))).strip()
            if body == heading_text:
                if ID_IN_TAG_RE.search(m.group(2) or ''):
                    return ID_IN_TAG_RE.search(m.group(2)).group(1)
                tid = 'epubfix_toc_%d' % (len(self.fixes) + 1)
                new_inner = '<h%s id="%s"%s>%s</h%s>' % (m.group(1), tid, m.group(2), m.group(3), m.group(1))
                docs[doc] = src[:m.start()] + new_inner + src[m.end():]
                self.fixlog(doc, '注入锚点', '「%s」→ #%s' % (heading_text[:20], tid))
                return tid
        return None

    # ---------- 正文链接 ----------
    def check_links(self, docs):
        for name, src in docs.items():
            if not name.lower().endswith(('.xhtml', '.html')) or 'nav' in name.lower():
                continue
            base = os.path.dirname(name) or ''   # 正文 href 相对所在文档目录
            for m in LINK_RE.finditer(src):
                val = m.group(2)
                lv = val.lstrip()
                if lv.lower().startswith(('http', 'mailto', 'data:', '#')):
                    continue
                if re.fullmatch(r'(.)\1{9,}', val) or val.lower() in ('none', 'null', 'undefined'):
                    self.report_capped('正文链接', '%s 中含疑似占位/打码链接（%r）' % (name, val[:40]))
                    continue
                doc, anch = self.resolve(val, base)
                if doc is None:
                    self.report_capped('正文链接', '%s 中 %s=「%s」目标文件不存在' % (name, m.group(1), val[:40]))
                elif anch and doc.lower().endswith(('.xhtml', '.html')):
                    ids = all_ids(docs.get(doc, ''))
                    if anch not in ids:
                        self.report_capped('正文链接', '%s 中 %s=「%s」锚点 #%s 不存在' % (name, m.group(1), val[:40], anch))

    # ---------- 重打包 ----------
    def rebuild_zip(self, docs):
        out = {}
        for n in self.entries:
            if n in docs:
                out[n] = docs[n].encode('utf-8')
            else:
                out[n] = self.entries[n]
        nav_target = self.nav_name
        if not nav_target and self.toc_final:
            nav_target = (self.opf_dir + '/nav.xhtml') if self.opf_dir else 'nav.xhtml'
        if nav_target:
            out[nav_target] = self._build_nav()
            if not self.nav_name:
                self.fixlog(nav_target, '新建 nav', 'EPUB3 目录')
                self.nav_name = nav_target
        ncx_target = self.ncx_name
        if not ncx_target and self.toc_final:
            ncx_target = (self.opf_dir + '/toc.ncx') if self.opf_dir else 'toc.ncx'
        if ncx_target:
            out[ncx_target] = self._build_ncx()
            if not self.ncx_name:
                self.fixlog(ncx_target, '新建 NCX', 'EPUB2 目录')
                self.ncx_name = ncx_target
        # 防御：zip 条目名一律 '/'；合并任何反斜杠残键（后写者胜）
        merged = {}
        for k, v in out.items():
            merged[k.replace('\\', '/')] = v
        out = merged
        opf_src = docs.get(self.opf_name) or self.entries[self.opf_name].decode('utf-8', 'replace')
        opf_src = self._register_opf(opf_src)
        out[self.opf_name] = opf_src.encode('utf-8')
        buf = os.path.join(os.path.dirname(self.path), '_tmp_rebuild.epub')
        try:
            with zipfile.ZipFile(buf, 'w') as zf:
                if 'mimetype' in out:
                    mi = zipfile.ZipInfo('mimetype')
                    mi.compress_type = zipfile.ZIP_STORED
                    zf.writestr(mi, MIMETYPE.encode('utf-8'))
                order = ['META-INF/container.xml'] + sorted(
                    n for n in out if n not in ('mimetype', 'META-INF/container.xml'))
                for n in order:
                    zf.writestr(n, out[n])
        except Exception as e:
            self.report('F', '包结构', '重打包失败: %s' % e)
            return None
        with open(buf, 'rb') as f:
            data = f.read()
        os.remove(buf)
        return data

    def _build_nav(self):
        title = html.escape(self.meta.get('title') or self.name)
        items = ['      <li><a href="%s">%s</a></li>'
                 % (html.escape(h, quote=True), html.escape(l)) for l, h, d in self.toc_final]
        if not items:
            items.append('      <li><a href="">（空目录）</a></li>')
        return ('<?xml version="1.0" encoding="utf-8"?>\n'
                '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n'
                '<head><title>%s</title></head>\n<body>\n'
                '<nav epub:type="toc" id="toc"><h1>目录</h1>\n<ol>\n%s\n</ol>\n</nav>\n'
                '</body>\n</html>\n' % (title, '\n'.join(items)))

    def _build_ncx(self):
        title = self.meta.get('title') or self.name
        points = []
        for i, (label, href, d) in enumerate(self.toc_final, start=1):
            points.append('<navPoint id="np%d" playOrder="%d"><navLabel><text>%s</text></navLabel>'
                          '<content src="%s"/></navPoint>'
                          % (i, i, html.escape(label), html.escape(href, quote=True)))
        uid = html.escape(self.meta.get('identifier') or ('epub:' + self.name), quote=True)
        return ('<?xml version="1.0" encoding="utf-8"?>\n'
                '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
                '<head><meta name="dtb:uid" content="%s"/><meta name="dtb:depth" content="1"/>'
                '<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>\n'
                '<docTitle><text>%s</text></docTitle>\n<navMap>\n%s\n</navMap>\n</ncx>\n'
                % (uid, html.escape(title), '\n'.join(points)))

    def _register_opf(self, opf_src):
        changed = False
        if self.nav_name and not self.nav_name_orig:
            rel = os.path.relpath(self.nav_name, self.opf_dir).replace('\\', '/') if self.opf_dir else self.nav_name
            item = '<item id="nav" href="%s" media-type="application/xhtml+xml" properties="nav"/>' % html.escape(rel, quote=True)
            m = re.search(r'</manifest>', opf_src)
            if m:
                opf_src = opf_src[:m.start()] + '    ' + item + '\n' + opf_src[m.start():]
                changed = True
        if self.ncx_name and not self.ncx_name_orig:
            rel = os.path.relpath(self.ncx_name, self.opf_dir).replace('\\', '/') if self.opf_dir else self.ncx_name
            item = '<item id="ncx" href="%s" media-type="application/x-dtbncx+xml"/>' % html.escape(rel, quote=True)
            m = re.search(r'</manifest>', opf_src)
            if m:
                opf_src = opf_src[:m.start()] + '    ' + item + '\n' + opf_src[m.start():]
                m2 = re.search(r'<spine\b([^>]*)>', opf_src)
                if m2 and 'toc=' not in m2.group(1):
                    opf_src = opf_src[:m2.start()] + '<spine toc="ncx"' + m2.group(1) + '>' + opf_src[m2.end():]
                changed = True
        if changed:
            self.fixlog(self.opf_name, 'OPF 注册', '登记重生成的目录文件')
        return opf_src

    # ---------- 主流程 ----------
    def process(self, report_only):
        if not self.load():
            self.verdict = '无法处理'
            return self.verdict
        if not self.parse_opf():
            self.verdict = '无法处理'
            return self.verdict
        docs = self.check_docs()
        for _tf in self.transformers:
            _tf(self, docs)
        for idref, linear, _ in self.spine:
            if idref in self.manifest:
                sd, _ = self.resolve(self.manifest[idref][1], self.opf_dir)
                if sd:
                    self.spine_heads[sd] = extract_headings(docs.get(sd, ''))
        entries = self.read_toc(docs)
        if entries:
            self.analyze_toc(entries, docs)
        else:
            self.report('W', '目录', '未读取到任何目录条目（无 TOC 或 TOC 为空）')
            total = sum(len(v) for v in self.spine_heads.values())
            if total >= 3:
                self.report('I', '目录', '正文发现 %d 个标题但无有效目录——按每个文档的首个标题重建目录（原始目录缺失/被清空）' % total)
                for sd, hh in self.spine_heads.items():
                    if sd.lower().endswith(('.xhtml', '.html')) and 'nav' not in sd.lower() and hh:
                        first = hh[0]
                        tid = first[1] or self._ensure_heading_id(docs, sd, first[2])
                        self.toc_final.append((first[2], sd + ('#' + tid if tid else ''), 0))
        self.check_links(docs)
        self.finish_caps()
        sev_order = {'F': 3, 'W': 2, 'I': 1}
        worst = max((sev_order[i[0]] for i in self.issues), default=0)
        verdict = {3: '需人工', 2: '待确认', 1: '基本OK', 0: 'OK'}[worst]
        if any(i[0] == 'F' for i in self.issues):
            self.verdict = verdict
            return verdict
        if report_only:
            self.verdict = verdict
            return verdict
        data = self.rebuild_zip(docs)
        if data is None:
            self.verdict = '需人工'
            return self.verdict
        out_dir = os.path.join(os.path.dirname(self.path), '_epub_修复')
        os.makedirs(out_dir, exist_ok=True)
        self.fixed_path = os.path.join(out_dir, self.name[:-5] + '_fixed.epub')
        with open(self.fixed_path, 'wb') as f:
            f.write(data)
        chk = Epub(self.fixed_path)
        ok = chk.load() and chk.parse_opf()
        if ok:
            chk.check_docs()
            res = [i[2] for i in chk.issues if i[0] in ('F', 'W')]
            if res:
                self.report('I', '复验', '修复件仍有 %d 处 W/F 级问题: %s' % (len(res), res[:3]))
            else:
                self.report('I', '复验', '修复件复验无 W/F 级问题')
                if verdict == '待确认' and self.fixes:
                    verdict = '已修复'
        self.verdict = verdict
        return verdict


def _write_report(book, out_dir):
    L = ['# 体检报告：%s\n' % book.name,
         '- 判定：**%s**' % getattr(book, 'verdict', '?'),
         '- 文件：`%s`（%d 个条目）' % (book.path, len(book.entries))]
    if book.meta:
        L.append('- 元数据：%s' % '；'.join('%s=%s' % kv for kv in sorted(book.meta.items())))
    L.append('')
    if book.issues:
        L += ['## 体检结果\n', '| 级别 | 类别 | 说明 |', '|------|------|------|']
        for sev, cat, msg in book.issues:
            L.append('| %s | %s | %s |' % (sev, cat, msg))
        L.append('')
    if book.fixes:
        L += ['## 修复动作\n', '| 文件 | 动作 | 说明 |', '|------|------|------|']
        for f, a, d in book.fixes:
            L.append('| %s | %s | %s |' % (f, a, d))
        L.append('')
    if not book.issues and not book.fixes:
        L.append('未发现问题。\n')
    if getattr(book, 'fixed_path', ''):
        L.append('## 产物\n\n- 修复件：`%s`（原文件未改动，确认无误后自行替换）\n' % book.fixed_path)
    L.append('\n---\n*由 epub_fix.py 生成（保守规则：拿不准的问题只报告不修改）*\n')
    safe = re.sub(r'[\\/:*?"<>|]', '_', book.name[:-5])
    with open(os.path.join(out_dir, safe + '.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))


def run_folder(folder, report_only, skip_ok):
    def _skip(p):
        b = os.path.basename(p)
        return (b.endswith('_fixed.epub')
                or '_epub_修复' in p.replace('\\', '/')
                or '_epub_原始备份' in p.replace('\\', '/'))
    epubs = sorted(set(
        glob.glob(os.path.join(folder, '**', '*.epub'), recursive=True) +
        glob.glob(os.path.join(folder, '**', '*.EPUB'), recursive=True)))
    epubs = [p for p in epubs if not _skip(p)]
    out_dir = os.path.join(folder, '_epub_修复')
    os.makedirs(out_dir, exist_ok=True)
    state_path = os.path.join(out_dir, '_state.json')
    try:
        state = json.load(open(state_path, encoding='utf-8')) if os.path.exists(state_path) else {}
    except Exception:
        state = {}
    summary, new_state, fails = [], {}, []
    for ep in epubs:
        try:
            st = os.stat(ep)
        except Exception:
            continue
        fp = [st.st_size, int(st.st_mtime)]
        if skip_ok and state.get(ep, {}).get('fp') == fp and state[ep].get('v') == 'OK':
            summary.append((os.path.basename(ep), 'OK(跳过)', ''))
            new_state[ep] = state[ep]
            continue
        try:
            book = Epub(ep)
            verdict = book.process(report_only)
        except Exception as e:
            summary.append((os.path.basename(ep), '异常', str(e)[:80]))
            fails.append((os.path.basename(ep), '异常', str(e)[:80]))
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
        _write_report(book, out_dir)
    json.dump(new_state, open(state_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    byv = {}
    for _, v, _ in summary:
        byv[v] = byv.get(v, 0) + 1
    with open(os.path.join(out_dir, '_汇总.md'), 'w', encoding='utf-8') as f:
        f.write('# EPUB 体检汇总\n\n%s：共 %d 本（%s）\n\n'
                % (folder, len(summary), '；'.join('%s %d' % kv for kv in byv.items())))
        for name, v, d in summary:
            f.write('- `%s`  [%s]  %s\n' % (name, v, d))
    with open(os.path.join(out_dir, '_failures.txt'), 'w', encoding='utf-8') as f:
        for t in fails:
            f.write(' | '.join(str(x) for x in t) + '\n')
    for name, v, d in summary:
        try:
            print('%-44s [%s] %s' % (name[:44], v, d))
        except Exception:
            pass
    print('\n完成：%d 本。报告与修复件见 %s' % (len(summary), out_dir))
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser(description='EPUB 批量体检+修复（保守规则，永不改原文件）')
    ap.add_argument('path')
    ap.add_argument('--no-fix', action='store_true', help='只体检不修复')
    ap.add_argument('--skip-ok', action='store_true', help='跳过上次判定 OK 且文件未变化的书')
    a = ap.parse_args()
    if os.path.isdir(a.path):
        sys.exit(run_folder(a.path, a.no_fix, a.skip_ok))
    if os.path.isfile(a.path) and a.path.lower().endswith('.epub'):
        out = os.path.join(os.path.dirname(a.path), '_epub_修复')
        os.makedirs(out, exist_ok=True)
        book = Epub(a.path)
        v = book.process(a.no_fix)
        _write_report(book, out)
        print('[%s] %s' % (v, os.path.basename(a.path)))
        return
    print('路径不存在或不是 EPUB: %s' % a.path)
    sys.exit(2)


if __name__ == '__main__':
    main()