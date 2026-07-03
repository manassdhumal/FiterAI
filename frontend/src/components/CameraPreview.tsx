import { useEffect, useMemo, useRef } from "react";

import { type FitAdjustments } from "../lib/pose/garmentFit";
import { useCamera } from "../hooks/useCamera";
import { usePoseOverlay } from "../hooks/usePoseOverlay";
import { MirrorIcon, VideoIcon, VideoOffIcon } from "./icons";

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
  idle: "Camera off",
  live: "Camera live",
  requesting: "Requesting access"
} as const;

const statusPillVariant = {
  error: "danger",
  idle: "idle",
  live: "success",
  requesting: "warning"
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
  const { canvasRef, detectorMessage, garmentMessage, overlayMode, segmentationMessage } = usePoseOverlay({
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

        <div className="camera-stage__badges">
          <span className={`pill pill--${statusPillVariant[status]}${status === "live" || status === "requesting" ? " pill--pulse" : ""}`}>
            <span className="pill__dot" />
            {statusCopy[status]}
          </span>
          {status === "live" ? (
            <span className="pill pill--accent">
              <span className="pill__dot" />
              {overlayMode} overlay
            </span>
          ) : null}
        </div>

        <span className="camera-stage__mirror-label">{isMirrored ? "mirrored" : "true view"}</span>
        <span className="camera-stage__bracket camera-stage__bracket--tl" aria-hidden="true" />
        <span className="camera-stage__bracket camera-stage__bracket--br" aria-hidden="true" />

        {status !== "live" ? (
          <div className="camera-overlay">
            <div>
              <span className="camera-overlay__icon">
                <VideoOffIcon />
              </span>
              <strong>Camera is off</strong>
              <p>
                {status === "requesting"
                  ? "Waiting for webcam permission..."
                  : "Start the camera to test the live try-on surface."}
              </p>
              {error ? <span className="error-text">{error}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="camera-card__actions">
        {status === "live" ? (
          <button type="button" className="button--danger" onClick={stopCamera}>
            <VideoOffIcon size={17} />
            Stop camera
          </button>
        ) : (
          <button type="button" onClick={() => void startCamera()}>
            <VideoIcon size={17} />
            Start camera
          </button>
        )}

        <div className="camera-card__actions-row">
          <button type="button" onClick={toggleMirror} className="icon-button">
            <MirrorIcon />
            Mirror {isMirrored ? "on" : "off"}
          </button>
        </div>

        <button type="button" className="button--capture" onClick={captureLook} disabled={status !== "live"}>
          <span
            style={{
              border: "2.5px solid currentColor",
              borderRadius: "999px",
              display: "inline-block",
              height: "15px",
              width: "15px"
            }}
          />
          Capture look
        </button>
      </div>

      <div className="camera-card__footer">
        <p>{detectorMessage}</p>
        <p>{garmentName ? `Loaded garment: ${garmentName}` : garmentMessage}</p>
        {useNaturalGarmentShape && status === "live" ? <p>{segmentationMessage}</p> : null}
        <p>{status === "live" ? `Capture export name: ${captureFileName}` : "Camera must be live to capture."}</p>
      </div>
    </div>
  );
}
