<#
清理附件残留
------------
作用：对比 更新日志/data/*.json 里仍然被日志引用的附件，把 更新日志/files/ 下
不再被任何日志引用的文件（以及空的/多余的日志 ID 目录）列出来。

默认只列出，不动文件；确认无误后加 -Apply 真正删除：

	# 先看看会删什么
	powershell -ExecutionPolicy Bypass -File .\更新日志\清理附件.ps1

	# 确认后执行删除
	powershell -ExecutionPolicy Bypass -File .\更新日志\清理附件.ps1 -Apply

注意：本地还没导出的日志（只在浏览器里）不会被这个脚本看到。
如果刚删完日志还没导出 JSON，先导出推送，再跑本脚本，避免误删仍在用的文件。
#>

param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $here 'data'
$filesDir = Join-Path $here 'files'

if (-not (Test-Path -LiteralPath $dataDir)) { throw "找不到 $dataDir" }
if (-not (Test-Path -LiteralPath $filesDir)) { "没有 files 目录，无需清理"; return }

# 1) 收集仍被引用的附件
#    手动模式：entry.attachDir 为空，文件就在 files/ 根下，键为 <文件名>
#    自动模式：entry.attachDir 有值，键为 <attachDir>/<文件名>
$ref = @{}
$liveDirs = @{}
Get-ChildItem -LiteralPath $dataDir -Filter *.json -File | ForEach-Object {
	$raw = Get-Content -LiteralPath $_.FullName -Raw -Encoding utf8
	if (-not $raw.Trim()) { return }
	$json = $raw | ConvertFrom-Json
	$entries = if ($json -is [System.Array]) { $json } else { $json.entries }
	foreach ($e in $entries) {
		if (-not $e) { continue }
		$id = [string]$e.id
		$sub = [string]$e.attachDir
		if (-not $id) { continue }
		if ($sub) { $liveDirs[$sub] = $true }
		if (-not $e.attachments) { continue }
		foreach ($a in $e.attachments) {
			if (-not $a) { continue }
			$name = [string]$a.name
			if (-not $name) { continue }
			if ($sub) { $ref[$sub + '/' + $name] = $_.Name }
			else { $ref[$name] = $_.Name }
		}
	}
}

# 2) 扫描 files/：自动模式是 <attachDir>/ 子目录，手动模式是根目录下的文件
$orphanFiles = New-Object System.Collections.Generic.List[object]
$orphanDirs = New-Object System.Collections.Generic.List[object]

foreach ($dir in (Get-ChildItem -LiteralPath $filesDir -Directory)) {
	$sub = $dir.Name
	$files = @(Get-ChildItem -LiteralPath $dir.FullName -File)
	$keep = 0
	foreach ($f in $files) {
		if ($ref.ContainsKey($sub + '/' + $f.Name)) { $keep++ }
		else { $orphanFiles.Add($f) }
	}
	if ($keep -eq 0 -and -not $liveDirs.ContainsKey($sub)) { $orphanDirs.Add($dir) }
}

# 根目录下的附件（手动模式）
foreach ($f in (Get-ChildItem -LiteralPath $filesDir -File)) {
	if ($f.Name -eq 'README.md') { continue }
	if (-not $ref.ContainsKey($f.Name)) { $orphanFiles.Add($f) }
}

# 3) 输出 / 删除
if (-not $orphanFiles.Count -and -not $orphanDirs.Count) {
	"没有发现残留附件，files 目录已经很干净。"
	return
}

"发现待清理内容："
foreach ($f in $orphanFiles) { "  文件  " + $f.FullName.Replace($here + '\', '') }
foreach ($d in $orphanDirs) { "  目录  " + $d.FullName.Replace($here + '\', '') + "（整篇日志已不存在）" }

if (-not $Apply) {
	""
	"以上仅为预览，未删除。确认后执行：powershell -ExecutionPolicy Bypass -File .\更新日志\清理附件.ps1 -Apply"
	return
}

foreach ($f in $orphanFiles) { Remove-Item -LiteralPath $f.FullName -Force }
foreach ($d in $orphanDirs) {
	$left = @(Get-ChildItem -LiteralPath $d.FullName -Force)
	if ($left.Count -eq 0) { Remove-Item -LiteralPath $d.FullName -Force }
}
""
"已删除 " + $orphanFiles.Count + " 个文件、" + $orphanDirs.Count + " 个目录。"
