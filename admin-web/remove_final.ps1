$path = 'c:\Users\User\Downloads\kim-long-smart-catering-system\admin-web\src\pages\CreateOrderPage.tsx'
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# 1. Remove handleReset
# Matches: const handleReset = () => { ... }
$regexReset = '(?s)\s*\/\*\*.*?\*\/[\s]*?const handleReset = \(\) => \{.*?orderRef\.current = generateOrderRef\(\);[\s]*?\};'
if ($content -match $regexReset) {
    Write-Host "Found handleReset"
    $content = $content -replace $regexReset, ''
}

# 2. Update button row
# Matches: <div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4"> ... 再次下单 (Next) ... </div>
$regexButtons = '(?s)<div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">.*?再次下单 \(Next\).*?<\/div>'
$newButtons = '<div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">
                            <button
                                onClick={() => navigate("/orders")}
                                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-500/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round text-[20px]">list_alt</span>
                                查看订单 (Orders)
                            </button>
                        </div>'

if ($content -match $regexButtons) {
    Write-Host "Found button section"
    $content = [Regex]::Replace($content, $regexButtons, $newButtons)
}

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Done"
