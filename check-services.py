import http.client
import socket
import time
import sys

def check_port(host, port, timeout=2):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError):
        return False

services = [
    {"name": "Backend (API)", "host": "localhost", "port": 8000},
    {"name": "Main Frontend (App)", "host": "localhost", "port": 3000},
    {"name": "Admin Frontend (Web)", "host": "localhost", "port": 5174}
]

print("="*40)
print(" Kim Long Smart Catering - Service Status")
print("="*40)

all_ok = True
for svc in services:
    is_up = check_port(svc["host"], svc["port"])
    status = "OK" if is_up else "FAILED"
    icon = "[+]" if is_up else "[!]"
    print(f"{icon} {svc['name']:<20} : {status} (Port {svc['port']})")
    if not is_up:
        all_ok = False

print("-"*40)
if all_ok:
    print("ALL SERVICES ARE RUNNING!")
else:
    print("SOME SERVICES ARE DOWN. Please run start-all.bat")
print("="*40)

if not all_ok:
    sys.exit(1)
