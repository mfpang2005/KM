$path = 'c:\Users\User\Downloads\kim-long-smart-catering-system\admin-web\src\pages\CreateOrderPage.tsx'
$lines = Get-Content -Path $path

$newLines = New-Object System.Collections.Generic.List[string]
foreach ($line in $lines) {
    if ($line -like '*(Orders)*' -and $line -like '*æŸ¥çœ‹è®¢å •*') {
        # This is the corrupted line
        $newLines.Add('                                查看订单 (Orders)')
    } else {
        $newLines.Add($line)
    }
}

$newLines | Set-Content -Path $path -Encoding UTF8
Write-Host "Fixed corrupted line"
