import os
import json
import logging
import httpx
from typing import Any, Optional

from datetime import datetime

logger = logging.getLogger(__name__)

GOEASY_HOST = "https://rest-singapore.goeasy.io/publish"
DEFAULT_CHANNEL = "KIM_LONG_COMUNITY"

async def publish_message(content: Any, channel: str = DEFAULT_CHANNEL) -> bool:
    """
    通过 GoEasy REST API 发布消息。
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
        async with httpx.AsyncClient() as client:
            response = await client.post(GOEASY_HOST, data=payload, timeout=10.0)
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 200:
                    logger.info(f"Successfully published message to GoEasy channel: {channel}")
                    return True
                else:
                    logger.error(f"GoEasy publish failed: {result}")
            else:
                logger.error(f"GoEasy REST API error: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Exception during GoEasy publish: {str(e)}")

    return False

async def notify_order_update(order_data: dict, action: str = "update"):
    """
    快捷函数：通知订单变更
    """
    message = {
        "type": "order_update",
        "action": action,
        "orderId": order_data.get("id"),
        "status": order_data.get("status"),
        "timestamp": datetime.now().isoformat()
    }
    
    await publish_message(message)
