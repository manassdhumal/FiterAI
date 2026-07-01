from pydantic import BaseModel


class LiveFitResponse(BaseModel):
    session_id: str
    garment_id: str
    status: str
