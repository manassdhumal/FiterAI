import os
from functools import lru_cache
from PIL import Image

# Use a lightweight CLIP model for zero-shot image classification
MODEL_NAME = "openai/clip-vit-base-patch32"

GARMENT_CATEGORIES = [
    "t-shirt",
    "shirt",
    "sweater",
    "jacket",
    "pants",
    "shorts",
    "skirt",
    "dress"
]

@lru_cache(maxsize=1)
def _get_classifier_pipeline():
    # Defer import so it doesn't slow down the whole app on startup
    from transformers import pipeline
    
    # We use zero-shot-image-classification
    return pipeline("zero-shot-image-classification", model=MODEL_NAME)

def classify_garment(image: Image.Image) -> str:
    """
    Classify the garment image into one of the known garment categories.
    """
    # Ensure it's in RGB (CLIP expects 3 channels)
    if image.mode != "RGB":
        image = image.convert("RGB")
        
    classifier = _get_classifier_pipeline()
    
    # Run the classification
    results = classifier(images=image, candidate_labels=GARMENT_CATEGORIES)
    
    # results is a list of dicts: [{'score': 0.9, 'label': 't-shirt'}, ...]
    # we return the top label
    if results and len(results) > 0:
        return results[0]["label"]
        
    return "unknown"
