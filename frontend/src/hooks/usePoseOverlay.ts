import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";

import {
  createGarmentPlacement,
  type FitAdjustments
} from "../lib/pose/garmentFit";
import { createPreferredPoseDetector } from "../lib/pose/poseDetector";
import type { DetectorMode, PoseDetector } from "../lib/pose/poseDetector";
import type { PoseFrame, PoseLandmark, SegmentationMask } from "../lib/pose/types";

type SegmentationBuffers = {
  bufferCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
};

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

function paintNaturalFitGarment(
  context: CanvasRenderingContext2D,
  garmentImage: HTMLImageElement,
  centerX: number,
  centerY: number,
  rotationRadians: number,
  drawWidth: number,
  drawHeight: number,
  alpha: number
) {
  // The processed garment already has a transparent background, so its own
  // alpha silhouette defines the visible shape. Contain-fit it into the
  // guide box instead of stretching, to avoid distorting the garment.
  const imageAspect = garmentImage.naturalWidth / garmentImage.naturalHeight || 1;
  const boxAspect = drawWidth / drawHeight;
  const renderWidth = imageAspect > boxAspect ? drawWidth : drawHeight * imageAspect;
  const renderHeight = imageAspect > boxAspect ? drawWidth / imageAspect : drawHeight;

  context.save();
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(centerX, centerY);
  context.rotate(rotationRadians);
  context.drawImage(garmentImage, -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight);
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
  segmentationBuffers: SegmentationBuffers | null
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
      // landmark-derived guide box.
      bufferContext.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
      paintNaturalFitGarment(bufferContext, garmentImage, centerX, centerY, rotationRadians, drawWidth, drawHeight, 1);
      paintSegmentationMask(maskCanvas, segmentationMask);

      bufferContext.globalCompositeOperation = "destination-in";
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
      bufferContext.globalCompositeOperation = "source-over";

      context.save();
      context.globalAlpha = 0.92;
      context.drawImage(bufferCanvas, 0, 0);
      context.restore();

      return true;
    }
  }

  paintNaturalFitGarment(context, garmentImage, centerX, centerY, rotationRadians, drawWidth, drawHeight, 0.92);
  return true;
}

function drawPoseFrame(
  context: CanvasRenderingContext2D,
  frame: PoseFrame,
  video: HTMLVideoElement,
  fitAdjustments: FitAdjustments,
  garmentImage: HTMLImageElement | null,
  useNaturalGarmentShape: boolean,
  segmentationBuffers: SegmentationBuffers | null
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
        segmentationBuffers
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
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const segmentationAvailableRef = useRef(false);
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
      setGarmentMessage("Garment image loaded and ready for live placement.");
    };
    image.onerror = () => {
      if (!mounted) {
        return;
      }

      garmentImageRef.current = null;
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
      const poseFrame = detector.estimate(video, timestamp);

      if (poseFrame) {
        if (!bufferCanvasRef.current) {
          bufferCanvasRef.current = document.createElement("canvas");
        }
        if (!maskCanvasRef.current) {
          maskCanvasRef.current = document.createElement("canvas");
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
          }
        );
      } else {
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