from pydantic import BaseModel


class RenderCreateResponse(BaseModel):
    render_id: str
    status: str
