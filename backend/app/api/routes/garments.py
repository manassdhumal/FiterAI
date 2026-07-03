from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.garment import GarmentIntakeResponse
from app.services.garment_intake import process_garment_upload
from app.services.garment_intake.preprocessing import InvalidGarmentImageError

router = APIRouter(prefix="/garments", tags=["garments"])

MAX_UPLOAD_BYTES = 15 * 1024 * 1024


@router.post("/intake", response_model=GarmentIntakeResponse)
async def intake_garment(file: UploadFile = File(...)) -> GarmentIntakeResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Uploaded file is too large.")

    try:
        result = process_garment_upload(raw_bytes, file.filename or "garment")
    except InvalidGarmentImageError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return GarmentIntakeResponse(
        garment_id=result.garment_id,
        source_type="upload",
        status="ready",
        original_filename=result.original_filename,
        width=result.width,
        height=result.height,
        mask_coverage_ratio=result.mask_coverage_ratio,
        had_transparent_source=result.had_transparent_source,
        was_worn_photo=result.was_worn_photo,
        original_url=result.original_url,
        clean_url=result.clean_url,
    )
