from fastapi import APIRouter, File, HTTPException, UploadFile
import io
from PIL import Image, UnidentifiedImageError

from app.schemas.tryon import LiveFitResponse, PoseEstimationResponse
from app.services.live_fit.pose_estimation import estimate_pose

router = APIRouter(prefix="/tryon", tags=["tryon"])


@router.post("/live-fit", response_model=LiveFitResponse)
def live_fit() -> LiveFitResponse:
    return LiveFitResponse(
        session_id="demo-session",
        garment_id="demo-garment",
        status="not-implemented",
    )


@router.post("/estimate-pose", response_model=PoseEstimationResponse)
async def estimate_pose_route(file: UploadFile = File(...)) -> PoseEstimationResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.load()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    landmarks = estimate_pose(image)
    return PoseEstimationResponse(landmarks=landmarks)
