from functools import lru_cache

from PIL import Image
from rembg import new_session, remove

from app.core.config import settings


@lru_cache(maxsize=1)
def _get_session():
    return new_session(settings.rembg_model_name)


def remove_background(image: Image.Image) -> Image.Image:
    """Return an RGBA image with the background made transparent."""
    result = remove(image, session=_get_session())
    return result.convert("RGBA")
