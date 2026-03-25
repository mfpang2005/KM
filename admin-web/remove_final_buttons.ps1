$path = 'c:\Users\User\Downloads\kim-long-smart-catering-system\admin-web\src\pages\CreateOrderPage.tsx'
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# The target block is the "confirmedOrder" button section.
# It has "Orders" and "Next" text.
# We'll match from "no-print-area mt-4" until the closing "</div>" of that section.
$regex = '(?s)<div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">.*?查看订单.*?再次下单.*?<\/div>'

$newButtons = '<div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">
                            <button
                                onClick={() => navigate("/orders")}
                                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-500/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round text-[20px]">list_alt</span>
                                查看订单 (Orders)
                            </button>
                        </div>'

# Escape the Chinese characters for the regex if needed, or just match the English tags
$regexSafe = '(?s)<div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">.*?list_alt.*?add_shopping_cart.*?<\/div>'

if ($content -match $regexSafe) {
    Write-Host "Found button section with list_alt/add_shopping_cart"
    $content = [Regex]::Replace($content, $regexSafe, $newButtons)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Success"
} else {
    Write-Host "Could not find button section"
}
