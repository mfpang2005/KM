from fastapi import FastAPI
from fastapi.testclient import TestClient
app = FastAPI()
@app.get("/{id:path}/approve")
def approve(id: str): return {"id": id}
client = TestClient(app)
print(client.get("/KM-12/34/approve").json())
