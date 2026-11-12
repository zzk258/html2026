# 把浏览器「导出」下载到的 net*.json / ops*.json，同步进 更新日志/data/
# 由 发布日志.bat 在提交前自动调用；也可单独运行：
#   powershell -ExecutionPolicy Bypass -File .\更新日志\同步导出.ps1 -DryRun
param(
	[string]$Downloads = (Join-Path $env:USERPROFILE 'Downloads'),
	[switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSCommandPath
$dataDir = Join-Path $here 'data'

if (-not (Test-Path -LiteralPath $dataDir)) {
	"找不到数据目录：$dataDir"
	exit 1
}
if (-not (Test-Path -LiteralPath $Downloads)) {
	"下载目录不存在：$Downloads（跳过同步，请手动覆盖 data 下的 json）"
	exit 0
}

$targets = @(
	@{ Module = 'net'; Pattern = 'net*.json' },
	@{ Module = 'ops'; Pattern = 'ops*.json' }
)

foreach ($t in $targets) {
	$dest = Join-Path $dataDir ($t.Module + '.json')
	$cands = @(Get-ChildItem -LiteralPath $Downloads -Filter $t.Pattern -File |
		Where-Object { $_.Name -notlike '*.tmp' } |
		Sort-Object LastWriteTime -Descending)

	if ($cands.Count -eq 0) {
		"跳过 {0}：下载目录里没有 {1}" -f $t.Module, $t.Pattern
		continue
	}

	$src = $cands[0]
	"最新候选：{0}（{1}）" -f $src.Name, $src.LastWriteTime

	if ((Test-Path -LiteralPath $dest) -and ((Get-Item -LiteralPath $dest).LastWriteTime -gt $src.LastWriteTime)) {
		"跳过 {0}：data 里的文件比 {1} 更新" -f $t.Module, $src.Name
		continue
	}

	try {
		$json = Get-Content -LiteralPath $src.FullName -Raw -Encoding utf8 | ConvertFrom-Json -ErrorAction Stop
	} catch {
		"跳过 {0}：{1} 不是有效 JSON" -f $t.Module, $src.Name
		continue
	}

	$entries = @($json.entries)
	if ($entries.Count -eq 0) {
		"跳过 {0}：{1} 里没有日志条目（导出后是空的话多半没点对模块）" -f $t.Module, $src.Name
		continue
	}

	if ($DryRun) {
		"预览 {0}：将用 {1}（{2} 篇）覆盖 data\{0}.json" -f $t.Module, $src.Name, $entries.Count
		continue
	}

	Copy-Item -LiteralPath $src.FullName -Destination $dest -Force
	"已同步 {0}：{1} -> data\{0}.json（{2} 篇）" -f $t.Module, $src.Name, $entries.Count
}
$total = 0
foreach ($m in @('net', 'ops')) {
	$f = Join-Path $dataDir ($m + '.json')
	if (-not (Test-Path -LiteralPath $f)) { continue }
	try { $j = Get-Content -LiteralPath $f -Raw -Encoding utf8 | ConvertFrom-Json } catch { continue }
	$n = @($j.entries).Count
	$total += $n
	"data\{0}.json 现有 {1} 篇" -f $m, $n
}
if ($total -eq 0) {
	"提醒：两边的数据都还是空的，先确认浏览器里点过「导出」并且文件落在下载目录。"
}