$path = 'c:\Users\User\Downloads\kim-long-smart-catering-system\admin-web\src\pages\CreateOrderPage.tsx'
$encoding = [System.Text.Encoding]::UTF8
$lines = [System.IO.File]::ReadAllLines($path, $encoding)

# Line 277 is index 276
if ($lines[276] -like '*(Orders)*') {
    $lines[276] = '                                查看订单 (Orders)'
    [System.IO.File]::WriteAllText($path, ($lines -join "`r`n"), $encoding)
    Write-Host "Fixed line 277"
} else {
    Write-Host "Line 277 does not contain (Orders)"
    Write-Host "Line content: $($lines[276])"
}
