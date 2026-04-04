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
        
        return {"url": public_url_res}

    except Exception as e:
        logger.error(f"Audio upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
