import cv2
import numpy as np
from PIL import Image

def warp_garment(garment_img: Image.Image, source_points: list[tuple[float, float]], target_points: list[tuple[float, float]], output_size: tuple[int, int]) -> Image.Image:
    """
    Warps a garment image to fit the target points on the person.
    Uses a perspective transform (homography) for a simple but effective 2.5D warp.
    """
    if len(source_points) != 4 or len(target_points) != 4:
        raise ValueError("Exactly 4 points are required for perspective warping.")

    # Convert PIL Image to OpenCV format (numpy array)
    garment_cv = np.array(garment_img)
    if garment_cv.shape[2] == 4:
        # Separate RGB and Alpha
        bgr = cv2.cvtColor(garment_cv, cv2.COLOR_RGBA2BGRA)
    else:
        bgr = cv2.cvtColor(garment_cv, cv2.COLOR_RGB2BGRA)
        
    src_pts = np.float32(source_points)
    dst_pts = np.float32(target_points)

    # Calculate Homography
    matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)

    # Warp image
    width, height = output_size
    warped_cv = cv2.warpPerspective(bgr, matrix, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))

    # Convert back to PIL
    warped_pil = Image.fromarray(cv2.cvtColor(warped_cv, cv2.COLOR_BGRA2RGBA))
    return warped_pil
