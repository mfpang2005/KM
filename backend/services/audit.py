from typing import Optional, Any
import logging
from database import supabase
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

import uuid

# 常量：系统默认 UUID (当操作人不是标准 UUID 格式时使用，如系统自动任务或测试)
FALLBACK_SYSTEM_UUID = "00000000-0000-0000-0000-000000000000"

async def record_audit(
    actor_id: str,
    actor_role: str,
    action: str,
    target: Optional[str] = None,
    detail: Optional[dict[str, Any]] = None
) -> None:
    """
    统一记录审计日志到数据库。
    此函数设计为不阻塞主业务流程，但在记录失败时会记录错误日志。
    """
    try:
        # UUID 校验与转换逻辑
        final_actor_id = actor_id
        is_valid_uuid = False
        
        try:
            if actor_id:
                uuid.UUID(str(actor_id))
                is_valid_uuid = True
        except (ValueError, TypeError, AttributeError):
            is_valid_uuid = False

        if not is_valid_uuid:
            final_actor_id = FALLBACK_SYSTEM_UUID
            # 在 detail 中保留原始不合法的 actor_id 供参考
            detail = detail or {}
            detail["_original_actor_id"] = actor_id

        data = {
            "actor_id": final_actor_id,
            "actor_role": actor_role or "system",
            "action": action,
            "target": target,
            "detail": detail or {},
        }
        
        # 使用 run_in_threadpool 确保同步库调用不会阻塞异步事件循环
        await run_in_threadpool(
            supabase.table("audit_logs")
            .insert(data)
            .execute
        )
    except Exception as e:
        logger.error(f"Failed to record audit log. Action: {action}, Error: {str(e)}")

# 预定义的审计操作常量，方便统一命名
class AuditActions:
    ORDER_CREATE = "order_create"
    ORDER_UPDATE = "order_update"
    ORDER_DELETE = "order_delete"
    ORDER_STATUS_CHANGE = "order_status_change"
    ORDER_ASSIGN_DRIVER = "order_assign_driver"
    ORDER_UNASSIGN_DRIVER = "order_unassign_driver"
    ORDER_ITEM_PREPARED = "order_item_prepared"
    ORDER_UPDATE_PHOTOS = "order_update_photos"
    KITCHEN_COMPLETE = "kitchen_complete"
    ORDER_REVERT = "order_revert"
    
    USER_UPDATE = "update_user"
    USER_PROFILE_UPDATE = "update_user_profile"
    USER_DELETE = "delete_user"
    USER_STATUS_CHANGE = "update_user_status"
    USER_CREATE_INTERNAL = "create_internal_user"
    
    VEHICLE_CREATE = "create_vehicle"
    VEHICLE_UPDATE = "update_vehicle"
    VEHICLE_DELETE = "delete_vehicle"
    VEHICLE_ASSIGN = "assign_vehicle"
    VEHICLE_UNASSIGN = "unassign_vehicle"
    
    PRODUCT_CREATE = "create_product"
    PRODUCT_UPDATE = "update_product"
    PRODUCT_DELETE = "delete_product"
    
    CUSTOMER_CREATE = "create_customer"
    CUSTOMER_UPDATE = "update_customer"
    CUSTOMER_DELETE = "delete_customer"
    
    RECIPE_CREATE = "create_recipe"
    RECIPE_UPDATE = "update_recipe"
    RECIPE_DELETE = "delete_recipe"
    
    CONFIG_UPDATE = "update_config"
    DATA_RESET = "reset_data"
