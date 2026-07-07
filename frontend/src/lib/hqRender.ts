import { createGarmentPlacement, type FitAdjustments } from "./pose/garmentFit";
import type { PoseFrame } from "./pose/types";
import {
  blendLightingOntoCanvas,
  buildAnchorMeshRows,
  densifyMeshRows,
  paintMeshWarpedGarment,
  paintSegmentationMask,
  refineMeshRowsFromSegmentation,
  updateLightingBuffer,
  type GarmentBounds
} from "../hooks/usePoseOverlay";

// The live preview mesh-warps onto a small, CSS-box-sized on-screen canvas
// at 30-60fps, so its mesh density (2 subdivisions/gap -> 13 rows) is a
// real-time budget compromise. A captured look is a one-shot synchronous
// canvas operation with no frame-rate constraint, so it can afford a much
// denser mesh for smoother body-contour tracing.
const HQ_DENSE_ROW_SUBDIVISIONS_PER_GAP = 5;

// Same reasoning as the row density above: the live preview's column count
// is a real-time budget compromise (measured ~2ms/call at that density,
// leaving headroom but still a per-frame cost), while a captured still pays
// that cost exactly once, synchronously - so it can afford a visibly finer
// grid for smoother shading/less banding.
const HQ_MESH_COLUMN_SUBDIVISIONS = 8;

export type HqRenderInput = {
  fitAdjustments: FitAdjustments;
  frame: PoseFrame;
  garmentBounds: GarmentBounds | null;
  garmentImage: HTMLImageElement;
  video: HTMLVideoElement;
};

/**
 * Re-runs the same proven garment mesh-warp/segmentation/lighting pipeline
 * `usePoseOverlay`'s `drawGarmentImage` uses for the live preview, but
 * against the camera's full native resolution (not the smaller on-screen
 * canvas) and with a denser mesh, since a captured still has no real-time
 * budget. Mirrors `drawGarmentImage`'s own graceful degradation: falls back
 * to a plain mesh warp when no segmentation mask is available this frame.
 *
 * Produces the composite in the same unmirrored coordinate space as the raw
 * video frame (MediaPipe reads the video's actual pixels, unaffected by the
 * CSS mirror styling) - the caller is responsible for applying the same
 * outer mirror transform it already applies when compositing the raw video,
 * exactly as it already does for the live 2D overlay canvas.
 */
export function renderHqLook(input: HqRenderInput): HTMLCanvasElement | null {
  const { fitAdjustments, frame, garmentBounds, garmentImage, video } = input;

  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    return null;
  }

  const placement = createGarmentPlacement(frame, fitAdjustments);

  if (!placement) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  // frame.landmarks (and therefore placement.points) are already in the
  // video's native pixel space - no rescale needed here, unlike the live
  // preview path which maps down onto a smaller CSS-box-sized canvas.
  const canvasPoints = placement.points;
  const segmentationMask = frame.segmentationMask;

  if (segmentationMask) {
    const bufferCanvas = document.createElement("canvas");
    bufferCanvas.width = width;
    bufferCanvas.height = height;
    const bufferContext = bufferCanvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");

    if (bufferContext) {
      const denseRows = densifyMeshRows(buildAnchorMeshRows(canvasPoints), HQ_DENSE_ROW_SUBDIVISIONS_PER_GAP);
      const meshRows = refineMeshRowsFromSegmentation(denseRows, segmentationMask, width, height);
      const meshOutline = [...meshRows.map((row) => row.left), ...meshRows.slice().reverse().map((row) => row.right)];

      paintMeshWarpedGarment(bufferContext, garmentImage, meshRows, garmentBounds, 1, HQ_MESH_COLUMN_SUBDIVISIONS);

      const lightingCanvas = document.createElement("canvas");
      updateLightingBuffer(video, lightingCanvas);
      blendLightingOntoCanvas(bufferContext, lightingCanvas, meshOutline, 0.35);

      paintSegmentationMask(maskCanvas, segmentationMask);

      bufferContext.globalCompositeOperation = "destination-in";
      bufferContext.filter = "blur(2px)";
      bufferContext.drawImage(
        maskCanvas,
        0,
        0,
        maskCanvas.width,
        maskCanvas.height,
        0,
        0,
        bufferCanvas.width,
        bufferCanvas.height
      );
      bufferContext.filter = "none";
      bufferContext.globalCompositeOperation = "source-over";

      context.globalAlpha = 0.92;
      context.drawImage(bufferCanvas, 0, 0);
      context.globalAlpha = 1;

      return canvas;
    }
  }

  paintMeshWarpedGarment(
    context,
    garmentImage,
    buildAnchorMeshRows(canvasPoints),
    garmentBounds,
    0.92,
    HQ_MESH_COLUMN_SUBDIVISIONS
  );
  return canvas;
}
