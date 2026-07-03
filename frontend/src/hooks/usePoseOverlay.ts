import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";

import {
  createGarmentPlacement,
  garmentMeshRowIndexPairs,
  garmentMeshRowSourceFractions,
  type FitAdjustments,
  type Point
} from "../lib/pose/garmentFit";
import { createPreferredPoseDetector } from "../lib/pose/poseDetector";
import type { DetectorMode, PoseDetector } from "../lib/pose/poseDetector";
import {
  DEFAULT_LANDMARK_SMOOTHING_FACTOR,
  smoothLandmarks,
  toLandmarkHistory,
  type LandmarkHistory
} from "../lib/pose/smoothing";
import type { PoseFrame, PoseLandmark, SegmentationMask } from "../lib/pose/types";

type SegmentationBuffers = {
  bufferCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
};

type GarmentBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type MeshRow = {
  left: Point;
  right: Point;
  sourceFraction: number;
};

// Number of interpolated rows inserted between each pair of adjacent anchor
// rows when a segmentation mask is available to refine them - 2 per gap
// across 4 gaps takes the mesh from 5 rows to 13, so the garment can trace
// real body curvature (chest, waist, hips) instead of linearly interpolating
// across large gaps between sparse landmark-derived anchors.
const DENSE_ROW_SUBDIVISIONS_PER_GAP = 2;

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function buildAnchorMeshRows(canvasPoints: Point[]): MeshRow[] {
  return garmentMeshRowIndexPairs.map(([leftIdx, rightIdx], index) => ({
    left: canvasPoints[leftIdx],
    right: canvasPoints[rightIdx],
    sourceFraction: garmentMeshRowSourceFractions[index]
  }));
}

export function densifyMeshRows(anchorRows: MeshRow[], subdivisionsPerGap: number): MeshRow[] {
  const dense: MeshRow[] = [];

  anchorRows.forEach((row, index) => {
    dense.push(row);
    const next = anchorRows[index + 1];

    if (!next) {
      return;
    }

    for (let step = 1; step <= subdivisionsPerGap; step += 1) {
      const t = step / (subdivisionsPerGap + 1);
      dense.push({
        left: lerpPoint(row.left, next.left, t),
        right: lerpPoint(row.right, next.right, t),
        sourceFraction: row.sourceFraction + (next.sourceFraction - row.sourceFraction) * t
      });
    }
  });

  return dense;
}

type UsePoseOverlayOptions = {
  enabled: boolean;
  fitAdjustments: FitAdjustments;
  garmentSrc: string | null;
  useNaturalGarmentShape: boolean;
  videoRef: RefObject<HTMLVideoElement>;
};

type UsePoseOverlayResult = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  detectorMessage: string;
  garmentMessage: string;
  overlayMode: DetectorMode;
  segmentationMessage: string;
};

function resizeCanvas(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const width = video.clientWidth;
  const height = video.clientHeight;
  const pixelRatio = window.devicePixelRatio || 1;

  if (!width || !height) {
    return;
  }

  if (
    canvas.width !== Math.floor(width * pixelRatio) ||
    canvas.height !== Math.floor(height * pixelRatio)
  ) {
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
}

function drawLandmark(
  context: CanvasRenderingContext2D,
  landmark: PoseLandmark,
  scaleX: number,
  scaleY: number
) {
  context.beginPath();
  context.arc(landmark.x * scaleX, landmark.y * scaleY, 5, 0, Math.PI * 2);
  context.fill();
}

function traceGarmentPath(
  context: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  scaleX: number,
  scaleY: number
) {
  points.forEach((point, index) => {
    const x = point.x * scaleX;
    const y = point.y * scaleY;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.closePath();
}

function drawGarmentGuide(
  context: CanvasRenderingContext2D,
  frame: PoseFrame,
  fitAdjustments: FitAdjustments,
  scaleX: number,
  scaleY: number
) {
  const placement = createGarmentPlacement(frame, fitAdjustments);

  if (!placement) {
    return;
  }

  context.save();
  context.beginPath();
  traceGarmentPath(context, placement.points, scaleX, scaleY);
  context.fillStyle = "rgba(255, 173, 96, 0.26)";
  context.strokeStyle = "rgba(255, 214, 153, 0.98)";
  context.lineWidth = 3;
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(placement.points[0].x * scaleX, placement.points[0].y * scaleY);
  context.quadraticCurveTo(
    placement.necklineControl.x * scaleX,
    placement.necklineControl.y * scaleY,
    placement.points[placement.points.length - 1].x * scaleX,
    placement.points[placement.points.length - 1].y * scaleY
  );
  context.strokeStyle = "rgba(255, 245, 233, 0.95)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "rgba(255, 250, 244, 0.92)";
  context.font = `${Math.max(14, Math.round(18 * scaleX))}px Georgia`;
  context.fillText(
    "Garment fit region",
    (placement.center.x - 70) * scaleX,
    (placement.center.y + 85) * scaleY
  );
  context.restore();
}

function computeOpaqueBounds(image: HTMLImageElement): GarmentBounds | null {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (!width || !height) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0);

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }

  const alphaThreshold = 12;
  const step = 2;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (pixels[(y * width + x) * 4 + 3] > alphaThreshold) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) {
    return null;
  }

  return {
    bottom: maxY / height,
    left: minX / width,
    right: maxX / width,
    top: minY / height
  };
}

// Computes the 2x3 affine matrix [a, b, c, d, e, f] mapping source triangle
// (s0, s1, s2) onto destination triangle (d0, d1, d2), i.e. a*x + c*y + e = u
// and b*x + d*y + f = v for each correspondence.
function computeAffineTransform(
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point
): [number, number, number, number, number, number] | null {
  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);

  if (Math.abs(denom) < 1e-6) {
    return null;
  }

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;

  return [a, b, c, d, e, f];
}

function expandTriangleFromCentroid(a: Point, b: Point, c: Point, factor: number): [Point, Point, Point] {
  const centroid = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  const expand = (point: Point) => ({
    x: centroid.x + (point.x - centroid.x) * factor,
    y: centroid.y + (point.y - centroid.y) * factor
  });

  return [expand(a), expand(b), expand(c)];
}

function paintWarpedTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: [Point, Point, Point],
  destination: [Point, Point, Point]
) {
  const transform = computeAffineTransform(
    source[0],
    source[1],
    source[2],
    destination[0],
    destination[1],
    destination[2]
  );

  if (!transform) {
    return;
  }

  // Clip is expanded slightly beyond the exact triangle so adjacent
  // triangles overlap a hair instead of leaving anti-aliased seam gaps.
  const [clip0, clip1, clip2] = expandTriangleFromCentroid(
    destination[0],
    destination[1],
    destination[2],
    1.02
  );

  context.save();
  context.beginPath();
  context.moveTo(clip0.x, clip0.y);
  context.lineTo(clip1.x, clip1.y);
  context.lineTo(clip2.x, clip2.y);
  context.closePath();
  context.clip();
  context.transform(...transform);
  context.drawImage(image, 0, 0);
  context.restore();
}

function paintMeshWarpedGarment(
  context: CanvasRenderingContext2D,
  garmentImage: HTMLImageElement,
  rows: MeshRow[],
  garmentBounds: GarmentBounds | null,
  alpha: number
) {
  const imageWidth = garmentImage.naturalWidth;
  const imageHeight = garmentImage.naturalHeight;

  if (!imageWidth || !imageHeight) {
    return;
  }

  const bounds = garmentBounds ?? { bottom: 1, left: 0, right: 1, top: 0 };
  const contentLeft = bounds.left * imageWidth;
  const contentRight = bounds.right * imageWidth;
  const contentTop = bounds.top * imageHeight;
  const contentHeight = (bounds.bottom - bounds.top) * imageHeight;

  context.save();
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
    const top = rows[rowIndex];
    const bottom = rows[rowIndex + 1];

    const sourceTopY = contentTop + top.sourceFraction * contentHeight;
    const sourceBottomY = contentTop + bottom.sourceFraction * contentHeight;

    const sourceTopLeft = { x: contentLeft, y: sourceTopY };
    const sourceTopRight = { x: contentRight, y: sourceTopY };
    const sourceBottomLeft = { x: contentLeft, y: sourceBottomY };
    const sourceBottomRight = { x: contentRight, y: sourceBottomY };

    paintWarpedTriangle(
      context,
      garmentImage,
      [sourceTopLeft, sourceTopRight, sourceBottomLeft],
      [top.left, top.right, bottom.left]
    );
    paintWarpedTriangle(
      context,
      garmentImage,
      [sourceTopRight, sourceBottomRight, sourceBottomLeft],
      [top.right, bottom.right, bottom.left]
    );
  }

  context.restore();
}

// Scans one row of the live segmentation mask for the real left/right body
// edges, within a search window around the landmark-derived guess (bounded
// so it can't wander onto an outstretched arm or background noise).
export function sampleSilhouetteRowEdges(
  mask: SegmentationMask,
  canvasY: number,
  canvasWidth: number,
  canvasHeight: number,
  expectedLeftX: number,
  expectedRightX: number
): { left: number; right: number } | null {
  const maskY = Math.round((canvasY / canvasHeight) * mask.height);

  if (maskY < 0 || maskY >= mask.height) {
    return null;
  }

  const expectedCenterX = (expectedLeftX + expectedRightX) / 2;
  const expectedHalfWidth = Math.max(1, (expectedRightX - expectedLeftX) / 2);
  const searchHalfWidth = expectedHalfWidth * 1.8;
  const searchLeftX = Math.max(0, expectedCenterX - searchHalfWidth);
  const searchRightX = Math.min(canvasWidth, expectedCenterX + searchHalfWidth);

  const maskSearchLeft = Math.max(0, Math.round((searchLeftX / canvasWidth) * mask.width));
  const maskSearchRight = Math.min(mask.width - 1, Math.round((searchRightX / canvasWidth) * mask.width));

  const threshold = 0.5;
  const rowOffset = maskY * mask.width;
  let minX = -1;
  let maxX = -1;

  for (let x = maskSearchLeft; x <= maskSearchRight; x += 1) {
    if (mask.data[rowOffset + x] > threshold) {
      if (minX === -1) {
        minX = x;
      }
      maxX = x;
    }
  }

  if (minX === -1) {
    return null;
  }

  return {
    left: (minX / mask.width) * canvasWidth,
    right: (maxX / mask.width) * canvasWidth
  };
}

// Nudges each mesh row's left/right destination toward the real body
// silhouette from the live segmentation mask, instead of the fixed
// landmark-derived proportional guess. Blended (not a hard replace) to
// damp frame-to-frame mask noise; falls back to the original landmark
// point whenever a row's silhouette can't be read confidently (too
// narrow a match, or nothing found in the search window).
export function refineMeshRowsFromSegmentation(
  rows: MeshRow[],
  segmentationMask: SegmentationMask,
  canvasWidth: number,
  canvasHeight: number
): MeshRow[] {
  const blendFactor = 0.7;
  const minValidRowWidth = 8;

  return rows.map((row) => {
    const rowY = (row.left.y + row.right.y) / 2;

    const edges = sampleSilhouetteRowEdges(
      segmentationMask,
      rowY,
      canvasWidth,
      canvasHeight,
      row.left.x,
      row.right.x
    );

    if (!edges || edges.right - edges.left < minValidRowWidth) {
      return row;
    }

    return {
      ...row,
      left: { ...row.left, x: row.left.x + (edges.left - row.left.x) * blendFactor },
      right: { ...row.right, x: row.right.x + (edges.right - row.right.x) * blendFactor }
    };
  });
}

// Blends a soft, blurred sample of the live video's own luminance onto the
// garment so it picks up the room's actual lighting (dims in shadow, brightens
// under light) instead of sitting on top as a flat, unlit cutout. Clipped to
// the garment's own placement polygon so the effect can't spill onto the
// background - safe to call before the segmentation destination-in step,
// which re-clips to the exact body silhouette afterward anyway.
export function paintSceneLighting(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  lightingCanvas: HTMLCanvasElement,
  clipPoints: Point[],
  intensity: number
) {
  const lightWidth = 48;
  const lightHeight = 64;

  if (lightingCanvas.width !== lightWidth || lightingCanvas.height !== lightHeight) {
    lightingCanvas.width = lightWidth;
    lightingCanvas.height = lightHeight;
  }

  const lightContext = lightingCanvas.getContext("2d");
  if (!lightContext || clipPoints.length === 0) {
    return;
  }

  lightContext.save();
  lightContext.filter = "grayscale(1) blur(3px)";
  lightContext.drawImage(video, 0, 0, lightWidth, lightHeight);
  lightContext.restore();

  context.save();
  context.beginPath();
  clipPoints.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.closePath();
  context.clip();

  context.globalCompositeOperation = "soft-light";
  context.globalAlpha = intensity;
  context.drawImage(lightingCanvas, 0, 0, context.canvas.width, context.canvas.height);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.restore();
}

function paintSegmentationMask(maskCanvas: HTMLCanvasElement, mask: SegmentationMask) {
  if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
    maskCanvas.width = mask.width;
    maskCanvas.height = mask.height;
  }

  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) {
    return;
  }

  const imageData = maskContext.createImageData(mask.width, mask.height);
  for (let index = 0; index < mask.data.length; index += 1) {
    const alpha = Math.max(0, Math.min(255, Math.round(mask.data[index] * 255)));
    const offset = index * 4;
    imageData.data[offset] = 255;
    imageData.data[offset + 1] = 255;
    imageData.data[offset + 2] = 255;
    imageData.data[offset + 3] = alpha;
  }
  maskContext.putImageData(imageData, 0, 0);
}

function drawGarmentImage(
  context: CanvasRenderingContext2D,
  frame: PoseFrame,
  garmentImage: HTMLImageElement,
  fitAdjustments: FitAdjustments,
  scaleX: number,
  scaleY: number,
  useNaturalGarmentShape: boolean,
  segmentationBuffers: SegmentationBuffers | null,
  garmentBounds: GarmentBounds | null,
  video: HTMLVideoElement,
  lightingCanvas: HTMLCanvasElement
): boolean {
  const placement = createGarmentPlacement(frame, fitAdjustments);

  if (!placement) {
    return false;
  }

  const canvasPoints = placement.points.map((point) => ({
    x: point.x * scaleX,
    y: point.y * scaleY
  }));
  const xValues = canvasPoints.map((point) => point.x);
  const yValues = canvasPoints.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const drawWidth = Math.max(1, maxX - minX);
  const drawHeight = Math.max(1, maxY - minY);
  const rotationRadians = (fitAdjustments.rotation * Math.PI) / 180;
  const centerX = placement.center.x * scaleX;
  const centerY = placement.center.y * scaleY;

  if (!useNaturalGarmentShape) {
    context.save();
    context.beginPath();
    traceGarmentPath(context, placement.points, scaleX, scaleY);
    context.clip();
    context.globalAlpha = 0.92;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.translate(centerX, centerY);
    context.rotate(rotationRadians);
    context.drawImage(garmentImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();

    context.save();
    context.beginPath();
    traceGarmentPath(context, placement.points, scaleX, scaleY);
    context.strokeStyle = "rgba(255, 235, 214, 0.95)";
    context.lineWidth = 2;
    context.stroke();
    context.restore();

    return true;
  }

  const segmentationMask = frame.segmentationMask;

  if (segmentationMask && segmentationBuffers) {
    const { bufferCanvas, maskCanvas } = segmentationBuffers;

    if (bufferCanvas.width !== context.canvas.width || bufferCanvas.height !== context.canvas.height) {
      bufferCanvas.width = context.canvas.width;
      bufferCanvas.height = context.canvas.height;
    }

    const bufferContext = bufferCanvas.getContext("2d");

    if (bufferContext) {
      // Draw the garment's real silhouette into an offscreen buffer, then
      // intersect it with the live body segmentation mask so the garment is
      // only visible where the real body actually is, not just inside the
      // landmark-derived guide box. The mesh itself is also densified (5
      // anchor rows -> 13) and each row bent toward the segmentation mask's
      // real per-row body width, so the garment's internal contour follows
      // real body curvature instead of linearly interpolating across large
      // gaps between a few sparse landmark-derived anchors.
      const denseRows = densifyMeshRows(buildAnchorMeshRows(canvasPoints), DENSE_ROW_SUBDIVISIONS_PER_GAP);
      const meshRows = refineMeshRowsFromSegmentation(
        denseRows,
        segmentationMask,
        context.canvas.width,
        context.canvas.height
      );
      const meshOutline = [...meshRows.map((row) => row.left), ...meshRows.slice().reverse().map((row) => row.right)];

      bufferContext.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
      paintMeshWarpedGarment(bufferContext, garmentImage, meshRows, garmentBounds, 1);
      if (video.videoWidth && video.videoHeight) {
        paintSceneLighting(bufferContext, video, lightingCanvas, meshOutline, 0.35);
      }
      paintSegmentationMask(maskCanvas, segmentationMask);

      bufferContext.globalCompositeOperation = "destination-in";
      // A couple of blurred pixels at the cutout edge reads as fabric meeting
      // skin/background, instead of the harsh, hard-edged "sticker" look of
      // an unblurred alpha cutout.
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

      context.save();
      context.globalAlpha = 0.92;
      context.drawImage(bufferCanvas, 0, 0);
      context.restore();

      return true;
    }
  }

  paintMeshWarpedGarment(context, garmentImage, buildAnchorMeshRows(canvasPoints), garmentBounds, 0.92);
  return true;
}

function drawPoseFrame(
  context: CanvasRenderingContext2D,
  frame: PoseFrame,
  video: HTMLVideoElement,
  fitAdjustments: FitAdjustments,
  garmentImage: HTMLImageElement | null,
  useNaturalGarmentShape: boolean,
  segmentationBuffers: SegmentationBuffers | null,
  garmentBounds: GarmentBounds | null,
  lightingCanvas: HTMLCanvasElement
) {
  const sourceWidth = video.videoWidth || video.clientWidth || 1;
  const sourceHeight = video.videoHeight || video.clientHeight || 1;
  const scaleX = context.canvas.width / sourceWidth;
  const scaleY = context.canvas.height / sourceHeight;
  const landmarksById = new Map(frame.landmarks.map((landmark) => [landmark.id, landmark]));

  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.lineWidth = 4;
  context.strokeStyle = "rgba(255, 244, 232, 0.88)";
  context.fillStyle = "rgba(210, 95, 43, 0.95)";

  const drewGarment = garmentImage
    ? drawGarmentImage(
        context,
        frame,
        garmentImage,
        fitAdjustments,
        scaleX,
        scaleY,
        useNaturalGarmentShape,
        segmentationBuffers,
        garmentBounds,
        video,
        lightingCanvas
      )
    : false;

  if (!drewGarment) {
    drawGarmentGuide(context, frame, fitAdjustments, scaleX, scaleY);
  }

  frame.connections.forEach(([fromId, toId]) => {
    const from = landmarksById.get(fromId);
    const to = landmarksById.get(toId);

    if (!from || !to) {
      return;
    }

    context.beginPath();
    context.moveTo(from.x * scaleX, from.y * scaleY);
    context.lineTo(to.x * scaleX, to.y * scaleY);
    context.stroke();
  });

  frame.landmarks.forEach((landmark) => {
    drawLandmark(context, landmark, scaleX, scaleY);
  });
}

export function usePoseOverlay({
  enabled,
  fitAdjustments,
  garmentSrc,
  useNaturalGarmentShape,
  videoRef
}: UsePoseOverlayOptions): UsePoseOverlayResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<PoseDetector | null>(null);
  const garmentImageRef = useRef<HTMLImageElement | null>(null);
  const garmentBoundsRef = useRef<GarmentBounds | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lightingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const segmentationAvailableRef = useRef(false);
  const landmarkHistoryRef = useRef<LandmarkHistory | null>(null);
  const [overlayMode, setOverlayMode] = useState<DetectorMode>("mock");
  const [detectorMessage, setDetectorMessage] = useState("Loading pose detector...");
  const [garmentMessage, setGarmentMessage] = useState(
    "Upload a garment image to place a real asset on the torso region."
  );
  const [segmentationMessage, setSegmentationMessage] = useState(
    "Body segmentation not active yet."
  );

  useEffect(() => {
    let mounted = true;

    const setupDetector = async () => {
      const { detector, message } = await createPreferredPoseDetector();

      if (!mounted) {
        detector.release();
        return;
      }

      detectorRef.current?.release();
      detectorRef.current = detector;
      setOverlayMode(detector.kind);
      setDetectorMessage(message);
    };

    void setupDetector();

    return () => {
      mounted = false;
      detectorRef.current?.release();
      detectorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!garmentSrc) {
      garmentImageRef.current = null;
      garmentBoundsRef.current = null;
      setGarmentMessage("Upload a garment image to place a real asset on the torso region.");
      return;
    }

    let mounted = true;
    const image = new Image();
    image.onload = () => {
      if (!mounted) {
        return;
      }

      garmentImageRef.current = image;
      // Cached once per garment load so per-frame mesh warping maps the
      // garment's actual opaque content, not blank padding around it.
      garmentBoundsRef.current = computeOpaqueBounds(image);
      setGarmentMessage("Garment image loaded and ready for live placement.");
    };
    image.onerror = () => {
      if (!mounted) {
        return;
      }

      garmentImageRef.current = null;
      garmentBoundsRef.current = null;
      setGarmentMessage("Unable to load this garment image. Try a different file.");
    };
    image.src = garmentSrc;

    return () => {
      mounted = false;
    };
  }, [garmentSrc]);

  useEffect(() => {
    if (!enabled) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      context?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
      return;
    }

    let frameHandle = 0;

    const render = (timestamp: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const detector = detectorRef.current;

      if (!video || !canvas || !detector) {
        frameHandle = window.requestAnimationFrame(render);
        return;
      }

      const context = canvas.getContext("2d");
      if (!context || video.readyState < 2) {
        frameHandle = window.requestAnimationFrame(render);
        return;
      }

      resizeCanvas(canvas, video);
      const rawPoseFrame = detector.estimate(video, timestamp);

      if (rawPoseFrame) {
        // Mock-mode motion is already a smooth deterministic function of
        // time, so only damp jitter for real (noisy) live-camera detection.
        const smoothingFactor = detector.kind === "mock" ? 1 : DEFAULT_LANDMARK_SMOOTHING_FACTOR;
        const smoothedLandmarks = smoothLandmarks(
          rawPoseFrame.landmarks,
          landmarkHistoryRef.current,
          smoothingFactor
        );
        landmarkHistoryRef.current = toLandmarkHistory(smoothedLandmarks);
        const poseFrame: PoseFrame = { ...rawPoseFrame, landmarks: smoothedLandmarks };

        if (!bufferCanvasRef.current) {
          bufferCanvasRef.current = document.createElement("canvas");
        }
        if (!maskCanvasRef.current) {
          maskCanvasRef.current = document.createElement("canvas");
        }
        if (!lightingCanvasRef.current) {
          lightingCanvasRef.current = document.createElement("canvas");
        }

        const segmentationAvailable = Boolean(poseFrame.segmentationMask);
        if (segmentationAvailableRef.current !== segmentationAvailable) {
          segmentationAvailableRef.current = segmentationAvailable;
          setSegmentationMessage(
            segmentationAvailable
              ? "Body segmentation active: garment clipped to your real silhouette."
              : "Body segmentation unavailable this frame; using the guide-box fit."
          );
        }

        drawPoseFrame(
          context,
          poseFrame,
          video,
          fitAdjustments,
          garmentImageRef.current,
          useNaturalGarmentShape,
          {
            bufferCanvas: bufferCanvasRef.current,
            maskCanvas: maskCanvasRef.current
          },
          garmentBoundsRef.current,
          lightingCanvasRef.current
        );
      } else {
        landmarkHistoryRef.current = null;
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
      }

      frameHandle = window.requestAnimationFrame(render);
    };

    frameHandle = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameHandle);
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      context?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
    };
  }, [enabled, fitAdjustments, useNaturalGarmentShape, videoRef]);

  return {
    canvasRef,
    detectorMessage,
    garmentMessage,
    overlayMode,
    segmentationMessage
  };
}