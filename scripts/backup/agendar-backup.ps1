# Agenda o backup semanal do Avia no Agendador de Tarefas do Windows:
# toda segunda às 20h; se o computador estiver desligado nessa hora, roda
# assim que ele for ligado. Roda com o seu usuário (usa o seu login da
# Cloudflare e o seu Google Drive). Uma janela preta abre e fecha sozinha.
#
#   powershell -ExecutionPolicy Bypass -File scripts\backup\agendar-backup.ps1            (agendar)
#   powershell -ExecutionPolicy Bypass -File scripts\backup\agendar-backup.ps1 -Remover   (desagendar)
#
# O resultado de cada execução fica em Documents\avia-backups\backup.log.
param([switch]$Remover)

$nomeTarefa = 'Avia - backup semanal'

if ($Remover) {
  Unregister-ScheduledTask -TaskName $nomeTarefa -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Tarefa '$nomeTarefa' removida."
  return
}

$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script = Join-Path $raiz 'scripts\backup\backup.mjs'
$node = (Get-Command node -ErrorAction Stop).Source

$acao = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $raiz
$quando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 20:00
$opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName $nomeTarefa -Action $acao -Trigger $quando -Settings $opcoes `
  -Description 'Backup cifrado do banco e dos arquivos do Avia (computador + Google Drive). Ver scripts\backup\LEIAME.md.' -Force | Out-Null

Write-Output "Tarefa '$nomeTarefa' agendada: toda segunda as 20h (ou assim que o computador ligar)."
