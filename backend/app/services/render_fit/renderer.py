from PIL import Image

from app.services.live_fit.pose_estimation import estimate_pose
from app.services.render_fit.warping import warp_garment
from app.services.render_fit.occlusion import apply_occlusion
from app.core.config import settings


def _lm(lm_dict: dict, name: str) -> tuple[float, float] | None:
    """Return (x_norm, y_norm) for a named landmark, or None if missing/low-vis."""
    entry = lm_dict.get(name)
    if entry is None or entry.get("visibility", 0) < 0.3:
        return None
    return entry["x"], entry["y"]


def _mid(a: tuple[float, float] | None, b: tuple[float, float] | None) -> tuple[float, float] | None:
    """Midpoint between two optional points — returns None if either is absent."""
    if a is None or b is None:
        return None
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _lerp(a: tuple[float, float] | None, b: tuple[float, float] | None, t: float) -> tuple[float, float] | None:
    """Linear interpolation between two optional points."""
    if a is None or b is None:
        return None
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _build_control_points(
    lm_dict: dict,
    width: int,
    height: int,
    garment_w: int,
    garment_h: int,
    padding_frac: float = 0.10,
    category: str = "t-shirt",
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """
    Derives ~10 body-surface control points from MediaPipe pose landmarks and
    returns matching (source_pts, target_pts) pairs for the TPS warp.
    """
    # Resolve key landmarks
    l_shoulder = _lm(lm_dict, "LEFT_SHOULDER")
    r_shoulder = _lm(lm_dict, "RIGHT_SHOULDER")
    l_hip = _lm(lm_dict, "LEFT_HIP")
    r_hip = _lm(lm_dict, "RIGHT_HIP")
    l_elbow = _lm(lm_dict, "LEFT_ELBOW")
    r_elbow = _lm(lm_dict, "RIGHT_ELBOW")
    l_knee = _lm(lm_dict, "LEFT_KNEE")
    r_knee = _lm(lm_dict, "RIGHT_KNEE")
    l_ankle = _lm(lm_dict, "LEFT_ANKLE")
    r_ankle = _lm(lm_dict, "RIGHT_ANKLE")

    def to_person(pt: tuple[float, float] | None) -> tuple[float, float] | None:
        if pt is None:
            return None
        return (pt[0] * width, pt[1] * height)

    px = padding_frac
    py = padding_frac
    gw, gh = garment_w, garment_h

    g_left = gw * px
    g_center = gw * 0.5
    g_right = gw * (1 - px)
    
    pairs = []

    if category in ["pants", "shorts", "skirt"]:
        # Bottom wear logic
        waist_l = _lerp(l_shoulder, l_hip, 0.7) if l_shoulder and l_hip else l_hip
        waist_r = _lerp(r_shoulder, r_hip, 0.7) if r_shoulder and r_hip else r_hip
        waist_mid = _mid(waist_l, waist_r)
        
        pelvis_mid = _mid(l_hip, r_hip)
        
        # Depending on shorts vs pants, hem is knee vs ankle
        if category in ["shorts", "skirt"]:
            hem_l = _lerp(l_hip, l_knee, 0.6) if l_hip and l_knee else None
            hem_r = _lerp(r_hip, r_knee, 0.6) if r_hip and r_knee else None
        else:
            hem_l = l_ankle
            hem_r = r_ankle
            
        hem_mid = _mid(hem_l, hem_r)

        g_waist = gh * py
        g_pelvis = gh * 0.4
        g_hem = gh * (1 - py)

        pairs = [
            ((g_left, g_waist), to_person(waist_l)),
            ((g_right, g_waist), to_person(waist_r)),
            ((g_center, g_waist), to_person(waist_mid)),
            ((g_left, g_pelvis), to_person(l_hip)),
            ((g_right, g_pelvis), to_person(r_hip)),
            ((g_center, g_pelvis), to_person(pelvis_mid)),
            ((g_left, g_hem), to_person(hem_l)),
            ((g_right, g_hem), to_person(hem_r)),
            ((g_center, g_hem), to_person(hem_mid)),
        ]
    else:
        # Top wear logic
        neck = _mid(l_shoulder, r_shoulder)
        if neck and l_shoulder and r_shoulder:
            neck = (neck[0], neck[1] - 0.04)

        waist = _mid(_lerp(l_shoulder, l_hip, 0.65), _lerp(r_shoulder, r_hip, 0.65))
        hem = _mid(l_hip, r_hip)

        # Drop the hem slightly for jackets
        if category in ["jacket", "sweater"] and hem:
            hem = (hem[0], hem[1] + 0.05)
            if l_hip: l_hip = (l_hip[0], l_hip[1] + 0.05)
            if r_hip: r_hip = (r_hip[0], r_hip[1] + 0.05)

        l_armpit = _mid(l_shoulder, l_elbow)
        if l_armpit and l_shoulder:
            # Widen armpits for looser fits
            offset_x = 0.03 if category in ["jacket", "sweater"] else 0.0
            l_armpit = (l_armpit[0] + offset_x, l_shoulder[1] + 0.03)
            
        r_armpit = _mid(r_shoulder, r_elbow)
        if r_armpit and r_shoulder:
            offset_x = -0.03 if category in ["jacket", "sweater"] else 0.0
            r_armpit = (r_armpit[0] + offset_x, r_shoulder[1] + 0.03)

        chest = _lerp(neck, waist, 0.4) if neck and waist else None
        
        l_waist_side = _lerp(l_shoulder, l_hip, 0.65) if l_shoulder and l_hip else None
        r_waist_side = _lerp(r_shoulder, r_hip, 0.65) if r_shoulder and r_hip else None

        if category in ["jacket", "sweater"]:
            if l_waist_side: l_waist_side = (l_waist_side[0] + 0.03, l_waist_side[1])
            if r_waist_side: r_waist_side = (r_waist_side[0] - 0.03, r_waist_side[1])

        g_neck = gh * py
        g_chest = gh * 0.35
        g_waist = gh * 0.65
        g_hem = gh * (1 - py)

        pairs = [
            ((g_center, g_neck),       to_person(neck)),
            ((g_right,  g_neck + (g_chest - g_neck) * 0.3), to_person(r_shoulder)),
            ((g_left,   g_neck + (g_chest - g_neck) * 0.3), to_person(l_shoulder)),
            ((g_right,  g_chest),      to_person(r_armpit)),
            ((g_left,   g_chest),      to_person(l_armpit)),
            ((g_center, g_chest),      to_person(chest)),
            ((g_right,  g_waist),      to_person(r_waist_side)),
            ((g_left,   g_waist),      to_person(l_waist_side)),
            ((g_right,  g_hem),        to_person(r_hip)),
            ((g_left,   g_hem),        to_person(l_hip)),
            ((g_center, g_hem),        to_person(hem)),
        ]

    src_pts: list[tuple[float, float]] = []
    dst_pts: list[tuple[float, float]] = []
    for src_pt, dst_pt in pairs:
        if dst_pt is not None:
            src_pts.append(src_pt)
            dst_pts.append(dst_pt)

    return src_pts, dst_pts


def generate_realistic_fit(person_image: Image.Image, garment_id: str) -> Image.Image:
    """
    Full render pipeline:
      1. Load the preprocessed (background-removed) garment.
      2. Run MediaPipe pose estimation on the person photo.
      3. Derive a rich ~10-point control-point set from pose landmarks.
      4. TPS-warp the garment to fit those body anchors.
      5. Composite with arm-aware occlusion.
    """
    # 1. Load garment.
    garment_path = settings.garments_dir / garment_id / "clean.png"
    if not garment_path.exists():
        raise ValueError(f"Garment {garment_id!r} not found.")
    garment_img = Image.open(garment_path).convert("RGBA")

    # 2. Pose estimation.
    landmarks = estimate_pose(person_image)
    if not landmarks:
        raise ValueError("Could not detect body landmarks in the provided image.")

    lm_dict = {lm["name"]: lm for lm in landmarks}

    width, height = person_image.size
    garment_w, garment_h = garment_img.size

    # 3. Read category from metadata.json if it exists.
    import json
    metadata_path = settings.garments_dir / garment_id / "metadata.json"
    category = "t-shirt" # Default
    if metadata_path.exists():
        try:
            with open(metadata_path, "r") as f:
                metadata = json.load(f)
                category = metadata.get("category", category)
        except Exception:
            pass

    # 4. Build TPS control points.
    src_pts, dst_pts = _build_control_points(lm_dict, width, height, garment_w, garment_h, category=category)

    if len(src_pts) < 4:
        raise ValueError(
            f"Too few visible landmarks to warp garment (got {len(src_pts)}, need at least 4)."
        )

    # 4. TPS warp.
    warped_garment = warp_garment(garment_img, src_pts, dst_pts, person_image.size)

    # 5. Occlusion-aware compositing.
    final_image = apply_occlusion(warped_garment, person_image, lm_dict)

    return final_image
