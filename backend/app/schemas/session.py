from pydantic import BaseModel


class SessionCreateResponse(BaseModel):
    session_id: str
    camera_mode: str
    calibration_state: str
