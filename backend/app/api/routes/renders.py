from uuid import uuid4

from fastapi import APIRouter

from app.schemas.render import RenderCreateResponse

router = APIRouter(prefix="/renders", tags=["renders"])


@router.post("", response_model=RenderCreateResponse)
def create_render() -> RenderCreateResponse:
    return RenderCreateResponse(
        render_id=str(uuid4()),
        status="queued",
    )
