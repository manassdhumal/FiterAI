import cv2
import numpy as np
from PIL import Image
from scipy.interpolate import RBFInterpolator


def warp_garment(
    garment_img: Image.Image,
    source_points: list[tuple[float, float]],
    target_points: list[tuple[float, float]],
    output_size: tuple[int, int],
) -> Image.Image:
    """
    Warps a garment image to fit target body-landmark control points using a
    thin-plate spline (TPS) interpolation.

    Unlike a 4-point perspective/homography transform, TPS can drive an
    arbitrary number of control-point correspondences and produces a smooth,
    globally-minimal-bending deformation — which is exactly what fabric
    wrapped around a curved torso needs.

    source_points: list of (x, y) in garment image space
    target_points: list of (x, y) in output (person) image space
    output_size:   (width, height) of the output canvas
    """
    if len(source_points) != len(target_points) or len(source_points) < 4:
        raise ValueError("source_points and target_points must match and have at least 4 points.")

    src = np.array(source_points, dtype=np.float64)   # shape (N, 2) — [x, y]
    dst = np.array(target_points, dtype=np.float64)

    out_w, out_h = output_size

    # Build a TPS interpolator: given destination (x, y) → predicts source (x, y).
    # We build the inverse map so we can do destination-driven sampling.
    # RBFInterpolator expects (N, d) input and (N, k) output.
    tps_x = RBFInterpolator(dst, src[:, 0:1], kernel="thin_plate_spline", smoothing=0.0)
    tps_y = RBFInterpolator(dst, src[:, 1:2], kernel="thin_plate_spline", smoothing=0.0)

    # Generate a dense grid of destination pixel coordinates.
    ys, xs = np.mgrid[0:out_h, 0:out_w]
    grid = np.column_stack([xs.ravel(), ys.ravel()]).astype(np.float64)  # (H*W, 2)

    # Map each destination pixel back to its source location.
    src_x = tps_x(grid).ravel().astype(np.float32).reshape(out_h, out_w)
    src_y = tps_y(grid).ravel().astype(np.float32).reshape(out_h, out_w)

    # Remap using OpenCV (bicubic, edges clamp to transparent).
    garment_np = np.array(garment_img.convert("RGBA"), dtype=np.uint8)
    garment_h, garment_w = garment_np.shape[:2]

    # Clamp source coords to valid range so border pixels stay transparent.
    src_x_clamped = np.clip(src_x, 0, garment_w - 1)
    src_y_clamped = np.clip(src_y, 0, garment_h - 1)

    # Build an out-of-bounds mask — pixels that map outside the garment get alpha=0.
    oob_mask = (
        (src_x < 0) | (src_x >= garment_w) |
        (src_y < 0) | (src_y >= garment_h)
    )

    warped_np = cv2.remap(
        garment_np,
        src_x_clamped,
        src_y_clamped,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )

    # Zero out alpha for pixels that mapped outside the garment.
    warped_np[oob_mask, 3] = 0

    return Image.fromarray(warped_np, mode="RGBA")
