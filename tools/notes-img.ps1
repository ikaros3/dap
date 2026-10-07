# 내용정리 그림 변환 — hwpx 에서 꺼낸 그림(wmf/bmp/gif/png)을 브라우저용 png/jpg 로 바꾼다.
#   powershell -File tools/notes-img.ps1 <원본폴더> <출력폴더>
# 원본폴더는 tools/notes-draft.js 가 키 이름(III-01.wmf …)으로 꺼내 둔 곳이다.
# Windows 내장 GDI+ 로 그리므로 따로 설치할 것이 없다 (WMF 도 그대로 읽는다).
# 가로는 원본의 2배까지, 최대 1000px. PNG 와 JPEG 중 작은 쪽을 남긴다.
param([string]$src, [string]$dst)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $dst | Out-Null
$jpg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]86)

Get-ChildItem $src -File | Where-Object { $_.Extension -match '^\.(wmf|emf|bmp|gif|png|jpe?g)$' } | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $w = [Math]::Min(1000, $img.Width * 2)
  if ($w -lt $img.Width -and $img.Width -le 1000) { $w = $img.Width }
  $h = [int][Math]::Round($img.Height * $w / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap([int]$w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.DrawImage($img, 0, 0, [int]$w, $h)
  $g.Dispose(); $img.Dispose()
  $base = Join-Path $dst $_.BaseName
  $bmp.Save("$base.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Save("$base.jpg", $jpg, $ep)
  $bmp.Dispose()
  $p = (Get-Item "$base.png").Length; $j = (Get-Item "$base.jpg").Length
  if ($p -le $j) { Remove-Item "$base.jpg"; $keep = "png" } else { Remove-Item "$base.png"; $keep = "jpg" }
  "{0}.{1}  {2}x{3}  {4:N0}KB" -f $_.BaseName, $keep, $w, $h, ([Math]::Min($p, $j) / 1KB)
}
