Get-NetTCPConnection -LocalPort 4321,4322 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort,OwningProcess | Format-Table
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'vitest|start' } |
  ForEach-Object { "{0}: {1}" -f $_.ProcessId, $_.CommandLine.Substring(0,[Math]::Min(200,$_.CommandLine.Length)) }