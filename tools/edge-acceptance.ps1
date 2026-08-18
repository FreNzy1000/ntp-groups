Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NtpTraverseWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hDlg, int id);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  public static IntPtr MakeLParam(int x,int y) { return (IntPtr)((y << 16) | (x & 0xffff)); }
  public static IntPtr FindByClass(IntPtr parent, string className) {
    IntPtr found=IntPtr.Zero;
    EnumChildWindows(parent,(h,l)=>{
      var sb=new StringBuilder(256);
      GetClassName(h,sb,sb.Capacity);
      if(sb.ToString()==className && IsWindowVisible(h)){found=h;return false;}
      return true;
    },IntPtr.Zero);
    return found;
  }
  public static void ClickWindowCenter(IntPtr hWnd) {
    RECT r;
    if(!GetWindowRect(hWnd,out r)) return;
    int x=Math.Max(1,(r.Right-r.Left)/2), y=Math.Max(1,(r.Bottom-r.Top)/2);
    var lp=MakeLParam(x,y);
    PostMessage(hWnd,0x0201,(IntPtr)1,lp);
    PostMessage(hWnd,0x0202,IntPtr.Zero,lp);
  }
}
'@

$edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$profile=Join-Path $env:TEMP 'ntp-edge-traverse'
$port=9465
$project='D:\dev\NTP-Groups'
$thisPcName=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('0K3RgtC+0YIg0LrQvtC80L/RjNGO0YLQtdGA'))

Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
$proc=Start-Process -FilePath $edge -ArgumentList @("--user-data-dir=$profile","--remote-debugging-port=$port",'--force-renderer-accessibility','--no-first-run','--no-default-browser-check') -PassThru
Start-Sleep -Seconds 3

function Get-Picker {
  $root=[System.Windows.Automation.AutomationElement]::RootElement
  $idCond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1')
  foreach($candidate in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$idCond)){
    try{
      $r=$candidate.Current.BoundingRectangle
      if(-not $candidate.Current.IsOffscreen -and $r.Width -gt 70 -and $r.Width -lt 180 -and $r.Height -gt 20 -and $r.Height -lt 50 -and $r.Y -gt 300){
        $walker=[System.Windows.Automation.TreeWalker]::ControlViewWalker
        $d=$candidate
        while($d -and $d.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window){$d=$walker.GetParent($d)}
        if($d){return [pscustomobject]@{Dialog=$d;Select=$candidate}}
      }
    }catch{}
  }
  return $null
}

function Get-Address($dialog){
  $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1001')
  foreach($el in $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)){
    try{if(-not $el.Current.IsOffscreen){return $el.Current.Name}}catch{}
  }
  return ''
}

function Get-ListNames($dialog){
  $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ListItem)
  $names=@()
  foreach($el in $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)){
    try{if(-not $el.Current.IsOffscreen -and $el.Current.Name){$names+=$el.Current.Name}}catch{}
  }
  return $names
}

function Get-ListItem($dialog,[string]$name){
  $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ListItem)
  foreach($el in $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)){
    try{if(-not $el.Current.IsOffscreen -and $el.Current.Name -ieq $name){return $el}}catch{}
  }
  return $null
}

function Invoke-ListItem($el){
  if(-not $el){return $false}
  $p=$null
  if($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$p)){
    $p.Invoke()
    return $true
  }
  $p=$null
  if($el.TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern,[ref]$p)){
    $p.DoDefaultAction()
    return $true
  }
  return $false
}

function Show-State([string]$label,$dialog){
  $items=(Get-ListNames $dialog | Select-Object -First 25) -join '|'
  Write-Output ($label+' address=['+(Get-Address $dialog)+'] items='+$items)
}

function Invoke-TempEdgeNewTab([string]$profilePath){
  $tempPids=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.Name -eq 'msedge.exe' -and $_.CommandLine -like ('*'+$profilePath+'*')} | ForEach-Object {[int]$_.ProcessId})
  if($tempPids.Count -eq 0){return $false}
  $root=[System.Windows.Automation.AutomationElement]::RootElement
  $winCond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Window)
  $btnCond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'view_28')
  foreach($win in $root.FindAll([System.Windows.Automation.TreeScope]::Children,$winCond)){
    try{
      if($win.Current.ClassName -ne 'Chrome_WidgetWin_1'){continue}
      if($tempPids -notcontains [int]$win.Current.ProcessId){continue}
      $btn=$win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$btnCond)
      if(-not $btn){continue}
      $p=$null
      if($btn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$p)){
        $p.Invoke()
        return $true
      }
    }catch{}
  }
  return $false
}

try{
  $u="http://127.0.0.1:$port/json/new?"+[uri]::EscapeDataString('edge://extensions/')
  Invoke-RestMethod -Method Put -Uri $u | Out-Null
  Start-Sleep -Seconds 2
  node "$project\tools\.edge-open-picker.mjs" $port | Write-Output
  Start-Sleep -Seconds 1

  $picker=Get-Picker
  if(-not $picker){throw 'Folder picker not found'}
  $dialog=$picker.Dialog
  $dialogHwnd=[IntPtr]$dialog.Current.NativeWindowHandle
  Show-State 'START' $dialog

  $upBand=[NtpTraverseWin32]::FindByClass($dialogHwnd,'UpBand')
  if($upBand -eq [IntPtr]::Zero){throw 'UpBand missing'}
  $up=[NtpTraverseWin32]::FindByClass($upBand,'ToolbarWindow32')
  if($up -eq [IntPtr]::Zero){throw 'Up toolbar missing'}

  $reached=$false
  foreach($step in 1..8){
    $address=Get-Address $dialog
    if($address -like '*NTP-Groups*'){$reached=$true;break}
    $names=Get-ListNames $dialog

    $item=Get-ListItem $dialog 'NTP-Groups'
    if($item){
      if(-not (Invoke-ListItem $item)){throw 'NTP-Groups folder has no invokable UIA action'}
      Start-Sleep -Milliseconds 800
      Show-State ('STEP_'+$step+'_NTP') $dialog
      continue
    }

    $item=Get-ListItem $dialog 'dev'
    if($item){
      if(-not (Invoke-ListItem $item)){throw 'dev folder has no invokable UIA action'}
      Start-Sleep -Milliseconds 800
      Show-State ('STEP_'+$step+'_DEV') $dialog
      continue
    }

    $drive=$null
    foreach($name in $names){if($name -like '*D:*'){$drive=Get-ListItem $dialog $name;break}}
    if($drive){
      if(-not (Invoke-ListItem $drive)){throw 'D drive has no invokable UIA action'}
      Start-Sleep -Milliseconds 800
      Show-State ('STEP_'+$step+'_D') $dialog
      continue
    }

    $item=Get-ListItem $dialog $thisPcName
    if($item){
      if(-not (Invoke-ListItem $item)){throw 'This PC item has no invokable UIA action'}
      Start-Sleep -Milliseconds 800
      Show-State ('STEP_'+$step+'_PC') $dialog
      continue
    }

    [NtpTraverseWin32]::ClickWindowCenter($up)
    Start-Sleep -Milliseconds 700
    Show-State ('STEP_'+$step+'_UP') $dialog
  }
  if(-not $reached -and (Get-Address $dialog) -like '*NTP-Groups*'){$reached=$true}
  if(-not $reached){throw ('Picker could not reach NTP-Groups; final address='+(Get-Address $dialog))}
  Show-State 'NTP_READY' $dialog

  $ok=[NtpTraverseWin32]::GetDlgItem($dialogHwnd,1)
  if($ok -eq [IntPtr]::Zero){throw 'Select Folder button missing'}
  [NtpTraverseWin32]::SendMessage($ok,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 1800

  $stateRaw=(node "$project\tools\.edge-state.mjs" $port | Out-String).Trim()
  Write-Output $stateRaw
  $state=$stateRaw | ConvertFrom-Json
  $match=$state.items | Where-Object {$_.name -eq 'NTP Groups'} | Select-Object -First 1
  if(-not $match){throw 'NTP Groups not registered after selecting folder'}
  Write-Output ('REGISTERED id='+$match.id+' state='+$match.state+' location='+$match.location)

  $ntpTarget=$null
  $overrideActive=$false
  $invoked=Invoke-TempEdgeNewTab $profile
  Write-Output ('REAL_NEW_TAB_INVOKED='+$invoked)
  if($invoked){
    Start-Sleep -Milliseconds 1500
    $domRaw=(node "$project\tools\.edge-newtab-dom-probe.mjs" $port | Out-String).Trim()
    Write-Output $domRaw
    if($LASTEXITCODE -ne 0){throw 'Edge New Tab DOM probe failed'}
    $domProbe=$domRaw | ConvertFrom-Json
    $overrideActive=[bool]$domProbe.overrideActive
    $targets=Invoke-RestMethod "http://127.0.0.1:$port/json/list"
    Write-Output 'TARGET_PROBE=real-new-tab-button'
    foreach($t in ($targets | Where-Object {$_.type -eq 'page'})){
      Write-Output ('PAGE title=['+$t.title+'] url=['+$t.url+']')
    }
  }
  if(-not $overrideActive){
    foreach($candidateUrl in @('chrome://newtab/','edge://newtab/')){
      $u2="http://127.0.0.1:$port/json/new?"+[uri]::EscapeDataString($candidateUrl)
      Invoke-RestMethod -Method Put -Uri $u2 | Out-Null
      Start-Sleep -Milliseconds 1200
      $domRaw=(node "$project\tools\.edge-newtab-dom-probe.mjs" $port | Out-String).Trim()
      Write-Output $domRaw
      if($LASTEXITCODE -eq 0){
        $domProbe=$domRaw | ConvertFrom-Json
        if([bool]$domProbe.overrideActive){$overrideActive=$true;break}
      }
    }
  }
  Write-Output ('NEW_TAB_OVERRIDE_ACTIVE='+$overrideActive)
  if(-not $overrideActive){throw 'Edge New Tab DOM is not controlled by NTP Groups'}
  Write-Output ('EDGE_ACCEPTANCE_RUNTIME_STAGE port='+$port+' profile='+$profile+' id='+$match.id)

  node "$project\tools\.edge-acceptance-attached.mjs" $port
  if($LASTEXITCODE -ne 0){throw 'Attached Edge runtime acceptance failed'}
  Write-Output 'EDGE_ACCEPTANCE_PASS'
}
finally{
  $kids=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.Name -eq 'msedge.exe' -and $_.CommandLine -like ('*'+$profile+'*')}
  foreach($k in $kids){Stop-Process -Id $k.ProcessId -Force -ErrorAction SilentlyContinue}
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
}
