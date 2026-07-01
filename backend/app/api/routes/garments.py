from uuid import uuid4

from fastapi import APIRouter

from app.schemas.garment import GarmentIntakeResponse

router = APIRouter(prefix="/garments", tags=["garments"])


@router.post("/intake", response_model=GarmentIntakeResponse)
def intake_garment() -> GarmentIntakeResponse:
    return GarmentIntakeResponse(
        garment_id=str(uuid4()),
        source_type="upload",
        status="queued",
    )
