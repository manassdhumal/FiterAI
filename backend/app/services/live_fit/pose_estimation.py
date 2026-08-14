import numpy as np
from PIL import Image

def estimate_pose(image: Image.Image) -> list[dict]:
    import mediapipe as mp
    mp_pose = mp.solutions.pose
    
    # We use a static image mode for single frame inference
    with mp_pose.Pose(static_image_mode=True, model_complexity=1, min_detection_confidence=0.5) as pose:
        # Convert PIL to RGB NumPy array
        if image.mode != "RGB":
            image = image.convert("RGB")
        image_np = np.array(image)
        
        results = pose.process(image_np)
        
        landmarks_data = []
        if results.pose_landmarks:
            for idx, landmark in enumerate(results.pose_landmarks.landmark):
                # mediapipe landmarks are normalized [0.0, 1.0]
                landmarks_data.append({
                    "id": idx,
                    "name": mp_pose.PoseLandmark(idx).name,
                    "x": landmark.x,
                    "y": landmark.y,
                    "z": landmark.z,
                    "visibility": landmark.visibility
                })
        return landmarks_data
