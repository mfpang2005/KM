from fastapi import APIRouter, HTTPException
from typing import List
from database import supabase
from models import Vehicle, VehicleCreate, VehicleUpdate, DriverAssignment, DriverAssignmentBase, VehicleStatus
import datetime

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

@router.post("/", response_model=Vehicle)
async def create_vehicle(vehicle: VehicleCreate):
    """添加新车辆"""
    data = vehicle.model_dump()
    response = supabase.table("vehicles").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Failed to create vehicle")
    return response.data[0]

@router.put("/{vehicle_id}", response_model=Vehicle)
async def update_vehicle(vehicle_id: str, vehicle_update: VehicleUpdate):
    """更新车辆状态或信息"""
    data = vehicle_update.model_dump(exclude_unset=True)
    data["updated_at"] = datetime.datetime.utcnow().isoformat()
    response = supabase.table("vehicles").update(data).eq("id", vehicle_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return response.data[0]

@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str):
    """删除车辆"""
    response = supabase.table("vehicles").delete().eq("id", vehicle_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Vehicle not found or already deleted")
    return {"message": "Vehicle deleted successfully"}

@router.post("/assign")
async def assign_vehicle(assignment: DriverAssignmentBase):
    """将车辆派发给司机"""
    # 1. 检查车辆当前状态
    vehicle_resp = supabase.table("vehicles").select("*").eq("id", assignment.vehicle_id).execute()
    if not vehicle_resp.data:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    vehicle = vehicle_resp.data[0]
    if vehicle["status"] == VehicleStatus.BUSY:
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

    # 4. 更新车辆状态为 busy
    supabase.table("vehicles").update({
        "status": VehicleStatus.BUSY,
        "updated_at": datetime.datetime.utcnow().isoformat()
    }).eq("id", assignment.vehicle_id).execute()

    # 5. 可选：更新 driver 用户档案的当前车辆 (如果前台强依赖用户信息上的冗余字段)
    # supabase.table("users").update({"vehicle_plate": vehicle["plate_no"]}).eq("id", assignment.driver_id).execute()

    return {"message": "Vehicle assigned successfully", "assignment": assign_resp.data[0]}

@router.post("/unassign/{driver_id}")
async def unassign_vehicle(driver_id: str):
    """解除司机的车辆绑定"""
    # 找到该司机的活跃分配
    assign_resp = supabase.table("driver_assignments").select("*").eq("driver_id", driver_id).eq("status", "active").execute()
    if not assign_resp.data:
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
    
    return {"message": "Vehicle unassigned successfully"}
