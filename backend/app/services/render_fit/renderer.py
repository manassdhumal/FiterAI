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
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """
    Derives ~10 body-surface control points from MediaPipe pose landmarks and
    returns matching (source_pts, target_pts) pairs for the TPS warp.

    Source points sample the garment's own flat canvas; target points are the
    corresponding positions on the person image canvas.  Any landmark pair that
    can't be resolved (low visibility or absent) is skipped so the TPS still
    has a valid, if sparser, set to work with.

    Garment anatomy columns (in source space):
      left  ← person's LEFT side  (MediaPipe's LEFT_*)
      right ← person's RIGHT side (MediaPipe's RIGHT_*)
    Mirror note: MediaPipe LEFT/RIGHT follow the *person's* body, not the
    viewer's left/right.
    """
    # Resolve key landmarks (all normalized 0–1).
    l_shoulder = _lm(lm_dict, "LEFT_SHOULDER")
    r_shoulder = _lm(lm_dict, "RIGHT_SHOULDER")
    l_hip = _lm(lm_dict, "LEFT_HIP")
    r_hip = _lm(lm_dict, "RIGHT_HIP")
    l_elbow = _lm(lm_dict, "LEFT_ELBOW")
    r_elbow = _lm(lm_dict, "RIGHT_ELBOW")

    # Derived points.
    neck = _mid(l_shoulder, r_shoulder)
    # Bring the neck point up slightly — the neckline sits above the shoulder midpoint.
    if neck and l_shoulder and r_shoulder:
        shoulder_span_y = abs((l_shoulder[1] + r_shoulder[1]) / 2)
        neck = (neck[0], neck[1] - 0.04)

    waist = _mid(
        _lerp(l_shoulder, l_hip, 0.65),
        _lerp(r_shoulder, r_hip, 0.65),
    )
    hem = _mid(l_hip, r_hip)

    # "Armpit" approximation: halfway between shoulder and elbow, at shoulder y.
    l_armpit = _mid(l_shoulder, l_elbow)
    if l_armpit and l_shoulder:
        l_armpit = (l_armpit[0], l_shoulder[1] + 0.03)
    r_armpit = _mid(r_shoulder, r_elbow)
    if r_armpit and r_shoulder:
        r_armpit = (r_armpit[0], r_shoulder[1] + 0.03)

    # Chest center — between neck and waist, horizontally centred.
    chest = _lerp(neck, waist, 0.4) if neck and waist else None

    # Waist sides.
    l_waist_side = _lerp(l_shoulder, l_hip, 0.65) if l_shoulder and l_hip else None
    r_waist_side = _lerp(r_shoulder, r_hip, 0.65) if r_shoulder and r_hip else None

    # Convert normalised landmark coords → pixel coords on the person canvas.
    def to_person(pt: tuple[float, float] | None) -> tuple[float, float] | None:
        if pt is None:
            return None
        return (pt[0] * width, pt[1] * height)

    # ── Garment source point layout ─────────────────────────────────────────
    # The garment is a flat image with the garment centred.  We approximate
    # its anatomy with a regular grid anchored by padding_frac insets:
    #
    #   col:  left edge  centre  right edge
    #   row:  neck       chest   waist      hem
    #
    px = padding_frac
    py = padding_frac
    gw, gh = garment_w, garment_h

    # Column x positions in garment space (person's right → garment left for mirrored cameras;
    # but garment product shots are typically "facing camera" so LEFT_SHOULDER maps to garment right col).
    g_left = gw * px
    g_center = gw * 0.5
    g_right = gw * (1 - px)

    # Row y positions in garment space.
    g_neck = gh * py
    g_chest = gh * 0.35
    g_waist = gh * 0.65
    g_hem = gh * (1 - py)

    # Build correspondence list: (garment_src, person_dst).
    pairs: list[tuple[tuple[float, float], tuple[float, float] | None]] = [
        # Neck / collar
        ((g_center, g_neck),       to_person(neck)),
        # Shoulders
        ((g_right,  g_neck + (g_chest - g_neck) * 0.3), to_person(r_shoulder)),
        ((g_left,   g_neck + (g_chest - g_neck) * 0.3), to_person(l_shoulder)),
        # Armpits
        ((g_right,  g_chest),      to_person(r_armpit)),
        ((g_left,   g_chest),      to_person(l_armpit)),
        # Chest center
        ((g_center, g_chest),      to_person(chest)),
        # Waist sides
        ((g_right,  g_waist),      to_person(r_waist_side)),
        ((g_left,   g_waist),      to_person(l_waist_side)),
        # Hem / hips
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

    # 3. Build TPS control points.
    src_pts, dst_pts = _build_control_points(lm_dict, width, height, garment_w, garment_h)

    if len(src_pts) < 4:
        raise ValueError(
            f"Too few visible landmarks to warp garment (got {len(src_pts)}, need at least 4)."
        )

    # 4. TPS warp.
    warped_garment = warp_garment(garment_img, src_pts, dst_pts, person_image.size)

    # 5. Occlusion-aware compositing.
    final_image = apply_occlusion(warped_garment, person_image, lm_dict)

    return final_image
