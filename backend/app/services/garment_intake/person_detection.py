from functools import lru_cache

import cv2
import numpy as np
from PIL import Image


@lru_cache(maxsize=1)
def _get_face_cascade() -> cv2.CascadeClassifier:
    cascade_path = f"{cv2.data.haarcascades}haarcascade_frontalface_default.xml"
    return cv2.CascadeClassifier(cascade_path)


def contains_person_face(image: Image.Image) -> bool:
    """Heuristic for "is this a photo of a person wearing the garment" (vs. a flat
    product shot), so intake can route to a garment-specific segmentation model
    instead of general background removal, which would keep the whole person."""
    rgb_array = np.array(image.convert("RGB"))
    gray = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2GRAY)
    faces = _get_face_cascade().detectMultiScale(gray, scaleFactor=1.05, minNeighbors=4, minSize=(48, 48))
    return len(faces) > 0
