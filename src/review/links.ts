/**
 * 出链收集（ticket 170）：一级出链 = 正文 links + frontmatterLinks，
 * 经链接解析还原为 vault 文件；断链与非 .md 丢弃、按解析结果路径去重。
 * 纯函数：文件缓存与解析器注入，不触 Obsidian 运行时（对齐 getFileCache/getFirstLinkpathDest 的最小面）。
 */

/** 批量加入所需的目标文件最小面（TFile 结构子集） */
export interface LinkTarget {
  path: string;
  basename: string;
  extension: string;
}

/** getFileCache 结果中与链接相关的最小面（正文 links + frontmatter links） */
export interface OutgoingLinkCache {
  links?: { link: string }[] | null;
  frontmatterLinks?: { link: string }[] | null;
}

/** 链接解析最小面（getFirstLinkpathDest(linkpath, sourcePath)） */
export type LinkResolver = (linkpath: string, sourcePath: string) => LinkTarget | null;

/** 收集一级出链：正文 + frontmatter 链接合并，断链/非 .md/重复（按解析后路径）丢弃 */
export function collectOutgoingLinks(cache: OutgoingLinkCache | null, sourcePath: string, resolve: LinkResolver): LinkTarget[] {
  const records = [...(cache?.links ?? []), ...(cache?.frontmatterLinks ?? [])];
  const seen = new Set<string>();
  const out: LinkTarget[] = [];
  for (const rec of records) {
    const dest = resolve(rec.link, sourcePath);
    if (!dest || dest.extension !== 'md' || seen.has(dest.path)) continue;
    seen.add(dest.path);
    out.push(dest);
  }
  return out;
}
