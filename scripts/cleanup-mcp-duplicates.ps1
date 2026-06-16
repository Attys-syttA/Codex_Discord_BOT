[CmdletBinding()]
param(
  [switch]$ListOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-CommandLine {
  param(
    [string]$CommandLine
  )

  return (($CommandLine -replace "\s+", " ").Trim().ToLowerInvariant())
}

function Get-DescendantIds {
  param(
    [int]$RootProcessId,
    [hashtable]$ChildrenByParent
  )

  $result = New-Object System.Collections.Generic.List[int]
  $stack = New-Object System.Collections.Generic.Stack[int]
  $stack.Push($RootProcessId)

  while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    if (-not $ChildrenByParent.ContainsKey($current)) {
      continue
    }

    foreach ($childId in $ChildrenByParent[$current]) {
      $result.Add($childId)
      $stack.Push($childId)
    }
  }

  return $result
}

function Stop-ProcessTree {
  param(
    [int]$RootProcessId,
    [hashtable]$ChildrenByParent
  )

  $descendants = Get-DescendantIds -RootProcessId $RootProcessId -ChildrenByParent $ChildrenByParent
  foreach ($childId in ($descendants | Sort-Object -Descending)) {
    Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue
  }

  Stop-Process -Id $RootProcessId -Force -ErrorAction SilentlyContinue
}

$allProcesses = Get-CimInstance Win32_Process |
  Select-Object ProcessId, ParentProcessId, Name, CreationDate, CommandLine

$childrenByParent = @{}
foreach ($process in $allProcesses) {
  if (-not $childrenByParent.ContainsKey($process.ParentProcessId)) {
    $childrenByParent[$process.ParentProcessId] = New-Object System.Collections.Generic.List[int]
  }

  $childrenByParent[$process.ParentProcessId].Add([int]$process.ProcessId)
}

$definitions = @(
  @{
    Label = "Serena MCP"
    Pattern = 'serena(?:\.exe)?"?\s+start-mcp-server\s+--project-from-cwd\s+--context=codex'
  },
  @{
    Label = "Filesystem MCP"
    Pattern = '@modelcontextprotocol/server-filesystem|mcp-server-filesystem'
  }
)

$duplicateRoots = New-Object System.Collections.Generic.List[object]
$keptRoots = New-Object System.Collections.Generic.List[object]

foreach ($definition in $definitions) {
  $matched = @(
    $allProcesses | Where-Object {
      $_.CommandLine -and $_.CommandLine -match $definition.Pattern
    }
  )

  if ($matched.Count -eq 0) {
    continue
  }

  $matchedIds = @{}
  foreach ($process in $matched) {
    $matchedIds[[int]$process.ProcessId] = $true
  }

  $rootCandidates = @(
    $matched | Where-Object {
      -not $matchedIds.ContainsKey([int]$_.ParentProcessId)
    }
  )

  $groupedRoots = $rootCandidates |
    Group-Object { Normalize-CommandLine $_.CommandLine }

  foreach ($group in $groupedRoots) {
    $ordered = @($group.Group | Sort-Object CreationDate, ProcessId)
    if ($ordered.Count -le 1) {
      continue
    }

    $keep = $ordered[0]
    $keptRoots.Add([PSCustomObject]@{
      Kind = $definition.Label
      ProcessId = [int]$keep.ProcessId
      Created = [datetime]$keep.CreationDate
      CommandLine = $keep.CommandLine
      Action = "keep"
    })

    foreach ($extra in $ordered[1..($ordered.Count - 1)]) {
      $duplicateRoots.Add([PSCustomObject]@{
        Kind = $definition.Label
        ProcessId = [int]$extra.ProcessId
        Created = [datetime]$extra.CreationDate
        CommandLine = $extra.CommandLine
        Action = if ($ListOnly) { "would-stop" } else { "stop" }
      })
    }
  }
}

if ($duplicateRoots.Count -eq 0) {
  Write-Host "Nem talaltam duplikalt Serena vagy filesystem MCP folyamatfat."
  exit 0
}

Write-Host ""
Write-Host "Megmarado gyokerfolyamatok:"
$keptRoots |
  Sort-Object Kind, Created, ProcessId |
  Format-Table Kind, ProcessId, Created -AutoSize

Write-Host ""
if ($ListOnly) {
  Write-Host "Duplikalt folyamatfak, amelyeket a szkript leallitana:"
} else {
  Write-Host "Leallitando duplikalt folyamatfak:"
}

$duplicateRoots |
  Sort-Object Kind, Created, ProcessId |
  Format-Table Kind, ProcessId, Created, Action -AutoSize

if ($ListOnly) {
  exit 0
}

foreach ($root in $duplicateRoots) {
  Stop-ProcessTree -RootProcessId $root.ProcessId -ChildrenByParent $childrenByParent
}

Start-Sleep -Milliseconds 300

Write-Host ""
Write-Host "Maradek MCP gyokerjeloltek a takaritas utan:"
foreach ($definition in $definitions) {
  $remaining = @(
    Get-CimInstance Win32_Process |
      Where-Object { $_.CommandLine -and $_.CommandLine -match $definition.Pattern } |
      Select-Object ProcessId, ParentProcessId, Name, CreationDate, CommandLine
  )

  if ($remaining.Count -eq 0) {
    continue
  }

  $remainingIds = @{}
  foreach ($process in $remaining) {
    $remainingIds[[int]$process.ProcessId] = $true
  }

  $roots = @(
    $remaining | Where-Object {
      -not $remainingIds.ContainsKey([int]$_.ParentProcessId)
    }
  )

  if ($roots.Count -eq 0) {
    continue
  }

  $roots |
    Sort-Object CreationDate, ProcessId |
    Select-Object @{ Name = "Kind"; Expression = { $definition.Label } }, ProcessId, CreationDate |
    Format-Table -AutoSize
}
