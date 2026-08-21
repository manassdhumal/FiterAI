import threading
import cv2
import mediapipe as mp
import numpy as np
from PIL import Image

_thread_local = threading.local()

def _get_segmenter():
    if not hasattr(_thread_local, "segmenter"):
        _thread_local.segmenter = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)
    return _thread_local.segmenter


# Half-width of the arm mask polygon as a fraction of the image width.
# Wider = more of the arm appears in front of the garment.
_ARM_WIDTH_FRAC = 0.055


def _draw_arm_mask(
    mask: np.ndarray,
    lm_dict: dict,
    img_w: int,
    img_h: int,
    side: str,
) -> None:
    """
    Draws a filled polygon approximating one arm (shoulder → elbow → wrist)
    into *mask* (uint8, same size as the person image).

    The polygon is a thickened line segment (capsule shape achieved by two
    parallel offset lines closed at both ends) so it covers forearm and upper
    arm without needing a real segmentation model.

    side: "LEFT" or "RIGHT" (MediaPipe body side)
    """
    def get_pt(name: str) -> np.ndarray | None:
        lm = lm_dict.get(f"{side}_{name}")
        if lm is None or lm.get("visibility", 0) < 0.35:
            return None
        return np.array([lm["x"] * img_w, lm["y"] * img_h], dtype=np.float32)

    shoulder = get_pt("SHOULDER")
    elbow    = get_pt("ELBOW")
    wrist    = get_pt("WRIST")
    index    = get_pt("INDEX")
    pinky    = get_pt("PINKY")

    # Build segment list: at minimum we need shoulder + one more point.
    pts_chain: list[np.ndarray] = []
    if shoulder is not None:
        pts_chain.append(shoulder)
    if elbow is not None:
        pts_chain.append(elbow)
    if wrist is not None:
        pts_chain.append(wrist)
        
    if index is not None and pinky is not None:
        hand_mid = (index + pinky) / 2.0
        pts_chain.append(hand_mid)

    if len(pts_chain) < 2:
        return  # Not enough landmarks — skip this arm.

    half_w = img_w * _ARM_WIDTH_FRAC

    # Build a thickened polygon for each segment along the chain.
    for i in range(len(pts_chain) - 1):
        a, b = pts_chain[i], pts_chain[i + 1]
        direction = b - a
        length = np.linalg.norm(direction)
        if length < 1e-3:
            continue
        perp = np.array([-direction[1], direction[0]], dtype=np.float32) / length * half_w

        quad = np.array([
            a + perp,
            b + perp,
            b - perp,
            a - perp,
        ], dtype=np.int32)

        cv2.fillPoly(mask, [quad], color=255)

        # Round caps at each end.
        for center in (a, b):
            cv2.circle(mask, (int(center[0]), int(center[1])), int(half_w), 255, -1)


def _draw_head_neck_mask(
    mask: np.ndarray,
    lm_dict: dict,
    img_w: int,
    img_h: int,
) -> None:
    """
    Draws a polygon covering the face and neck to prevent high collars from bleeding over.
    """
    def get_pt(name: str) -> np.ndarray | None:
        lm = lm_dict.get(name)
        if lm is None or lm.get("visibility", 0) < 0.35:
            return None
        return np.array([lm["x"] * img_w, lm["y"] * img_h], dtype=np.float32)

    l_ear = get_pt("LEFT_EAR")
    r_ear = get_pt("RIGHT_EAR")
    nose = get_pt("NOSE")
    l_shoulder = get_pt("LEFT_SHOULDER")
    r_shoulder = get_pt("RIGHT_SHOULDER")

    if not (l_ear is not None and r_ear is not None and nose is not None):
        return

    # Use the distance between ears to define a radius for the head
    head_width = np.linalg.norm(r_ear - l_ear)
    radius = int(head_width * 0.8)

    # Draw a circle for the head
    cv2.circle(mask, (int(nose[0]), int(nose[1])), radius, 255, -1)

    # Draw a polygon for the neck connecting the head to slightly above the shoulders
    if l_shoulder is not None and r_shoulder is not None:
        neck_left = nose + (l_shoulder - nose) * 0.6
        neck_right = nose + (r_shoulder - nose) * 0.6
        
        quad = np.array([
            l_ear,
            r_ear,
            neck_right,
            neck_left,
        ], dtype=np.int32)
        cv2.fillPoly(mask, [quad], color=255)


def apply_occlusion(
    warped_garment: Image.Image,
    person_image: Image.Image,
    lm_dict: dict | None = None,
) -> Image.Image:
    """
    Composites the warped garment over the person image with arm-aware occlusion.

    Steps:
      1. Use MediaPipe Selfie Segmentation to keep the garment inside the
         body silhouette (no bleed into the background).
      2. Draw arm polygon masks from pose landmarks (if available) and cut
         them out of the garment alpha channel — so the person's arms render
         in front of the garment, not hidden under it.
      3. Composite: person → garment (clipped) → final RGBA.
    """
    img_w, img_h = person_image.size
    person_rgb = np.array(person_image.convert("RGB"))

    # ── 1. Body silhouette via Selfie Segmentation ──────────────────────────
    seg = _get_segmenter()
    # To process an image it needs to be RGB (or use process directly)
    seg_result = seg.process(person_rgb)

    # segmentation_mask: float32, 1.0 = person, 0.0 = background
    body_mask_f = seg_result.segmentation_mask  # shape (H, W)
    # Soft edge blending (feathered mask) for realistic composite
    body_mask = (body_mask_f * 255).astype(np.uint8)
    body_mask = cv2.GaussianBlur(body_mask, (7, 7), 0)

    # ── 2. Arm occlusion mask ────────────────────────────────────────────────
    arm_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    head_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    
    if lm_dict:
        _draw_arm_mask(arm_mask, lm_dict, img_w, img_h, "LEFT")
        _draw_arm_mask(arm_mask, lm_dict, img_w, img_h, "RIGHT")
        _draw_head_neck_mask(head_mask, lm_dict, img_w, img_h)
        
        # Smooth the occlusion mask edges so the transition isn't hard-edged.
        arm_mask = cv2.GaussianBlur(arm_mask, (15, 15), 0)
        head_mask = cv2.GaussianBlur(head_mask, (15, 15), 0)

    # ── 3. Build final garment alpha ─────────────────────────────────────────
    garment_np = np.array(warped_garment.convert("RGBA"), dtype=np.uint8)

    garment_alpha = garment_np[:, :, 3].astype(np.float32)

    # Clip garment to body silhouette (prevent background bleed).
    body_frac = body_mask.astype(np.float32) / 255.0
    garment_alpha = garment_alpha * body_frac

    # Subtract arm regions so the person's arms appear in front.
    arm_frac = arm_mask.astype(np.float32) / 255.0
    garment_alpha = garment_alpha * (1.0 - arm_frac)

    # Subtract head and neck regions.
    head_frac = head_mask.astype(np.float32) / 255.0
    garment_alpha = garment_alpha * (1.0 - head_frac)

    garment_np[:, :, 3] = np.clip(garment_alpha, 0, 255).astype(np.uint8)

    # ── 4. Composite ─────────────────────────────────────────────────────────
    # Start with the original person image as the base layer.
    base = person_image.convert("RGBA")
    garment_pil = Image.fromarray(garment_np, mode="RGBA")

    final = Image.new("RGBA", person_image.size)
    final.paste(base, (0, 0))
    final.paste(garment_pil, (0, 0), mask=garment_pil)

    return final
