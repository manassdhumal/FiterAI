import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";

import { calculateTorsoFitRegion } from "../lib/pose/garmentFit";
import { createPreferredPoseDetector } from "../lib/pose/poseDetector";
import type { DetectorMode, PoseDetector } from "../lib/pose/poseDetector";
import type { PoseFrame, PoseLandmark } from "../lib/pose/types";

type UsePoseOverlayOptions = {
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement>;
};

type UsePoseOverlayResult = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  detectorMessage: string;
  overlayMode: DetectorMode;
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

function drawGarmentGuide(
  context: CanvasRenderingContext2D,
  frame: PoseFrame,
  scaleX: number,
  scaleY: number
) {
  const fitRegion = calculateTorsoFitRegion(frame);

  if (!fitRegion) {
    return;
  }

  const points = [
    fitRegion.neckLeft,
    fitRegion.leftShoulder,
    fitRegion.sleeveLeft,
    {
      x: fitRegion.centerX - fitRegion.waistInset - fitRegion.width * 0.24,
      y: fitRegion.hipLeft.y - fitRegion.height * 0.18
    },
    fitRegion.hipLeft,
    fitRegion.hipRight,
    {
      x: fitRegion.centerX + fitRegion.waistInset + fitRegion.width * 0.24,
      y: fitRegion.hipRight.y - fitRegion.height * 0.18
    },
    fitRegion.sleeveRight,
    fitRegion.rightShoulder,
    fitRegion.neckRight
  ];

  context.save();
  context.beginPath();
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
  context.fillStyle = "rgba(255, 173, 96, 0.26)";
  context.strokeStyle = "rgba(255, 214, 153, 0.98)";
  context.lineWidth = 3;
  context.fill();
  context.stroke();

  const neckWidth = (fitRegion.neckRight.x - fitRegion.neckLeft.x) * scaleX;
  const neckCenterX = ((fitRegion.neckLeft.x + fitRegion.neckRight.x) / 2) * scaleX;
  const neckY = fitRegion.neckLeft.y * scaleY;

  context.beginPath();
  context.strokeStyle = "rgba(255, 245, 233, 0.95)";
  context.lineWidth = 2;
  context.arc(neckCenterX, neckY, neckWidth * 0.28, Math.PI * 0.1, Math.PI * 0.9, false);
  context.stroke();

  context.fillStyle = "rgba(255, 250, 244, 0.92)";
  context.font = `${Math.max(14, Math.round(18 * scaleX))}px Georgia`;
  context.fillText(
    "Garment fit region",
    (fitRegion.centerX - fitRegion.width * 0.28) * scaleX,
    (fitRegion.hipLeft.y + fitRegion.height * 0.12) * scaleY
  );
  context.restore();
}

function drawPoseFrame(context: CanvasRenderingContext2D, frame: PoseFrame, video: HTMLVideoElement) {
  const sourceWidth = video.videoWidth || video.clientWidth || 1;
  const sourceHeight = video.videoHeight || video.clientHeight || 1;
  const scaleX = context.canvas.width / sourceWidth;
  const scaleY = context.canvas.height / sourceHeight;
  const landmarksById = new Map(frame.landmarks.map((landmark) => [landmark.id, landmark]));

  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.lineWidth = 4;
  context.strokeStyle = "rgba(255, 244, 232, 0.88)";
  context.fillStyle = "rgba(210, 95, 43, 0.95)";

  drawGarmentGuide(context, frame, scaleX, scaleY);

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

export function usePoseOverlay({ enabled, videoRef }: UsePoseOverlayOptions): UsePoseOverlayResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<PoseDetector | null>(null);
  const [overlayMode, setOverlayMode] = useState<DetectorMode>("mock");
  const [detectorMessage, setDetectorMessage] = useState("Loading pose detector...");

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
        drawPoseFrame(context, poseFrame, video);
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
  }, [enabled, videoRef]);

  return {
    canvasRef,
    detectorMessage,
    overlayMode
  };
}
