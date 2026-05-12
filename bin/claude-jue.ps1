$PluginRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Bootstrap = Join-Path $PluginRoot "root\BOOTSTRAP.md"
$Settings = Join-Path $PluginRoot "settings.json"
$env:JUE_PLUGIN_ROOT = $PluginRoot
$env:JUE_STATE_DIR = Join-Path $env:LOCALAPPDATA "ClaudeCodeJue\jue"

$Claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $Claude) {
  $Fallback = Join-Path $HOME ".local\bin\claude.exe"
  if (Test-Path $Fallback) {
    $Claude = $Fallback
  }
}

if (-not $Claude) {
  throw "Cannot find claude. Install Claude Code or add claude.exe to PATH."
}

& $Claude --plugin-dir $PluginRoot --agent "jue:jue" --append-system-prompt-file $Bootstrap --settings $Settings @args
