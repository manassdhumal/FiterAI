from uuid import uuid4

from fastapi import APIRouter

from app.schemas.session import SessionCreateResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionCreateResponse)
def create_session() -> SessionCreateResponse:
    return SessionCreateResponse(
        session_id=str(uuid4()),
        camera_mode="mirror",
        calibration_state="pending",
    )
