import os
from supabase import create_client
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
import dateutil.parser

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

def check_orders():
    print(f"Current UTC time: {datetime.now(timezone.utc)}")
    
    # Malaysia time
    malaysia_tz = timezone(timedelta(hours=8))
    now_my = datetime.now(malaysia_tz)
    today_str = now_my.strftime("%Y-%m-%d")
    print(f"Malaysia time (today): {today_str}")

    res = supabase.table("orders").select("id, customerName, amount, status, paymentStatus, dueTime, created_at, deposit_amount").execute()
    orders = res.data or []
    
    print(f"Found {len(orders)} orders in total.")
    
    for o in orders:
        dt_raw = o.get("dueTime")
        amount = o.get("amount") or 0
        p_status = o.get("paymentStatus") or "pending"
        status = o.get("status")
        deposit = o.get("deposit_amount") or 0
        
        is_today = False
        try:
            if dt_raw and "T" in dt_raw:
                dt = dateutil.parser.isoparse(dt_raw)
                if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
                if dt.astimezone(malaysia_tz).strftime("%Y-%m-%d") == today_str:
                    is_today = True
            else:
                ca = dateutil.parser.isoparse(o.get('created_at'))
                if ca.tzinfo is None: ca = ca.replace(tzinfo=timezone.utc)
                if ca.astimezone(malaysia_tz).strftime("%Y-%m-%d") == today_str:
                    is_today = True
        except:
            pass
            
        # 使用 safe print 避免 Windows 编码问题
        customer = str(o.get('customerName')).encode('ascii', 'ignore').decode('ascii')
        print(f"ID: {o['id'][:8]} | Amt: {amount} | Dep: {deposit} | P.Stat: {p_status} | Stat: {status} | Today: {is_today}")

if __name__ == "__main__":
    check_orders()
