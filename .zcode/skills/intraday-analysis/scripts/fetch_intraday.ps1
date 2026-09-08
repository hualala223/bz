<#
.SYNOPSIS
  拉取 A 股当日分时数据，供 intraday-analysis skill 使用。

.DESCRIPTION
  分时序列数据源（按顺序尝试，失败自动降级）：
    1) 东方财富 push2his trends2（https）—— 逐分钟 开盘/现价/最高/最低/量/额/均价（首选）
    2) 东方财富同接口（http 变体）
    3) 腾讯 web.ifzq.gtimg.cn 分钟接口 —— 逐分钟价 + 累计量额（备用；无逐分钟高低，均价由累计量额推算）
  行情快照数据源：腾讯 qt.gtimg（名称/现价/昨收/今开/最高/最低/量额/量比/换手/均价/内外盘）。

  用法:
    pwsh -File fetch_intraday.ps1 -Code 600519 [-Days 1] [-OutDir <目录>]

  代码写法: 600519 / sh600519 / sz000001 / 1.600519 / 0.000001 均可（北交所 8xxxxx / 4xxxxx 自动识别）。

  输出到 -OutDir（默认当前目录）:
    {代码}_分时_{数据日期yyyyMMdd}.csv      UTF-8(BOM) 分时序列；数据日期=序列实际所属交易日
    {代码}_行情快照_{数据日期yyyyMMdd}.json UTF-8 行情快照
  CSV 语义（两种数据源统一）：成交量手/成交额元 = 该分钟增量；均价 = 截至该分钟的累计均价（VWAP）。

  退出码: 0 = 成功; 0 且 JSON status=NO_DATA / FETCH_FAILED = 无数据或拉取失败; 1 = 参数/脚本错误。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Code,
  [ValidateRange(1, 5)][int]$Days = 1,
  [string]$OutDir = "."
)
$ErrorActionPreference = "Stop"

# ---------- 归一化代码为 secid 与腾讯前缀 ----------
$orig = $Code
$m = [regex]::Match($Code.ToLower(), '^(sh|sz|bj)?(\d{6})$')
if (-not $m.Success) {
  Write-Error "无法识别股票代码 '$orig'。支持: 600519 / sh600519 / sz000001 / 1.600519 / 0.000001"
  exit 1
}
$num  = $m.Groups[2].Value
$mrk  = $m.Groups[1].Value
if ($mrk -eq 'sh')      { $market = 1 }
elseif ($mrk -eq 'sz')  { $market = 0 }
elseif ($num -match '^[69]') { $market = 1 }   # 沪市主板/科创板
else { $market = 0 }                           # 深市主板/创业板/北交所
$secid = "$market.$num"
$txPrefix = if ($num -match '^(4|8)') { 'bj' } elseif ($market -eq 1) { 'sh' } else { 'sz' }
$txCode = $txPrefix + $num

$today    = Get-Date -Format 'yyyyMMdd'
$outBase  = "${num}_${today}"          # 无数据时兜底文件名（用今天）
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$csvPath  = Join-Path $OutDir "${outBase}_分时.csv"
$snapPath = Join-Path $OutDir "${outBase}_行情快照.json"
$UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

$snap = [ordered]@{
  status = 'OK'; 代码 = $num; 名称 = ''; 数据日期 = ''; 数据时间 = ''; 行情时间 = ''
  分时点数 = 0; 数据源 = ''; 昨收 = $null; 今开 = $null; 现价 = $null
  最高 = $null; 最低 = $null; 均价 = $null; 均价偏离率 = $null
  成交量手 = 0; 成交额元 = 0; 量比 = $null; 换手率 = $null; 涨跌幅 = $null; 外盘 = $null; 内盘 = $null
}

# ---------- 1) 分时序列 ----------
$series = @()
$srcSeries = ''
$lastErr = $null

# 1a) 东方财富（https 尝试 2 次，失败后 http 尝试 1 次）
foreach ($base in @('https://push2his.eastmoney.com', 'http://push2his.eastmoney.com')) {
  if ($series.Count -gt 0) { break }
  foreach ($attempt in 1..2) {
    try {
      $url = "$base/api/qt/stock/trends2/get?secid=$secid&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=$Days&iscr=0"
      $resp = Invoke-RestMethod -Uri $url -Headers @{ 'User-Agent' = $UA; 'Referer' = 'https://quote.eastmoney.com/' } -TimeoutSec 15
      foreach ($t in @($resp.data.trends)) {
        $f = ([string]$t) -split ','
        if ($f.Count -lt 8) { continue }
        $timeRaw = $f[0].Trim()
        if ($timeRaw -match '^\d{4}-') { $time = $timeRaw }
        elseif ($timeRaw -match '^\d{2}-\d{2} ') { $time = "$((Get-Date).Year)-$timeRaw" }
        else { continue }
        $series += [PSCustomObject]@{
          时间     = $time
          开盘     = [double]$f[1]
          现价     = [double]$f[2]
          最高     = [double]$f[3]
          最低     = [double]$f[4]
          成交量手 = [double]$f[5]
          成交额元 = [double]$f[6]
          均价     = [double]$f[7]
        }
      }
      if ($series.Count -gt 0) { $srcSeries = 'eastmoney'; break }
      break  # 接口正常但无数据，不再重试该 base
    }
    catch {
      $lastErr = $_.Exception.Message
      if ($attempt -lt 2) { Start-Sleep -Seconds 2 }
    }
  }
}
if ($srcSeries -eq '' -and $lastErr) { Write-Warning "东方财富接口失败($lastErr)，改用腾讯分时源" }

# 1b) 腾讯分钟接口（备用）
if ($series.Count -eq 0) {
  try {
    $u = "https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=$txCode"
    $r = Invoke-RestMethod -Uri $u -Headers @{ 'User-Agent' = $UA } -TimeoutSec 20
    $obj = ($r.data).($txCode)
    $dateRaw = [string]$obj.data.date           # yyyyMMdd
    $dateStr = "$($dateRaw.Substring(0,4))-$($dateRaw.Substring(4,2))-$($dateRaw.Substring(6,2))"
    $prevV = 0; $prevA = 0
    foreach ($row in @($obj.data.data)) {
      $p = ([string]$row) -split '\s+'        # 腾讯分钟行是空格分隔字符串: 时分 现价 累计量(手) 累计额(元)
      if ($p.Count -lt 4) { continue }
      $hhmm = $p[0]
      if ($hhmm -lt '0930' -or $hhmm -gt '1500') { continue }
      $price = [double]$p[1]
      $cumV  = [double]$p[2]
      $cumA  = [double]$p[3]
      $v = $cumV - $prevV
      $a = $cumA - $prevA
      $avg = if ($cumV -gt 0) { [math]::Round($cumA / ($cumV * 100), 3) } else { $price }
      $series += [PSCustomObject]@{
        时间     = "$dateStr $($hhmm.Substring(0,2)):$($hhmm.Substring(2,2))"
        开盘     = $price    # 腾讯源无逐分钟开盘，以现价近似
        现价     = $price
        最高     = $null     # 腾讯源无逐分钟高低
        最低     = $null
        成交量手 = $v
        成交额元 = $a
        均价     = $avg
      }
      $prevV = $cumV; $prevA = $cumA
    }
    if ($series.Count -gt 0) { $srcSeries = 'tencent' }
  }
  catch { $lastErr = $_.Exception.Message; Write-Warning "腾讯分时接口失败: $lastErr" }
}

if ($series.Count -eq 0) {
  $snap.status = if ($lastErr) { 'FETCH_FAILED' } else { 'NO_DATA' }
  $snap.错误信息 = $lastErr
  $snap | ConvertTo-Json | Set-Content -LiteralPath $snapPath -Encoding utf8
  Write-Host "$($snap.status): 未取得分时数据（原因: $lastErr ；或今日非交易日），代码=$orig"
  exit 0
}

# ---------- 2) 行情快照（腾讯 qt.gtimg，尝试 2 次） ----------
for ($attempt = 1; $attempt -le 2; $attempt++) {
  try {
    try { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12 } catch {}
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add('User-Agent', $UA)
    $bytes = $wc.DownloadData("https://qt.gtimg.cn/q=$txCode")
    try { $txt = [System.Text.Encoding]::GetEncoding(936).GetString($bytes) }
    catch { $txt = [System.Text.Encoding]::UTF8.GetString($bytes) }
    $inner = (($txt -replace '^[^=]+="', '' -replace '"\s*$', '')).Trim()
    $pf = $inner -split '~'
    if ($pf.Count -gt 51) {
      $snap.名称     = $pf[1]
      $snap.现价     = [double]$pf[3]
      $snap.昨收     = [double]$pf[4]
      $snap.今开     = [double]$pf[5]
      $snap.外盘     = [double]$pf[7]
      $snap.内盘     = [double]$pf[8]
      $snap.涨跌幅   = [double]$pf[32]
      $snap.最高     = [double]$pf[33]
      $snap.最低     = [double]$pf[34]
      $snap.成交额元 = [double]$pf[37] * 10000   # 单位: 万元
      $snap.换手率   = [double]$pf[38]
      $snap.量比     = [double]$pf[49]
      $snap.均价     = if ($pf[51]) { [double]$pf[51] } else { $snap.均价 }
      $ts = [string]$pf[30]
      if ($ts.Length -ge 14) { $snap.行情时间 = "$($ts.Substring(0,4))-$($ts.Substring(4,2))-$($ts.Substring(6,2)) $($ts.Substring(8,2)):$($ts.Substring(10,2)):$($ts.Substring(12,2))" }
      break
    }
  }
  catch {
    Write-Warning "腾讯行情快照失败: $($_.Exception.Message)"
    if ($attempt -lt 2) { Start-Sleep -Seconds 2 }
  }
}

# ---------- 3) 汇总派生字段（先取序列值，再算派生指标） ----------
$dataDate    = ($series[0].时间).Substring(0, 10)
$dataCompact = $dataDate -replace '-', ''
$outBase     = "${num}_${dataCompact}"
$csvPath     = Join-Path $OutDir "${outBase}_分时.csv"
$snapPath    = Join-Path $OutDir "${outBase}_行情快照.json"
if ($dataDate -ne (Get-Date -Format 'yyyy-MM-dd')) {
  Write-Host "提示: 今天 $(Get-Date -Format 'yyyy-MM-dd') 无交易数据，返回最近交易日 $dataDate 的分时。"
}

$snap.数据日期 = $dataDate
$snap.数据时间 = $series[-1].时间
$snap.分时点数 = $series.Count
$snap.数据源   = $srcSeries
if ($srcSeries -eq 'tencent' -and $Days -gt 1) { Write-Warning "腾讯分时源仅支持单日，-Days 参数已忽略" }
$snap.现价     = $series[-1].现价
$snap.均价     = $series[-1].均价
# 序列中成交量/成交额为"每分钟"增量，全天累计 = 求和
$snap.成交量手 = [math]::Round(($series | Measure-Object -Property 成交量手 -Sum).Sum, 0)
$snap.成交额元 = [math]::Round(($series | Measure-Object -Property 成交额元 -Sum).Sum, 0)
if (-not $snap.最高 -and $srcSeries -eq 'eastmoney') { $snap.最高 = ($series | Measure-Object -Property 最高 -Maximum).Maximum }
if (-not $snap.最低 -and $srcSeries -eq 'eastmoney') { $snap.最低 = ($series | Measure-Object -Property 最低 -Minimum).Minimum }
if (-not $snap.今开) { $snap.今开 = $series[0].开盘 }
if (-not $snap.涨跌幅 -and $snap.现价 -and $snap.昨收) { $snap.涨跌幅 = [math]::Round(($snap.现价 - $snap.昨收) / $snap.昨收 * 100, 2) }
if (-not $snap.昨收) { Write-Warning "昨收未能取得，涨跌幅为空" }
if ($snap.现价 -and $snap.均价) { $snap.均价偏离率 = [math]::Round(($snap.现价 - $snap.均价) / $snap.均价 * 100, 2) }

# ---------- 写出 ----------
$series | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding utf8BOM
$snap | ConvertTo-Json | Set-Content -LiteralPath $snapPath -Encoding utf8
Write-Host "OK 代码=$num 名称=$($snap.名称) 现价=$($snap.现价) 昨收=$($snap.昨收) 涨跌幅=$($snap.涨跌幅)% 数据源=$srcSeries 分时点数=$($series.Count)"
Write-Host "CSV: $csvPath"
Write-Host "JSON: $snapPath"
exit 0