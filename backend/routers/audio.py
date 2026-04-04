from fastapi import APIRouter, File, UploadFile, HTTPException
from database import supabase
import uuid
from fastapi.concurrency import run_in_threadpool
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/audio",
    tags=["audio"]
)

BUCKET_NAME = "audio-messages"

@router.post("/upload")
async def upload_audio(file: UploadFile = File(...)):
    """
    上传语音文件至 Supabase Storage 并返回公开链接。
    """
    try:
        content = await file.read()
        # 允许的音频类型
        if not file.content_type.startswith("audio/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only audio is allowed.")

        # 生成唯一文件名
        file_ext = file.filename.split('.')[-1] if file.filename and '.' in file.filename else 'webm'
        file_path = f"voices/{uuid.uuid4()}.{file_ext}"

        # 上传到 Supabase Storage (使用 service_role 绕过 RLS)
        await run_in_threadpool(
            supabase.storage.from_(BUCKET_NAME).upload,
            path=file_path,
            file=content,
            file_options={"content-type": file.content_type, "upsert": "true"}
        )

        # 获取公开访问链接
        public_url_res = await run_in_threadpool(
            supabase.storage.from_(BUCKET_NAME).get_public_url,
            file_path
        )
        
        # 兼容 supabase-py 返回对象或直接返回 URL 的不同版本
        final_url = public_url_res if isinstance(public_url_res, str) else getattr(public_url_res, "public_url", public_url_res)
        
        return {"url": final_url}

    except Exception as e:
        logger.error(f"Audio upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.patch("/recall/{msg_id}")
async def recall_message(msg_id: str):
    """
    撤回指定 ID 的消息（设置为 is_recalled = true）。
    """
    try:
        # 1. 尝试更新数据库中该消息的状态
        res = await run_in_threadpool(
            supabase.table("messages")
            .update({"is_recalled": True})
            .eq("id", msg_id.strip())
            .execute
        )
        
        if not res.data:
            logger.warning(f"Recall failed: Message ID [{msg_id}] NOT FOUND in DB.")
            raise HTTPException(status_code=404, detail=f"Message ID {msg_id} not found.")
            
        # 2. 只有数据库更新成功后，才尝试发送 GoEasy 实时撤回信令
        try:
            from services.goeasy import publish_message
            await publish_message({
                "type": "recall",
                "msgId": msg_id.strip()
            })
            logger.info(f"GoEasy recall signal sent for {msg_id}")
        except Exception as ge_err:
            # GoEasy 失败不作为阻塞错误，仅记录警告
            logger.warning(f"GoEasy notification failed but DB was updated: {str(ge_err)}")

        logger.info(f"Message {msg_id} successfully recalled in DB.")
        return {"status": "success", "id": msg_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CRITICAL ERROR during recall for {msg_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
