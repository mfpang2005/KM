$path = 'c:\Users\User\Downloads\kim-long-smart-catering-system\admin-web\src\pages\CreateOrderPage.tsx'
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Remove handleReset function
$oldReset = '(?s)    \/\*\* 重置表单，再次下单 \*\/[\s]*?const handleReset = \(\) => \{.*?orderRef\.current = generateOrderRef\(\);[\s]*?\};[\s]*'
$content = $content -replace $oldReset, ''

# Update button section
$oldButtons = '(?s)                        \{\/\* 操作按钮 \*\/\}[\s]*?<div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">.*?查看订单 \(Orders\).*?再次下单 \(Next\).*?<\/div>'
$newButtons = '                        {/* 操作按钮 */}
                        <div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">
                            <button
                                onClick={() => navigate("/orders")}
                                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-500/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round text-[20px]">list_alt</span>
                                查看订单 (Orders)
                            </button>
                        </div>'

if ($content -match $oldButtons) {
    Write-Host "Found button section"
    $content = [Regex]::Replace($content, $oldButtons, $newButtons)
} else {
    Write-Host "Could not find button section with regex, trying simpler match"
    # Fallback to a simpler regex if the above fails due to subtle differences
    $simpleOldButtons = '(?s)<div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">.*?再次下单 \(Next\).*?<\/div>'
    if ($content -match $simpleOldButtons) {
        $content = [Regex]::Replace($content, $simpleOldButtons, $newButtons)
    }
}

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Successfully updated CreateOrderPage.tsx"
