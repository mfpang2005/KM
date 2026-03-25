$path = 'c:\Users\User\Downloads\kim-long-smart-catering-system\admin-web\src\pages\CreateOrderPage.tsx'
$encoding = [System.Text.Encoding]::UTF8
$lines = [System.IO.File]::ReadAllLines($path, $encoding)

# Unicode for 查看订单
$text = "$([char]0x67E5)$([char]0x770B)$([char]0x8BA2)$([char]0x5355) (Orders)"

# Line 277 is index 276
if ($lines[276] -like '*(Orders)*') {
    $lines[276] = "                                $text"
    [System.IO.File]::WriteAllText($path, ($lines -join "`r`n"), $encoding)
    Write-Host "Fixed line 277 with Unicode"
} else {
    Write-Host "Line 277 does not contain (Orders)"
}
