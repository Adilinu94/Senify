$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
foreach ($p in $procs) {
  if ($p.ProcessId -in 39560,29224,4776) {
    "{0} parent={1}: {2}" -f $p.ProcessId, $p.ParentProcessId, $p.CommandLine.Substring(0,[Math]::Min(120,$p.CommandLine.Length))
  }
}