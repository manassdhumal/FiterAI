import { useEffect, useMemo, useRef } from "react";

import { type FitAdjustments } from "../lib/pose/garmentFit";
import { useCamera } from "../hooks/useCamera";
import { usePoseOverlay } from "../hooks/usePoseOverlay";

type SnapshotPayload = {
  createdAt: string;
  src: string;
};

type CameraPreviewProps = {
  fitAdjustments: FitAdjustments;
  garmentName: string | null;
  garmentSrc: string | null;
  onCapture: (snapshot: SnapshotPayload) => void;
  useNaturalGarmentShape: boolean;
};

const statusCopy = {
  error: "Camera unavailable",
  idle: "Camera offline",
  live: "Camera live",
  requesting: "Requesting access"
} as const;

export function CameraPreview({
  fitAdjustments,
  garmentName,
  garmentSrc,
  onCapture,
  useNaturalGarmentShape
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { error, isMirrored, startCamera, status, stopCamera, streamRef, toggleMirror } =
    useCamera();
  const { canvasRef, detectorMessage, garmentMessage, overlayMode } = usePoseOverlay({
    enabled: status === "live",
    fitAdjustments,
    garmentSrc,
    useNaturalGarmentShape,
    videoRef
  });

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = streamRef.current;
  }, [status, streamRef]);

  const captureLook = () => {
    const video = videoRef.current;
    const overlayCanvas = canvasRef.current;

    if (!video || !overlayCanvas) {
      return;
    }

    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;

    if (!width || !height) {
      return;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const context = exportCanvas.getContext("2d");

    if (!context) {
      return;
    }

    if (isMirrored) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }

    context.drawImage(video, 0, 0, width, height);
    context.drawImage(overlayCanvas, 0, 0, width, height);

    exportCanvas.toBlob((blob) => {
      if (!blob) {
        return;
      }

      onCapture({
        createdAt: new Date().toLocaleString(),
        src: URL.createObjectURL(blob)
      });
    }, "image/png");
  };

  const captureFileName = useMemo(() => {
    const base = garmentName ? garmentName.replace(/\.[^.]+$/, "") : "fitcheck-look";
    return `${base}-capture.png`;
  }, [garmentName]);

  return (
    <div className="camera-card">
      <div className="camera-card__toolbar">
        <div className="camera-card__status-group">
          <span className={`camera-badge camera-badge--${status}`}>{statusCopy[status]}</span>
          <span className="camera-badge camera-badge--overlay">{overlayMode} overlay</span>
        </div>
        <div className="camera-card__actions">
          <button type="button" onClick={toggleMirror} className="button--ghost">
            {isMirrored ? "Mirror on" : "Mirror off"}
          </button>
          <button type="button" onClick={captureLook} disabled={status !== "live"}>
            Capture Look
          </button>
          {status === "live" ? (
            <button type="button" onClick={stopCamera}>
              Stop Camera
            </button>
          ) : (
            <button type="button" onClick={() => void startCamera()}>
              Start Camera
            </button>
          )}
        </div>
      </div>

      <div className="camera-stage">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={isMirrored ? "camera-feed camera-feed--mirrored" : "camera-feed"}
        />
        <canvas
          ref={canvasRef}
          className={isMirrored ? "camera-canvas camera-canvas--mirrored" : "camera-canvas"}
        />
        {status !== "live" ? (
          <div className="camera-overlay">
            <div>
              <strong>Live mirror preview</strong>
              <p>
                {status === "requesting"
                  ? "Waiting for webcam permission..."
                  : "Start the camera to test the live try-on surface."}
              </p>
              {error ? <span>{error}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="camera-card__footer camera-card__footer--stacked">
        <p>{detectorMessage}</p>
        <p>{garmentName ? `Loaded garment: ${garmentName}` : garmentMessage}</p>
        <p>{status === "live" ? `Capture export name: ${captureFileName}` : "Camera must be live to capture."}</p>
      </div>
    </div>
  );
}