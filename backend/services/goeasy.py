import os
import json
import logging
import httpx
import asyncio
from typing import Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

GOEASY_HOST = "https://rest-singapore.goeasy.io/publish"
DEFAULT_CHANNEL = "KIM_LONG_COMUNITY"

# 全局客户端，避免频繁创建连接
_http_client: Optional[httpx.AsyncClient] = None

def get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=10.0, limits=httpx.Limits(max_connections=100, max_keepalive_connections=20))
    return _http_client

async def close_client():
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None

async def publish_message(content: Any, channel: str = DEFAULT_CHANNEL) -> bool:
    """
    通过 GoEasy REST API 发布消息。
    使用持久连接池优化性能。
    """
    appkey = os.getenv("GOEASY_APPKEY")
    if not appkey:
        logger.warning("GOEASY_APPKEY not configured, skipping publish.")
        return False

    # 构建消息体
    if isinstance(content, (dict, list)):
        message_str = json.dumps(content)
    else:
        message_str = str(content)

    payload = {
        "appkey": appkey,
        "channel": channel,
        "content": message_str
    }

    try:
        client = get_client()
        response = await client.post(GOEASY_HOST, data=payload)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 200:
                logger.info(f"Successfully published to {channel}")
                return True
            else:
                logger.error(f"GoEasy internal error: {result}")
        else:
            logger.error(f"GoEasy HTTP error: {response.status_code}")
    except Exception as e:
        logger.error(f"Exception during GoEasy publish: {str(e)}")

    return False

async def notify_order_update(order_data: dict, action: str = "update"):
    """通知订单变更"""
    message = {
        "type": "order_update",
        "action": action,
        "orderId": order_data.get("id"),
        "status": order_data.get("status"),
        "timestamp": datetime.now().isoformat()
    }
    await publish_message(message)

async def notify_kitchen_complete(order_data: dict):
    """厨房完成订单通知"""
    message = {
        "type": "kitchen_done",
        "action": "kitchen_complete",
        "orderId": order_data.get("id"),
        "status": "ready",
        "customerName": order_data.get("customerName"),
        "driverId": order_data.get("driverId"),
        "timestamp": datetime.now().isoformat()
    }
    await publish_message(message)
