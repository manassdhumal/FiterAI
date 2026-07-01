import { useEffect, useRef } from "react";

import { useCamera } from "../hooks/useCamera";

const statusCopy = {
  error: "Camera unavailable",
  idle: "Camera offline",
  live: "Camera live",
  requesting: "Requesting access"
} as const;

export function CameraPreview() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { error, isMirrored, startCamera, status, stopCamera, streamRef, toggleMirror } =
    useCamera();

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = streamRef.current;
  }, [status, streamRef]);

  return (
    <div className="camera-card">
      <div className="camera-card__toolbar">
        <span className={`camera-badge camera-badge--${status}`}>{statusCopy[status]}</span>
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

      <div className="camera-card__footer">
        <p>Next step: draw pose landmarks and garment anchors on top of this feed.</p>
      </div>
    </div>
  );
}
