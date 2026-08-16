from uuid import uuid4

import io
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.render import RenderCreateResponse
from app.services.render_fit.renderer import generate_realistic_fit
from app.core.config import settings

router = APIRouter(prefix="/renders", tags=["renders"])

@router.post("", response_model=RenderCreateResponse)
async def create_render(
    garment_id: str = Form(...),
    file: UploadFile = File(...)
) -> RenderCreateResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        person_image = Image.open(io.BytesIO(raw_bytes))
        person_image.load()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    render_id = str(uuid4())
    
    try:
        final_image = generate_realistic_fit(person_image, garment_id)
        
        # Save the result
        render_dir = settings.data_dir / "renders" / render_id
        render_dir.mkdir(parents=True, exist_ok=True)
        final_image.save(render_dir / "result.png")
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred during rendering.")

    return RenderCreateResponse(
        render_id=render_id,
        status="completed",
        result_url=f"{settings.data_url_prefix}/renders/{render_id}/result.png"
    )
