from pydantic import BaseModel


class LiveFitResponse(BaseModel):
    session_id: str
    garment_id: str
    status: str

class Landmark(BaseModel):
    id: int
    name: str
    x: float
    y: float
    z: float
    visibility: float

class PoseEstimationResponse(BaseModel):
    landmarks: list[Landmark]
