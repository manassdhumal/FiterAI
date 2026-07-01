from pydantic import BaseModel


class GarmentIntakeResponse(BaseModel):
    garment_id: str
    source_type: str
    status: str
