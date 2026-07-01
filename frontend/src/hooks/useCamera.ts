import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

type CameraStatus = "idle" | "requesting" | "live" | "error";

type UseCameraResult = {
  error: string | null;
  isMirrored: boolean;
  startCamera: () => Promise<void>;
  status: CameraStatus;
  stopCamera: () => void;
  streamRef: MutableRefObject<MediaStream | null>;
  toggleMirror: () => void;
};

export function useCamera(): UseCameraResult {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMirrored, setIsMirrored] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus("idle");
  }, []);

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support webcam access.");
      setStatus("error");
      return;
    }

    try {
      setError(null);
      setStatus("requesting");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      setStatus("live");
    } catch (cameraError) {
      setError(
        cameraError instanceof Error
          ? cameraError.message
          : "Unable to access the webcam."
      );
      setStatus("error");
    }
  }, []);

  const toggleMirror = useCallback(() => {
    setIsMirrored((current) => !current);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  return {
    error,
    isMirrored,
    startCamera,
    status,
    stopCamera,
    streamRef,
    toggleMirror
  };
}
