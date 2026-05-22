# setup-task-scheduler.ps1
# Run once (as Administrator) to register auto-start at Windows login.
# After running, start-bot.bat will execute automatically every time you log in.

$TaskName = "FIET-Bot-Autostart"
$BotDir   = "C:\Users\User\Documents\GitHub\line-bot"
$BatFile  = "$BotDir\start-bot.bat"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$BatFile`"" `
    -WorkingDirectory $BotDir

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action   $action `
    -Trigger  $trigger `
    -Settings $settings `
    -Force

Write-Host ""
Write-Host "Task '$TaskName' registered successfully." -ForegroundColor Green
Write-Host "  Runs: start-bot.bat at every login for user '$env:USERNAME'"
Write-Host "  Verify : schtasks /query /tn `"$TaskName`""
Write-Host "  Run now: schtasks /run  /tn `"$TaskName`""
