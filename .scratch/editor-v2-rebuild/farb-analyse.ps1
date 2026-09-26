# Farb-Analyse (nur lesend).
#
# Zweck: aus einem Bild die tragende Palette messen statt schaetzen.
# Verfahren: Bitmap ueber LockBits in ein Byte-Array kopieren, jedes n-te Pixel
# auf 5 Bit je Kanal quantisieren, Buckets zaehlen. Je Bucket wird der
# MITTELWERT der echten Pixel ausgegeben (also der wahre Farbwert, nicht die
# Quantisierungsstufe), dazu Flaechenanteil und Schwerpunkt in Prozent.
# Der Schwerpunkt sagt, WO die Farbe sitzt — damit laesst sie sich benennen.
#
# Aufruf:  powershell.exe -NoProfile -ExecutionPolicy Bypass -File farb-analyse.ps1 -Paths a.png,b.jpg -Step 3 -Top 32

param(
  [Parameter(Mandatory = $true)][string[]]$Paths,
  [int]$Step = 3,
  [int]$Top = 32
)

Add-Type -AssemblyName System.Drawing

function Get-Bucket([int]$r, [int]$g, [int]$b) {
  return (($r -shr 3) -shl 10) -bor (($g -shr 3) -shl 5) -bor ($b -shr 3)
}

function Analyze([string]$Path, [int]$Step, [int]$Top) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Output "FEHLT: $Path"
    return
  }

  $bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $Path).Path)
  $w = $bmp.Width
  $h = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $fmt = [System.Drawing.Imaging.PixelFormat]::Format24bppRgb

  # Kopie in bekannten Pixelaufbau, damit Stride und Kanalreihenfolge feststehen.
  $clone = $bmp.Clone($rect, $fmt)
  $bmp.Dispose()

  $data = $clone.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $fmt)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $clone.UnlockBits($data)
  $clone.Dispose()

  $buckets = @{}
  $total = 0

  for ($y = 0; $y -lt $h; $y += $Step) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x += $Step) {
      $i = $row + $x * 3
      $b = [int]$bytes[$i]
      $g = [int]$bytes[$i + 1]
      $r = [int]$bytes[$i + 2]
      $key = Get-Bucket $r $g $b
      $total++
      $e = $buckets[$key]
      if ($null -eq $e) {
        $buckets[$key] = [pscustomobject]@{
          n = 1; r = $r; g = $g; b = $b; x = [long]$x; y = [long]$y
        }
      } else {
        $e.n++; $e.r += $r; $e.g += $g; $e.b += $b; $e.x += $x; $e.y += $y
      }
    }
  }

  Write-Output ""
  Write-Output "=============================================================="
  Write-Output "DATEI   : $Path"
  Write-Output "GROESSE : ${w} x ${h}   Stichprobe: $total Pixel (jedes $Step.)"
  Write-Output "=============================================================="
  Write-Output ("{0,6}  {1,-9}  {2,-22}  {3,10}  {4}" -f "Anteil", "Hex", "RGB", "Ort x/y %", "Flaeche")
  Write-Output ("{0,6}  {1,-9}  {2,-22}  {3,10}  {4}" -f "------", "--------", "----------------------", "---------", "-------")

  # Nach Haeufigkeit: die tragenden Flaechen.
  Write-Output "--- nach Flaeche (die tragenden Farben) ---"
  $sorted = $buckets.Values | Sort-Object -Property n -Descending | Select-Object -First $Top
  foreach ($e in $sorted) {
    $mr = [int][math]::Round($e.r / $e.n)
    $mg = [int][math]::Round($e.g / $e.n)
    $mb = [int][math]::Round($e.b / $e.n)
    $hex = "#{0:x2}{1:x2}{2:x2}" -f $mr, $mg, $mb
    $share = [math]::Round(100 * $e.n / $total, 2)
    $cx = [math]::Round(100 * ($e.x / $e.n) / $w, 1)
    $cy = [math]::Round(100 * ($e.y / $e.n) / $h, 1)
    Write-Output ("{0,5}%  {1,-9}  rgb({2,3} {3,3} {4,3})          {5,4}/{6,-4}  n={7}" -f $share, $hex, $mr, $mg, $mb, $cx, $cy, $e.n)
  }

  # Nach Buntheit: was traegt Bedeutung (Akzent, Status), nicht Flaeche.
  Write-Output ""
  Write-Output "--- nach Saettigung (die Bedeutungstraeger) ---"
  $vivid = $buckets.Values |
    Where-Object { $_.n -ge 40 } |
    ForEach-Object {
      $r2 = $_.r / $_.n; $g2 = $_.g / $_.n; $b2 = $_.b / $_.n
      $max = [math]::Max($r2, [math]::Max($g2, $b2))
      $min = [math]::Min($r2, [math]::Min($g2, $b2))
      $sat = if ($max -eq 0) { 0 } else { ($max - $min) / $max }
      [pscustomobject]@{ e = $_; sat = $sat }
    } |
    Sort-Object -Property sat -Descending |
    Select-Object -First 18

  foreach ($v in $vivid) {
    $e = $v.e
    $mr = [int][math]::Round($e.r / $e.n)
    $mg = [int][math]::Round($e.g / $e.n)
    $mb = [int][math]::Round($e.b / $e.n)
    $hex = "#{0:x2}{1:x2}{2:x2}" -f $mr, $mg, $mb
    $share = [math]::Round(100 * $e.n / $total, 2)
    $cx = [math]::Round(100 * ($e.x / $e.n) / $w, 1)
    $cy = [math]::Round(100 * ($e.y / $e.n) / $h, 1)
    $satp = [math]::Round(100 * $v.sat)
    Write-Output ("{0,5}%  {1,-9}  rgb({2,3} {3,3} {4,3})  S={5,3}%   {6,4}/{7,-4}  n={8}" -f $share, $hex, $mr, $mg, $mb, $satp, $cx, $cy, $e.n)
  }

  # Die dunkelsten und die hellsten Pixel: Textfarbe und Grund.
  $dark = $buckets.Values | Where-Object { $_.n -ge 200 } | Sort-Object -Property { ($_.r + $_.g + $_.b) / $_.n } | Select-Object -First 6
  Write-Output ""
  Write-Output "--- die dunkelsten Flaechen (Textkandidaten) ---"
  foreach ($e in $dark) {
    $mr = [int][math]::Round($e.r / $e.n); $mg = [int][math]::Round($e.g / $e.n); $mb = [int][math]::Round($e.b / $e.n)
    $hex = "#{0:x2}{1:x2}{2:x2}" -f $mr, $mg, $mb
    Write-Output ("        {0,-9}  rgb({1,3} {2,3} {3,3})  n={4}" -f $hex, $mr, $mg, $mb, $e.n)
  }
}

foreach ($p in $Paths) { Analyze $p $Step $Top }
