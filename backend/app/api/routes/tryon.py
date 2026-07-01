from fastapi import APIRouter

from app.schemas.tryon import LiveFitResponse

router = APIRouter(prefix="/tryon", tags=["tryon"])


@router.post("/live-fit", response_model=LiveFitResponse)
def live_fit() -> LiveFitResponse:
    return LiveFitResponse(
        session_id="demo-session",
        garment_id="demo-garment",
        status="not-implemented",
    )
