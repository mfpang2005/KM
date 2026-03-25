$path = 'c:\Users\User\Downloads\kim-long-smart-catering-system\admin-web\src\pages\CreateOrderPage.tsx'
$lines = Get-Content -Path $path

# 1. Find handleReset start (line 380 approx)
$resetStart = -1
$resetEnd = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -like '*const handleReset = () => {*') {
        $resetStart = $i
        # Find closing brace (it was at 400)
        for ($j = $i; $j -lt $lines.Count; $j++) {
            if ($lines[$j].Trim() -eq '};') {
                $resetEnd = $j
                break
            }
        }
        break
    }
}

# 2. Find button section (approx 665-680)
$buttonStart = -1
$buttonEnd = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -like '*{/* 操作按钮 */}*') {
        $buttonStart = $i
        # Find ending </div> (approx 680)
        for ($j = $i; $j -lt $lines.Count; $j++) {
            if ($lines[$j].Trim() -eq '</div>') {
                $buttonEnd = $j
                break
            }
        }
        break
    }
}

if ($resetStart -ge 0 -and $resetEnd -ge 0 -and $buttonStart -ge 0 -and $buttonEnd -ge 0) {
    Write-Host "Found markers. Reset: $resetStart-$resetEnd, Button: $buttonStart-$buttonEnd"
    
    # 3. Construct new content
    # New button row
    $newButtonRow = '                        <div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">
                            <button
                                onClick={() => navigate("/orders")}
                                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-500/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round text-[20px]">list_alt</span>
                                查看订单 (Orders)
                            </button>
                        </div>'
    
    $newLines = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($i -eq $resetStart) {
            # Skip the comment too (one line before resetStart if it's there)
            if ($i -gt 0 -and $lines[$i-1] -like '*/** 重置表单，再次下单 */*') {
                $newLines.RemoveAt($newLines.Count - 1)
            }
            $i = $resetEnd
            continue
        }
        if ($i -eq $buttonStart) {
            $newLines.Add('                        {/* 操作按钮 */}')
            $newLines.Add($newButtonRow)
            $i = $buttonEnd
            continue
        }
        $newLines.Add($lines[$i])
    }
    
    $newLines | Set-Content -Path $path -Encoding UTF8
    Write-Host "Successfully updated file"
} else {
    Write-Error "Could not find all markers. Reset: $resetStart, Button: $buttonStart"
}
