import asyncio
from database import supabase
from pprint import pprint
data = {
    'customerName': 'Test Customer',
    'customerPhone': '012345678',
    'address': 'Test Address',
    'items': [{'id': 'prod1', 'quantity': 1, 'name': 'Item 1', 'price': 10}],
    'status': 'pending',
    'amount': 10.0,
    'dueTime': '12:00 PM',
    'type': 'delivery',
    'driverId': 'some-driver-id',
    'equipments': {'汤匙': 1}
}
resp = supabase.table('orders').insert(data).execute()
pprint(resp)
