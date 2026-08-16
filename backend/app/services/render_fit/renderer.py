import os
from PIL import Image
from app.services.live_fit.pose_estimation import estimate_pose
from app.services.render_fit.warping import warp_garment
from app.services.render_fit.occlusion import apply_occlusion
from app.core.config import settings

def generate_realistic_fit(person_image: Image.Image, garment_id: str) -> Image.Image:
    # 1. Load the clean garment image
    garment_path = settings.garments_dir / garment_id / "clean.png"
    if not garment_path.exists():
        raise ValueError(f"Garment {garment_id} not found.")
    garment_img = Image.open(garment_path).convert("RGBA")
    
    # 2. Get landmarks for person
    landmarks = estimate_pose(person_image)
    if not landmarks:
        raise ValueError("Could not detect body landmarks in the provided image.")
        
    # Convert landmarks list to dictionary for easy access by name
    lm_dict = {lm["name"]: lm for lm in landmarks}
    
    width, height = person_image.size
    
    # 3. Define target points based on person landmarks
    # For a shirt, we want left shoulder, right shoulder, left hip, right hip
    required_lms = ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"]
    for lm in required_lms:
        if lm not in lm_dict:
            raise ValueError(f"Missing required landmark: {lm}")
            
    # Target points: [Top-Left, Top-Right, Bottom-Left, Bottom-Right]
    # Mediapipe returns normalized coordinates (0.0 to 1.0)
    target_pts = [
        (lm_dict["RIGHT_SHOULDER"]["x"] * width, lm_dict["RIGHT_SHOULDER"]["y"] * height),
        (lm_dict["LEFT_SHOULDER"]["x"] * width, lm_dict["LEFT_SHOULDER"]["y"] * height),
        (lm_dict["RIGHT_HIP"]["x"] * width, lm_dict["RIGHT_HIP"]["y"] * height),
        (lm_dict["LEFT_HIP"]["x"] * width, lm_dict["LEFT_HIP"]["y"] * height)
    ]
    
    # Source points: assume garment occupies central area of its canvas
    gw, gh = garment_img.size
    padding_x = gw * 0.15
    padding_y = gh * 0.15
    src_pts = [
        (padding_x, padding_y),             # Top-Left
        (gw - padding_x, padding_y),        # Top-Right
        (padding_x, gh - padding_y),        # Bottom-Left
        (gw - padding_x, gh - padding_y)    # Bottom-Right
    ]
    
    # 4. Warp the garment
    warped_garment = warp_garment(garment_img, src_pts, target_pts, person_image.size)
    
    # 5. Apply occlusion and compose
    final_image = apply_occlusion(warped_garment, person_image)
    
    return final_image
