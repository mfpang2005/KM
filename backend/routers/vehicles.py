from fastapi import APIRouter, HTTPException
from typing import List
from database import supabase
from models import Vehicle, VehicleCreate, VehicleUpdate, DriverAssignment, DriverAssignmentBase, VehicleStatus
from middleware.auth import require_admin, get_current_user
from services.audit import record_audit, AuditActions
from fastapi import Depends
import datetime
import postgrest

router = APIRouter(
    prefix="/vehicles",
    tags=["vehicles"]
)

@router.get("/", response_model=List[Vehicle])
async def get_vehicles():
    """获取所有车辆信息"""
    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(supabase.table("vehicles").select("*").execute)
    return response.data

def clean_vehicle_data(data: dict) -> dict:
    """将空字符串转换为 None，以适配数据库的 Date/Numeric 类型"""
    return {k: (None if v == "" else v) for k, v in data.items()}

@router.post("/", response_model=Vehicle)
async def create_vehicle(
    vehicle: VehicleCreate,
    current_user: dict = Depends(require_admin)
):
    """添加新车辆"""
    data = clean_vehicle_data(vehicle.model_dump())
    try:
        response = supabase.table("vehicles").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create vehicle")
        
        await record_audit(
            actor_id=current_user.get("id"),
            actor_role=current_user.get("role"),
            action=AuditActions.VEHICLE_CREATE,
            target=response.data[0]["id"],
            detail=data
        )
        return response.data[0]
    except Exception as e:
        error_msg = str(e)
        if "23505" in error_msg or "duplicate key" in error_msg:
            raise HTTPException(status_code=400, detail=f"车牌号 {data.get('plate_no')} 已存在，请勿重复添加。")
        if "22007" in error_msg:
            raise HTTPException(status_code=400, detail="日期格式不正确，预计格式为 YYYY-MM-DD")
        if "22P02" in error_msg:
            raise HTTPException(status_code=400, detail="载重能力字段请输入有效的数字")
        raise HTTPException(status_code=500, detail=f"Database error: {error_msg}")

@router.put("/{vehicle_id}", response_model=Vehicle)
async def update_vehicle(
    vehicle_id: str, 
    vehicle_update: VehicleUpdate,
    current_user: dict = Depends(require_admin)
):
    """更新车辆状态或信息"""
    data = clean_vehicle_data(vehicle_update.model_dump(exclude_unset=True))
    data["updated_at"] = datetime.datetime.utcnow().isoformat()
    try:
        response = supabase.table("vehicles").update(data).eq("id", vehicle_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Vehicle not found")
            
        await record_audit(
            actor_id=current_user.get("id"),
            actor_role=current_user.get("role"),
            action=AuditActions.VEHICLE_UPDATE,
            target=vehicle_id,
            detail=data
        )
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "23505" in error_msg or "duplicate key" in error_msg:
            raise HTTPException(status_code=400, detail=f"车牌号 {data.get('plate_no')} 已被其他车辆占用。")
        if "22007" in error_msg:
            raise HTTPException(status_code=400, detail="日期格式不正确，预计格式为 YYYY-MM-DD")
        if "22P02" in error_msg:
            raise HTTPException(status_code=400, detail="载重能力字段请输入有效的数字")
        raise HTTPException(status_code=500, detail=f"Database error: {error_msg}")

@router.delete("/{vehicle_id}")
async def delete_vehicle(
    vehicle_id: str,
    current_user: dict = Depends(require_admin)
):
    """删除车辆"""
    response = supabase.table("vehicles").delete().eq("id", vehicle_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Vehicle not found or already deleted")
        
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.VEHICLE_DELETE,
        target=vehicle_id
    )
    return {"message": "Vehicle deleted successfully"}

@router.post("/assign")
async def assign_vehicle(
    assignment: DriverAssignmentBase,
    current_user: dict = Depends(require_admin)
):
    """将车辆派发给司机"""
    # 1. 检查车辆当前状态
    vehicle_resp = supabase.table("vehicles").select("*").eq("id", assignment.vehicle_id).execute()
    if not vehicle_resp.data:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    vehicle = vehicle_resp.data[0]
    if vehicle["status"] == VehicleStatus.BUSY:
        # Check if already assigned to THIS driver
        assign_check = supabase.table("driver_assignments").select("*").eq("vehicle_id", assignment.vehicle_id).eq("driver_id", assignment.driver_id).eq("status", "active").execute()
        if assign_check.data:
            return {"message": "Vehicle already assigned to you", "assignment": assign_check.data[0]}
        raise HTTPException(status_code=400, detail="车辆已被占用 (Busy)")
    if vehicle["status"] == VehicleStatus.REPAIR:
        raise HTTPException(status_code=400, detail="车辆正在维修中 (Repair)")

    # 2. 如果司机之前有其他活跃的分配，将其结束
    supabase.table("driver_assignments").update({
        "status": "completed",
        "returned_at": datetime.datetime.utcnow().isoformat()
    }).eq("driver_id", assignment.driver_id).eq("status", "active").execute()

    # 3. 创建新的分配记录
    assign_resp = supabase.table("driver_assignments").insert({
        "driver_id": assignment.driver_id,
        "vehicle_id": assignment.vehicle_id,
        "status": "active"
    }).execute()
    
    if not assign_resp.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment")

    # 4. 更新车辆状态为 BUSY (已占用)
    supabase.table("vehicles").update({
        "status": VehicleStatus.BUSY,
        "updated_at": datetime.datetime.utcnow().isoformat()
    }).eq("id", assignment.vehicle_id).execute()

    # 5. 更新 driver 用户档案的冗余字段（车牌、型号、类型）以保持前台列表显示一致
    try:
        supabase.table("users").update({
            "vehicle_plate": vehicle["plate_no"],
            "vehicle_model": vehicle.get("model"),
            "vehicle_type": vehicle.get("type"),
            "vehicle_status": "occupied"
        }).eq("id", assignment.driver_id).execute()
    except Exception as e:
        # Ignore errors related to missing columns (PGRST204)
        if "PGRST204" not in str(e):
            print(f"Warning: Failed to update user redundant fields: {e}")

    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.VEHICLE_ASSIGN,
        target=assignment.vehicle_id,
        detail={"driver_id": assignment.driver_id}
    )

    return {"message": "Vehicle assigned successfully", "assignment": assign_resp.data[0]}

@router.post("/unassign/{driver_id}")
async def unassign_vehicle(
    driver_id: str,
    current_user: dict = Depends(require_admin)
):
    """解除司机的车辆绑定"""
    # 找到该司机的活跃分配
    assign_resp = supabase.table("driver_assignments").select("*").eq("driver_id", driver_id).eq("status", "active").execute()
    if not assign_resp.data:
        # 同时清理用户信息中的车辆冗余，防止数据不一致
        try:
            supabase.table("users").update({
                "vehicle_plate": None,
                "vehicle_model": None,
                "vehicle_type": None,
                "vehicle_status": "idle"
            }).eq("id", driver_id).execute()
        except Exception as e:
            if "PGRST204" not in str(e):
                print(f"Warning: Failed to clear user redundant fields: {e}")
        return {"message": "No active assignments found for this driver"}
        
    assignment = assign_resp.data[0]
    
    # 结束分配
    supabase.table("driver_assignments").update({
        "status": "completed",
        "returned_at": datetime.datetime.utcnow().isoformat()
    }).eq("id", assignment["id"]).execute()
    
    # 将车辆状态改回 available
    supabase.table("vehicles").update({
        "status": VehicleStatus.AVAILABLE,
        "updated_at": datetime.datetime.utcnow().isoformat()
    }).eq("id", assignment["vehicle_id"]).execute()

    # 清理用户信息中的车辆冗余
    try:
        supabase.table("users").update({
            "vehicle_plate": None,
            "vehicle_model": None,
            "vehicle_type": None,
            "vehicle_status": "idle"
        }).eq("id", driver_id).execute()
    except Exception as e:
        if "PGRST204" not in str(e):
            print(f"Warning: Failed to clear user redundant fields: {e}")
    
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.VEHICLE_UNASSIGN,
        target=driver_id
    )
    
    return {"message": "Vehicle unassigned successfully"}

@router.get("/status")
async def get_fleet_status(
    current_user: dict = Depends(require_admin),
):
    """
    获取车队完整状态 (绕过 RLS)
    聚合司机、活跃指派与车辆信息
    """
    from fastapi.concurrency import run_in_threadpool
    
    # 1. 获取所有司机 (role='driver')
    drivers_resp = await run_in_threadpool(
        supabase.table("users")
        .select("*")
        .eq("role", "driver")
        .order("name")
        .execute
    )
    drivers = drivers_resp.data or []
    
    # 2. 获取所有活跃的司机指派信息，并关联车辆
    assignments_resp = await run_in_threadpool(
        supabase.table("driver_assignments")
        .select("*, vehicle:vehicles(*)")
        .eq("status", "active")
        .execute
    )
    assignments = assignments_resp.data or []
    
    # 3. 将指派数据聚合到司机对象中
    for driver in drivers:
        driver_id = driver.get("id")
        # 匹配该司机的活跃指派
        driver["assignments"] = [a for a in assignments if a.get("driver_id") == driver_id]
        
    return drivers
