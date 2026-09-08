# -*- coding: utf-8 -*-
"""epub_split.py — EPUB 合辑拆分引擎（epub-auto 技能组件）

把"一本书里装了多本书"的合辑 EPUB 按 TOC 顶层结构拆成多个单本 EPUB。
- 目录来源：EPUB3 nav（epub:type="toc"）优先，回退 EPUB2 toc.ncx
- 合辑判定：顶层条目 >=2 且至少 2 个顶层条目带 >=2 个下级条目；若顶层标题多为
  卷/部/辑/篇（单本书的分卷结构）则判定为单本，除非 --force-split
- 拆分单位 = 顶层条目，按 spine 出现顺序切区间；共享资源（CSS/图片/字体）每册全量携带
- 子册保持原包相对布局（OPF 原路径重建，nav/ncx 放 OPF 同目录），正文文件原字节拷贝
输出：JSON 摘要 + 子册文件。永不改写原文件。
"""
import sys, os, re, json, uuid, zipfile, posixpath, datetime
from urllib.parse import unquote
import xml.etree.ElementTree as ET

NS_OPF  = 'http://www.idpf.org/2007/opf'
NS_DC   = 'http://purl.org/dc/elements/1.1/'
NS_XH   = 'http://www.w3.org/1999/xhtml'
NS_EPUB = 'http://www.idpf.org/2007/ops'
NS_NCX  = 'http://www.daisy.org/z3986/2005/ncx/'
NS_CTR  = 'urn:oasis:names:tc:opendocument:xmlns:container'
MATTER_RE = re.compile(r'^(扉页|封面|封底|目录|总目录|前言|序言|序|引言|导论|致谢|感谢|版权页|版权信息|附录|后记|注释|参考书目|参考文献|出版说明|译名对照表|作者简介)$')
VOL_RE  = re.compile(r'^(第.{0,6}(卷|部|辑|篇)|卷[一二三四五六七八九十百0-9]+|[上下]册?|终[结卷]?|番外.*|序章|楔子|后记|前言|结语)$')
PAT_REF = re.compile(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
PAT_URL = re.compile(r'url\(\s*([^)]+?)\s*\)', re.I)
PAT_IMP = re.compile(r'@import\s+["\']([^"\']+)["\']', re.I)
ASSET_EXTS = ('.gif', '.jpeg', '.jpg', '.png', '.webp', '.svg', '.ttf', '.otf',
              '.woff', '.woff2', '.eot', '.mp3', '.mp4', '.css')


def _norm_ref(base, u):
    u = (u or '').split('#')[0].strip().strip('\'"').replace(chr(92), '/')
    if not u or re.match(r'^[a-z]+:', u, re.I) or u.startswith('data:'):
        return None
    return _norm(posixpath.join(posixpath.dirname(base), u) if base else u)


def _collect_refs(z, doc_hrefs):
    """从一组文档出发收集直接/传递引用的 css 与资源（norm 小写路径集合）。"""
    keep = set()
    queue = list(doc_hrefs)
    seen_css = set()
    while queue:
        h = queue.pop()
        if not h or h.lower() in keep:
            continue
        keep.add(h.lower())
        low = h.lower()
        try:
            txt = z.read(h).decode('utf-8', 'ignore')
        except KeyError:
            continue
        if low.endswith(('.xhtml', '.html', '.htm', '.svg')):
            pats = (PAT_REF,)
        elif low.endswith('.css'):
            if h in seen_css:
                continue
            seen_css.add(h)
            pats = (PAT_URL, PAT_IMP)
        else:
            continue
        for p in pats:
            for u in p.findall(txt):
                t = _norm_ref(h, u)
                if t and t.lower() not in keep and t.lower().endswith(ASSET_EXTS):
                    queue.append(t)
    return keep

def _norm(p):
    return posixpath.normpath(unquote((p or '').replace(chr(92), '/')))

def _esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def _rel(base, target):
    return posixpath.relpath(target, base) if base else target

def _texts(el):
    return ''.join(el.itertext()).strip() if el is not None else ''

class Node:
    __slots__ = ('title', 'href', 'children')
    def __init__(self, title, href):
        self.title, self.href, self.children = title, href, []

def parse_epub(path):
    z = zipfile.ZipFile(path)
    names = {n.replace(chr(92), '/') for n in z.namelist()}
    ctr = ET.fromstring(z.read('META-INF/container.xml'))
    opf_path = _norm(ctr.find(f'.//{{{NS_CTR}}}rootfile').get('full-path'))
    opf_dir = posixpath.dirname(opf_path)
    opf = ET.fromstring(z.read(opf_path))
    ver = (opf.get('version') or '2.0').strip()
    manifest, spine_ids = {}, []
    nav_href = ncx_href = cover_meta_id = None
    _mf = opf.find(f'{{{NS_OPF}}}manifest')
    for it in (_mf if _mf is not None else []):
        if it.tag != f'{{{NS_OPF}}}item':
            continue
        iid, href = it.get('id'), _norm(it.get('href') or '')
        full = posixpath.join(opf_dir, href) if opf_dir else href
        props = (it.get('properties') or '').split()
        manifest[iid] = {'href': _norm(full), 'mt': it.get('media-type') or '', 'props': props}
        if 'nav' in props:
            nav_href = manifest[iid]['href']
        if (it.get('media-type') or '') == 'application/x-dtbncx+xml':
            ncx_href = ncx_href or manifest[iid]['href']
    sp = opf.find(f'{{{NS_OPF}}}spine')
    if sp is not None:
        t = sp.get('toc')
        if t and t in manifest:
            ncx_href = manifest[t]['href']
        for ir in sp:
            if ir.tag == f'{{{NS_OPF}}}itemref':
                spine_ids.append(ir.get('idref'))
    for mt in opf.iter(f'{{{NS_OPF}}}meta'):
        if mt.get('name') == 'cover':
            cover_meta_id = mt.get('content')
    meta = {}
    md = opf.find(f'{{{NS_OPF}}}metadata')
    if md is not None:
        for tag in ('title', 'language', 'creator', 'publisher'):
            el = md.find(f'{{{NS_DC}}}{tag}')
            if el is not None and _texts(el):
                meta[tag] = _texts(el)
    return z, names, opf_path, opf_dir, ver, manifest, spine_ids, nav_href, ncx_href, meta, cover_meta_id

def toc_tree_nav(z, nav_full):
    root = ET.fromstring(z.read(nav_full))
    cand = root.findall(f'{{{NS_XH}}}nav') + root.findall(f'.//{{{NS_XH}}}nav')
    toc_nav = next((n for n in cand if n.get(f'{{{NS_EPUB}}}type') == 'toc'), cand[0] if cand else None)
    if toc_nav is None:
        return None
    def walk(ol):
        out = []
        for li in ol.findall(f'{{{NS_XH}}}li') if ol is not None else []:
            a = li.find(f'{{{NS_XH}}}a')
            h = a.get('href') if a is not None else None
            t = _texts(a) if a is not None else _texts(li.find(f'{{{NS_XH}}}span'))
            sub = walk(li.find(f'{{{NS_XH}}}ol'))
            if not h and sub:
                h = sub[0].href
            node = Node(t or '(无题)', h)
            node.children = sub
            out.append(node)
        return out
    return walk(toc_nav.find(f'{{{NS_XH}}}ol'))

def toc_tree_ncx(z, ncx_full):
    root = ET.fromstring(z.read(ncx_full))
    nm = root.find(f'{{{NS_NCX}}}navMap')
    if nm is None:
        return None
    def walk(np):
        out = []
        for p in np.findall(f'{{{NS_NCX}}}navPoint'):
            lab = p.find(f'{{{NS_NCX}}}navLabel/{{{NS_NCX}}}text')
            con = p.find(f'{{{NS_NCX}}}content')
            node = Node(_texts(lab) if lab is not None else '(无题)',
                        con.get('src') if con is not None else None)
            node.children = walk(p)
            out.append(node)
        return out
    return walk(nm)

def leaves(n):
    if not n.children:
        return [n]
    out = []
    for c in n.children:
        out += leaves(c)
    return out

def detect(tops, spine_hrefs, opf_dir, force):
    """返回 (omnibus, reason, [(node, spine_idx)])"""
    if len(tops) < 2:
        return False, '顶层目录条目不足 2 个', []
    rich = sum(1 for t in tops if len(leaves(t)) >= 2)
    vol_like = sum(1 for t in tops if VOL_RE.match((t.title or '').strip()))
    if rich < 2:
        return False, '顶层条目普遍没有下级章节，更像普通书的目录', []
    if vol_like >= len(tops) * 0.6:
        if not force:
            return False, '顶层标题多为卷/部/辑/篇，判定为单本书的分卷结构（--force-split 可强制拆）', []
    matter_like = sum(1 for t in tops if MATTER_RE.match((t.title or '').strip()))
    if matter_like > 1 and not force:
        return False, f'顶层含 {matter_like} 个辅助页条目（扉页/目录/前言/致谢/版权等），判定为单本书（--force-split 可强制拆）', []
    if rich / float(len(tops)) < 0.5 and not force:
        return False, f'带章节的顶层条目占比过低（{rich}/{len(tops)}），更像单本书的分区结构（--force-split 可强制拆）', []
    ranges = []
    for t in tops:
        if not t.href:
            continue
        p = _norm(t.href.partition('#')[0])
        cand = _norm(posixpath.join(opf_dir, p)) if opf_dir and not p.startswith('/') else p.lstrip('/')
        idx = next((i for i, sh in enumerate(spine_hrefs) if sh == cand), None)
        if idx is None:
            idx = next((i for i, sh in enumerate(spine_hrefs) if sh.endswith('/' + cand) or cand.endswith('/' + sh)), None)
        if idx is not None:
            ranges.append((t, idx))
    if len(ranges) < 2:
        return False, '顶层条目无法映射到 spine（目录 href 与正文对不上）', []
    return True, f'检测到 {len(ranges)} 个顶层书目', ranges

def split_epub(path, out_dir, force=False, title_prefix=True):
    """拆一本 EPUB 合辑；返回结果 dict。永不写原文件。"""
    z, names, opf_path, opf_dir, ver, manifest, spine_ids, nav_href, ncx_href, meta, cover_meta_id = parse_epub(path)
    spine_hrefs = [manifest[i]['href'] for i in spine_ids if i in manifest]
    tops = None
    if nav_href and nav_href in names:
        tops = toc_tree_nav(z, nav_href)
    if not tops and ncx_href and ncx_href in names:
        tops = toc_tree_ncx(z, ncx_href)
    if not tops:
        return {'omnibus': False, 'reason': '没有可解析的 TOC（nav/NCX 均缺失或为空）', 'books': []}
    omnibus, reason, ranges = detect(tops, spine_hrefs, opf_dir, force)
    if not omnibus:
        return {'omnibus': False, 'reason': reason, 'books': []}
    os.makedirs(out_dir, exist_ok=True)
    books = []
    # 辅助页顶层条目（总目录/版权页等）不单独成册，区间并入下一个保留条目
    ranges = [(t, i) for t, i in ranges if not MATTER_RE.match((t.title or '').strip())]
    for i, (node, start) in enumerate(ranges):
        end = ranges[i + 1][1] if i + 1 < len(ranges) else len(spine_ids)
        end = min(max(end, start + 1), len(spine_ids))
        books.append({'title': (node.title or f'第{i+1}册').strip(), 'node': node, 'a': start, 'b': end})
    ts = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    made = []
    for i, b in enumerate(books, 1):
        in_spine = [s for s in spine_ids[b['a']:b['b']] if s in manifest]
        keep_ids = list(in_spine)
        keep_files = {_norm(manifest[s]['href']) for s in keep_ids}
        drop = {_norm(x) for x in (nav_href, ncx_href, opf_path) if x}
        # 共享资源 = 本册文档实际引用的 css/图片/字体（传递引用）；其他分册的 html
        # 与未被引用的资源一律不进本册，否则每册≈整套书拷贝（体积成倍膨胀）
        ref_files = _collect_refs(z, sorted(keep_files))
        shared = [iid for iid, m in manifest.items() if iid not in in_spine
                  and m['href'] not in drop
                  and _norm(m['href']).lower() in ref_files]
        allowed = keep_files | {manifest[s]['href'] for s in shared}
        safe = re.sub('[' + re.escape(chr(92)) + '/:*?"<>|' + chr(0) + '-' + chr(31) + ']', '_', b['title']).strip() or f'第{i}册'
        safe = re.sub(r'\s+', ' ', safe)[:80]
        fname = (f'{i:02d}_{safe}.epub') if title_prefix else f'{safe}.epub'
        outp = os.path.join(out_dir, fname)
        nav_rel, ncx_rel = 'nav.xhtml', 'toc.ncx'
        nav_full = _norm(posixpath.join(opf_dir, nav_rel)) if opf_dir else nav_rel
        ncx_full = _norm(posixpath.join(opf_dir, ncx_rel)) if opf_dir else ncx_rel
        with zipfile.ZipFile(outp, 'w') as zo:
            zo.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip', zipfile.ZIP_STORED)
            for src_name in sorted(names):
                n = _norm(src_name)
                if src_name == 'mimetype' or n in drop:
                    continue
                if n == 'META-INF/container.xml' or n in allowed:
                    zo.writestr(src_name, z.read(src_name), zipfile.ZIP_DEFLATED)
                elif not any(m['href'] == n for m in manifest.values()) \
                     and not n.lower().endswith(('.xhtml', '.html', '.htm', '.xml')):
                    zo.writestr(src_name, z.read(src_name), zipfile.ZIP_DEFLATED)
            first_rel = _rel(nav_full, manifest[keep_ids[0]]['href']) if keep_ids else 'index.xhtml'
            zo.writestr(nav_full, _mk_nav(b['node'], first_rel), zipfile.ZIP_DEFLATED)
            zo.writestr(ncx_full, _mk_ncx(b['node'], b['title'], meta.get('identifier'), ts), zipfile.ZIP_DEFLATED)
            uid = f'urn:uuid:{uuid.uuid4()}'
            lang = meta.get('language') or 'zh'
            creator = f'<dc:creator>{_esc(meta["creator"])}</dc:creator>' if meta.get('creator') else ''
            pub = f'<dc:publisher>{_esc(meta["publisher"])}</dc:publisher>' if meta.get('publisher') else ''
            ids_all = {m['href']: iid for iid, m in manifest.items()}
            cover_line = f'<meta name="cover" content="{_esc(cover_meta_id)}"/>' if cover_meta_id in ids_all else ''
            items = []
            for s in keep_ids:
                m = manifest[s]
                items.append(f'<item id="{_esc(s)}" href="{_esc(_rel(opf_dir, m["href"]))}" media-type="{_esc(m["mt"])}"/>')
            for s in shared:
                m = manifest[s]
                pr = ' properties="cover-image"' if 'cover-image' in m['props'] else ''
                items.append(f'<item id="{_esc(s)}" href="{_esc(_rel(opf_dir, m["href"]))}" media-type="{_esc(m["mt"])}"{pr}/>')
            items.append(f'<item id="nav" href="{_esc(nav_rel)}" media-type="application/xhtml+xml" properties="nav"/>')
            items.append(f'<item id="ncx" href="{_esc(ncx_rel)}" media-type="application/x-dtbncx+xml"/>')
            refs = ''.join(f'<itemref idref="{_esc(s)}"/>' for s in keep_ids)
            opf_xml = (f'<?xml version="1.0" encoding="utf-8"?>\n'
                       f'<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" unique-identifier="bookid" version="{ver}">'
                       f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
                       f'<dc:identifier id="bookid">{_esc(uid)}</dc:identifier>'
                       f'<dc:title>{_esc(b["title"])}</dc:title><dc:language>{_esc(lang)}</dc:language>{creator}{pub}'
                       f'<meta property="dcterms:modified">{ts}</meta>{cover_line}</metadata>'
                       f'<manifest>{"".join(items)}</manifest><spine toc="ncx">{refs}</spine></package>')
            zo.writestr(opf_path, opf_xml, zipfile.ZIP_DEFLATED)
        made.append({'title': b['title'], 'file': outp, 'spine': f"{b['a']+1}-{b['b']}",
                     'chapters': len(leaves(b['node']))})
    return {'omnibus': True, 'reason': reason, 'source_title': meta.get('title', ''), 'books': made}

def _mk_nav(node, first_href):
    def render(nodes):
        if not nodes:
            return ''
        lis = ''.join(f'<li><a href="{_esc(c.href)}">{_esc(c.title)}</a>{render(c.children)}</li>'
                      for c in nodes if c.href)
        return f'<ol>{lis}</ol>'
    sub = node.children or leaves(node)
    return ('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh" xml:lang="zh">'
            '<head><meta charset="utf-8"/><title>目录</title></head><body>'
            f'<nav epub:type="toc" id="toc"><h1>目录</h1>{render(sub)}</nav>'
            f'<nav epub:type="landmarks" hidden="hidden"><h1>指南</h1><ol><li><a epub:type="bodymatter" href="{_esc(first_href)}">正文</a></li></ol></nav>'
            '</body></html>')

def _mk_ncx(node, title, orig_uid, ts):
    def pts(nodes, ctr):
        out = ''
        for c in nodes:
            if not c.href:
                continue
            ctr[0] += 1
            out += (f'<navPoint id="np{ctr[0]}" playOrder="{ctr[0]}">'
                    f'<navLabel><text>{_esc(c.title)}</text></navLabel>'
                    f'<content src="{_esc(c.href)}"/></navPoint>')
            if c.children:
                out += pts(c.children, ctr)
        return out
    uid = orig_uid or f'urn:uuid:{uuid.uuid4()}'
    sub = node.children or leaves(node)
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            f'<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head>'
            f'<meta name="dtb:uid" content="{_esc(uid)}"/><meta name="dtb:depth" content="2"/>'
            f'<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>'
            f'<docTitle><text>{_esc(title)}</text></docTitle><navMap>{pts(sub, [0])}</navMap></ncx>')

def main():
    import argparse
    ap = argparse.ArgumentParser(description='EPUB 合辑拆分')
    ap.add_argument('path')
    ap.add_argument('--out-dir', default='')
    ap.add_argument('--force-split', action='store_true')
    ap.add_argument('--no-prefix', action='store_true')
    a = ap.parse_args()
    out_dir = a.out_dir or os.path.join(os.path.dirname(os.path.abspath(a.path)), '_拆分输出')
    r = split_epub(a.path, out_dir, force=a.force_split, title_prefix=not a.no_prefix)
    print(json.dumps(r, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
