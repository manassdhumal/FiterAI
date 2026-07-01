import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";

import { estimateMockPoseFrame } from "../lib/pose/mockPose";
import type { PoseFrame, PoseLandmark } from "../lib/pose/types";

type UsePoseOverlayOptions = {
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement>;
};

type UsePoseOverlayResult = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  overlayMode: "mock";
};

function resizeCanvas(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const width = video.clientWidth;
  const height = video.clientHeight;
  const pixelRatio = window.devicePixelRatio || 1;

  if (!width || !height) {
    return;
  }

  if (canvas.width !== Math.floor(width * pixelRatio) || canvas.height !== Math.floor(height * pixelRatio)) {
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
}

function drawLandmark(context: CanvasRenderingContext2D, landmark: PoseLandmark, scaleX: number, scaleY: number) {
  context.beginPath();
  context.arc(landmark.x * scaleX, landmark.y * scaleY, 5, 0, Math.PI * 2);
  context.fill();
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

  const leftShoulder = landmarksById.get("leftShoulder");
  const rightShoulder = landmarksById.get("rightShoulder");
  const leftHip = landmarksById.get("leftHip");
  const rightHip = landmarksById.get("rightHip");

  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const x = leftShoulder.x * scaleX;
    const y = leftShoulder.y * scaleY;
    const width = (rightShoulder.x - leftShoulder.x) * scaleX;
    const height = (leftHip.y - leftShoulder.y) * scaleY;

    context.strokeStyle = "rgba(255, 214, 153, 0.95)";
    context.lineWidth = 3;
    context.setLineDash([14, 10]);
    context.strokeRect(x - 14, y - 18, width + 28, height + 34);
    context.setLineDash([]);
  }
}

export function usePoseOverlay({ enabled, videoRef }: UsePoseOverlayOptions): UsePoseOverlayResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayMode = useMemo(() => "mock" as const, []);

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

      if (!video || !canvas) {
        frameHandle = window.requestAnimationFrame(render);
        return;
      }

      const context = canvas.getContext("2d");
      if (!context || video.readyState < 2) {
        frameHandle = window.requestAnimationFrame(render);
        return;
      }

      resizeCanvas(canvas, video);
      const poseFrame = estimateMockPoseFrame(video, timestamp);
      drawPoseFrame(context, poseFrame, video);
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
    overlayMode
  };
}
