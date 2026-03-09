import re

filepath = "backend/routers/orders.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# I want to take the generic routes:
# 1. get_order
# 2. update_order
# 3. partial_update_order
# 4. delete_order
# And move them to the end of the file.

# Or, since there are many other routes interleaved (like create_order, update_order_status),
# let's just move the ENTIRE bottom section (from assign_driver downwards) to BEFORE get_order.
# The bottom section starts at `assign_driver` or `update_delivery_photos`.
# Let's find: "# ─── Kitchen Prep Endpoints" and "# NOTE: 司机完成送餐后" and "assign_driver".

# Actually, the most robust way is to just find `get_order_items` and `mark_item_prepared` and `kitchen_complete` and `update_delivery_photos`
# and move them up.

def extract_and_remove(pattern, text):
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return text, ""
    extracted = match.group(0)
    text = text.replace(extracted, "")
    return text, extracted

# We want to extract:
# 1. update_delivery_photos
p_photos = r"# NOTE: 司机完成送餐后将照片 URL 列表写入对应订单，供 Admin 审阅\n@router\.patch\(\"/{order_id:path}/photos\"\)\nasync def update_delivery_photos(.*?)return response\.data\[0\]\n"
content, ext_photos = extract_and_remove(p_photos, content)

# 2. get_order_items
p_items = r"@router\.get\(\"/items/{order_id:path}\"\)\nasync def get_order_items(.*?)return response\.data or \[\]\n"
content, ext_items = extract_and_remove(p_items, content)

# 3. mark_item_prepared
p_prep = r"@router\.patch\(\"/items/{item_id}/prepared\"\)\nasync def mark_item_prepared(.*?)return response\.data\n"
content, ext_prep = extract_and_remove(p_prep, content)

# 4. kitchen_complete
# Wait, kitchen_complete is a POST to "/{order_id:path}/kitchen-complete".
# Is it shadowed? POST "/{order_id:path}" doesn't exist. There is no generic POST. So kitchen_complete is actually safe!
# Same for `assign_driver` (POST "/{order_id:path}/assign") and `update_order_status` (POST "/{order_id:path}/status").
# Only GET, PUT, PATCH, DELETE are shadowed.

# Let's inject `ext_items`, `ext_prep`, `ext_photos` right before `get_order`.

target_marker = '@router.get("/{order_id:path}", response_model=Order)'

if ext_items or ext_prep or ext_photos:
    insertion = "\n# --- Specific Routes (Moved to prevent shadowing) ---\n"
    if ext_photos: insertion += ext_photos + "\n"
    if ext_items: insertion += ext_items + "\n"
    if ext_prep: insertion += ext_prep + "\n"
    
    content = content.replace(target_marker, insertion + target_marker)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("Routes reordered successfully.")
else:
    print("Failed to find routes to extract.")
