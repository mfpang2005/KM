from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ws",
    tags=["websocket-walkie-talkie"]
)

class ConnectionManager:
    def __init__(self):
        # 记录所有活跃的连接
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New Walkie-Talkie Connection, Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Walkie-Talkie Disconnected, Total: {len(self.active_connections)}")

    async def broadcast_audio(self, sender: WebSocket, data: bytes):
        """
        向除了发送者以外的所有连接广播音频数据
        """
        disconnected = []
        for connection in self.active_connections:
            if connection != sender:
                try:
                    await connection.send_bytes(data)
                except Exception as e:
                    logger.error(f"Failed to send audio data: {e}")
                    disconnected.append(connection)
        
        # 清理异常断开的连接
        for dead_conn in disconnected:
            self.disconnect(dead_conn)

manager = ConnectionManager()

@router.websocket("/walkie-talkie")
async def walkie_talkie_endpoint(websocket: WebSocket):
    """
    WebSocket 对讲机频道：
    接收二进制音频流 (PCM/WebM 等)，并原样广播给订阅了频道的其他所有人。
    """
    await manager.connect(websocket)
    try:
        while True:
            # 接收二进制音频块
            data = await websocket.receive_bytes()
            # 广播给其他在线终端
            await manager.broadcast_audio(websocket, data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"Walkie-talkie unexpected error: {e}")
        manager.disconnect(websocket)
