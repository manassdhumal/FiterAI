import { useEffect, useRef } from "react";

import { type FitAdjustments } from "../lib/pose/garmentFit";
import { useCamera } from "../hooks/useCamera";
import { usePoseOverlay } from "../hooks/usePoseOverlay";

type CameraPreviewProps = {
  fitAdjustments: FitAdjustments;
  garmentName: string | null;
  garmentSrc: string | null;
};

const statusCopy = {
  error: "Camera unavailable",
  idle: "Camera offline",
  live: "Camera live",
  requesting: "Requesting access"
} as const;

export function CameraPreview({ fitAdjustments, garmentName, garmentSrc }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { error, isMirrored, startCamera, status, stopCamera, streamRef, toggleMirror } =
    useCamera();
  const { canvasRef, detectorMessage, garmentMessage, overlayMode } = usePoseOverlay({
    enabled: status === "live",
    fitAdjustments,
    garmentSrc,
    videoRef
  });

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = streamRef.current;
  }, [status, streamRef]);

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
      </div>
    </div>
  );
}