import cv2
import numpy as np
from PIL import Image


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

    # Build segment list: at minimum we need shoulder + one more point.
    pts_chain: list[np.ndarray] = []
    if shoulder is not None:
        pts_chain.append(shoulder)
    if elbow is not None:
        pts_chain.append(elbow)
    if wrist is not None:
        pts_chain.append(wrist)

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
    import mediapipe as mp

    img_w, img_h = person_image.size
    person_rgb = np.array(person_image.convert("RGB"))

    # ── 1. Body silhouette via Selfie Segmentation ──────────────────────────
    mp_seg = mp.solutions.selfie_segmentation
    with mp_seg.SelfieSegmentation(model_selection=1) as seg:
        seg_result = seg.process(person_rgb)

    # segmentation_mask: float32, 1.0 = person, 0.0 = background
    body_mask_f = seg_result.segmentation_mask  # shape (H, W)
    # Soft threshold → hard binary mask (uint8, 0 or 255)
    body_mask = (body_mask_f > 0.5).astype(np.uint8) * 255
    # Slight morphological close to fill small holes at garment/skin boundary.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    body_mask = cv2.morphologyEx(body_mask, cv2.MORPH_CLOSE, kernel)

    # ── 2. Arm occlusion mask ────────────────────────────────────────────────
    arm_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    if lm_dict:
        _draw_arm_mask(arm_mask, lm_dict, img_w, img_h, "LEFT")
        _draw_arm_mask(arm_mask, lm_dict, img_w, img_h, "RIGHT")
        # Smooth the arm mask edges so the transition isn't hard-edged.
        arm_mask = cv2.GaussianBlur(arm_mask, (15, 15), 0)

    # ── 3. Build final garment alpha ─────────────────────────────────────────
    garment_np = np.array(warped_garment.convert("RGBA"), dtype=np.uint8)

    garment_alpha = garment_np[:, :, 3].astype(np.float32)

    # Clip garment to body silhouette (prevent background bleed).
    body_frac = body_mask.astype(np.float32) / 255.0
    garment_alpha = garment_alpha * body_frac

    # Subtract arm regions so the person's arms appear in front.
    arm_frac = arm_mask.astype(np.float32) / 255.0
    garment_alpha = garment_alpha * (1.0 - arm_frac)

    garment_np[:, :, 3] = np.clip(garment_alpha, 0, 255).astype(np.uint8)

    # ── 4. Composite ─────────────────────────────────────────────────────────
    # Start with the original person image as the base layer.
    base = person_image.convert("RGBA")
    garment_pil = Image.fromarray(garment_np, mode="RGBA")

    final = Image.new("RGBA", person_image.size)
    final.paste(base, (0, 0))
    final.paste(garment_pil, (0, 0), mask=garment_pil)

    return final
