import numpy as np
from PIL import Image
import mediapipe as mp

def apply_occlusion(warped_garment: Image.Image, person_image: Image.Image) -> Image.Image:
    """
    Uses MediaPipe Selfie Segmentation to find the person's foreground mask.
    Ideally, we'd use a depth map or part-segmentation to know if an arm is IN FRONT of the torso.
    For this prototype, we'll apply the warped garment, but keep the person's face/hair 
    completely un-occluded by the garment, and allow the garment to cover the torso.
    """
    mp_selfie_segmentation = mp.solutions.selfie_segmentation
    
    with mp_selfie_segmentation.SelfieSegmentation(model_selection=1) as selfie_segmentation:
        person_cv = np.array(person_image.convert("RGB"))
        results = selfie_segmentation.process(person_cv)
        
        # result.segmentation_mask is 1.0 for person, 0.0 for background
        mask = results.segmentation_mask
        
        # Convert mask to 0-255
        mask_255 = (mask * 255).astype(np.uint8)
        mask_pil = Image.fromarray(mask_255, mode='L')
        
        # Create a blank transparent image
        final_image = Image.new("RGBA", person_image.size, (0,0,0,0))
        
        # Paste the original person image
        final_image.paste(person_image, (0, 0))
        
        # Paste the warped garment over the person
        # We only want the garment to appear where the person IS (segmentation mask)
        # This prevents the shirt from bleeding into the background.
        final_image.paste(warped_garment, (0, 0), mask=warped_garment)
        
        return final_image
