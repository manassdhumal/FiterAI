from pydantic import BaseModel


class GarmentIntakeResponse(BaseModel):
    garment_id: str
    source_type: str
    status: str
    original_filename: str
    width: int
    height: int
    mask_coverage_ratio: float
    had_transparent_source: bool
    was_worn_photo: bool
    original_url: str
    clean_url: str
