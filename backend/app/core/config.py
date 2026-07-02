from pathlib import Path

from pydantic import BaseModel

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseModel):
    app_name: str = "FiterAI API"
    api_prefix: str = "/api"

    data_dir: Path = BACKEND_ROOT / "data"
    garments_dir: Path = BACKEND_ROOT / "data" / "garments"
    data_url_prefix: str = "/data"

    rembg_model_name: str = "u2net"
    garment_canvas_size: int = 1024
    garment_canvas_padding_ratio: float = 0.06


settings = Settings()
settings.garments_dir.mkdir(parents=True, exist_ok=True)
