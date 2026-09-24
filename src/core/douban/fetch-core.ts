/**
 * 豆瓣抓取共享纯函数（票 301 / ADR-0130）：自 cinema/douban-fetcher 上移单点维护。
 * 动机：书架域接入书籍豆瓣抓取后，「缺失才填」frontmatter 写入口径、统一搜索页解析、
 * 风控检测等属数据正确性口径——两域各自持有必然漂移，上沉 core（ADR-0002 依赖方向允许）。
 * 队列骨架不在此抽（与各域 state 耦合重，两域各自持有，见各域 douban-queue）。
 * 纯逻辑零依赖（node 环境可测）；HTTP/写盘等副作用由各域执行器注入。
 */

/** HTTP GET 文本通道（requestUrl 适配由调用方注入；null = 网络层失败/超时） */
export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<string | null>;
/** 二进制下载通道（海报/封面落盘前取流） */
export type DownloadBinary = (url: string, headers?: Record<string, string>) => Promise<ArrayBuffer | null>;

// ---------- 搜索页解析（照搬 cinema/douban-client.js 正则口径；统一搜索页 cat 参数无关结构） ----------

export interface DoubanSearchResult {
  title: string;
  detailUrl: string;
  posterUrl: string;
}

/** 纯函数：解析豆瓣统一搜索页 HTML：result 块 → title/detailUrl/posterUrl。
 *  电影（cat=1002）与图书（cat=1001）共用同一套统一搜索页结构（票 301 实测同构） */
export function parseSearchResults(html: string): DoubanSearchResult[] {
  const results: DoubanSearchResult[] = [];
  const itemRegex = /class="result"[\s\S]*?<div class="pic">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<div class="title">[\s\S]*?<a[^>]*>([^<]+)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    const posterUrl = match[2];
    const title = match[3].trim();
    // 搜索结果链接是 link2 跳转包装，url= 参数里才是真实 subject 地址
    const urlMatch = rawUrl.match(/url=([^&]+)/);
    const detailUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
    results.push({ title, detailUrl, posterUrl });
  }
  return results;
}

/** 纯函数：搜索响应是否为风控拦截页——响应过短或无搜索结果结构（正常搜索页 >20KB 且含 result 块） */
export function searchLooksBlocked(html: string | null): boolean {
  if (!html) return true;
  if (html.length < 8000) return true;
  // 正常搜索页必然存在结果块或「没有找到」的空态结构；风控拦截页两者皆无
  return !html.includes('class="result"') && !html.includes('没有找到') && !html.includes('没有相关的搜索结果');
}

/** 纯函数：海报/封面小图 URL 升高清（电影 s_ratio_poster → l_ratio_poster） */
export function upgradePosterUrl(url: string): string {
  return url.replace('s_ratio_poster', 'l_ratio_poster');
}

/** 纯函数：列表值归一化（影院审查 C2）——ApiZero 的逗号分隔值统一为 ` / ` 切分口径 */
export function normalizeListValue(val: string): string {
  return val.replace(/[,，]\s*/g, ' / ');
}

/** 从详情页 URL 提取 subject ID（movie/book subject 通用） */
export function extractSid(detailUrl: string): string | null {
  const m = detailUrl.match(/subject\/(\d+)/);
  return m ? m[1] : null;
}

// ---------- frontmatter 写入（影院审查 C8/C9「缺失才填」口径，票 301 起两域共用） ----------

/** 字段值形态：string = 已有则原地更新；{ value, ifMissing } = 仅当字段缺失时写入
 *  （防重抓覆盖用户手工修正，缺失才填）；quote = 强制双引号包裹（ISBN 等标识符
 *  防 YAML number 化丢前导零，票 301） */
export type FmFieldSpec = string | { value: string; ifMissing: boolean; quote?: boolean };

/** frontmatter 更新（纯函数，行级口径）：
 *  string 字段已有则原地更新、新字段插到 tags 列表后；ifMissing 字段已有则跳过；空值跳过。
 *  「已有」判断基于本函数收到的 content——调用方传入 process 回调的 fresh 内容即天然完成
 *  「写回前基于最新内容复核」（C8） */
export function updateFrontmatterFields(content: string, fields: Record<string, FmFieldSpec>): string {
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fmMatch) {
    const fmLines = ['---'];
    for (const [k, spec] of Object.entries(fields)) {
      const v = typeof spec === 'string' ? spec : spec.value;
      if (v) fmLines.push(`${k}: ${formatYamlValue(v, typeof spec !== 'string' && spec.quote === true)}`);
    }
    fmLines.push('---');
    return fmLines.join('\n') + '\n' + content;
  }
  const header = fmMatch[1];
  const footer = fmMatch[3];
  const rest = content.slice(fmMatch[0].length);
  const lines = fmMatch[2].split(/\r?\n/);

  let insertIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s+- /)) insertIdx = i + 1;
  }
  const existingKeys = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^([^:]+):/);
    if (m) existingKeys.add(m[1].trim());
  }
  const newLines: string[] = [];
  for (const [key, spec] of Object.entries(fields)) {
    const val = typeof spec === 'string' ? spec : spec.value;
    if (!val || val === '') continue;
    if (existingKeys.has(key)) {
      // 缺失才填（C8/C9）：已有值不动，保留用户手改与存量
      if (typeof spec !== 'string' && spec.ifMissing) continue;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(new RegExp(`^${key}:`))) {
          lines[i] = `${key}: ${formatYamlValue(val, typeof spec !== 'string' && spec.quote === true)}`;
          break;
        }
      }
    } else {
      newLines.push(`${key}: ${formatYamlValue(val, typeof spec !== 'string' && spec.quote === true)}`);
    }
  }
  if (newLines.length > 0) lines.splice(insertIdx, 0, ...newLines);
  return header + lines.join('\n') + footer + rest;
}

/** YAML 值序列化（照搬 formatYamlValue）：含特殊字符/空格双引号包裹并转义；forceQuote
 *  强制包裹（纯数字标识符防 YAML number 化，票 301）。
 *  换行先行单行化（审查 C3）：裸 \n/\r 进 frontmatter 会破坏 YAML 解析 */
function formatYamlValue(val: string, forceQuote = false): string {
  let s = String(val);
  if (/[\r\n]/.test(s)) s = s.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ');
  if (forceQuote || /[:"\-#[\]{}|>'?]/.test(s) || s.includes(' ')) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
}

/** 正文 frontmatter 后插入图片 embed（纯函数；已存在跳过）。
 *  兼容 FM 闭合 --- 恰为文件末行（无尾换行）形态（审查 C4） */
export function insertPosterEmbed(content: string, posterPath: string): string {
  const embedLink = `![[${posterPath}]]`;
  if (content.includes(embedLink)) return content;
  const fmMatch = content.match(/^(---\r?\n[\s\S]*?\r?\n---)(\r?\n)?/);
  if (fmMatch) {
    if (fmMatch[2]) {
      // FM 后已有换行：embed 紧跟 FM 闭合行
      return fmMatch[0] + embedLink + '\n' + content.slice(fmMatch[0].length);
    }
    // FM 即文件末尾（无尾换行）：先补换行再插 embed，结果首字符仍是 `---`
    return fmMatch[1] + '\n' + embedLink + '\n' + content.slice(fmMatch[1].length);
  }
  return embedLink + '\n' + content;
}

/** frontmatter 行级字段读取（剥引号；空值 null——队列 fetchComplete 同口径） */
export function fmFieldValue(content: string, key: string): string | null {
  const m = content.match(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[ \\t]*(.*)$`, 'm'));
  if (!m) return null;
  const v = m[1].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
  return v || null;
}

/** 文件名安全化（写盘名）：路径非法字符替换下划线（两域封面/海报落盘共用） */
export function safeFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

/**
 * 重抓前置清理（纯函数，票 301 追加决策 Q15）：删除 frontmatter 中指定键的整行，
 * 并删除正文中引用指定目录（子串匹配）的 embed 行（`![[CONFIG/...]]`）。
 * 用于「抓错了重新抓」：清掉豆瓣来源字段与旧封面/海报 embed，重抓后按缺失才填重新落。
 * 注意：调用方负责排除用户自有字段（如 md 书的 作者/封面 可能早于抓取存在——
 * 键清单由各域调用方给定，本函数不做语义判断）。
 * 无 frontmatter / 无匹配行时原样返回。
 */
export function clearDoubanContent(content: string, fmKeys: string[], embedFolderSubstrings: string[]): string {
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  let next = content;
  if (fmMatch) {
    const keySet = new Set(fmKeys);
    const lines = fmMatch[2].split(/\r?\n/).filter((line) => {
      const m = line.match(/^([^:]+):/);
      return !(m && keySet.has(m[1].trim()));
    });
    next = fmMatch[1] + lines.join('\n') + fmMatch[3] + content.slice(fmMatch[0].length);
  }
  if (embedFolderSubstrings.length > 0) {
    next = next
      .split('\n')
      .filter((line) => {
        const m = line.match(/^!\[\[([^\]]+)\]\]\s*$/);
        return !(m && embedFolderSubstrings.some((sub) => m[1].includes(sub)));
      })
      .join('\n');
  }
  return next;
}
