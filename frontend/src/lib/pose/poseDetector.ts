import { estimateMockPoseFrame } from "./mockPose";
import { createMediaPipeDetector } from "./runtimeMediaPipe";
import type { PoseFrame } from "./types";

export type DetectorMode = "mock" | "mediapipe";

export type PoseDetector = {
  estimate: (video: HTMLVideoElement, timestamp: number) => PoseFrame | null;
  kind: DetectorMode;
  release: () => void;
};

export type PoseDetectorState = {
  detector: PoseDetector;
  message: string;
};

function createMockDetector(): PoseDetector {
  return {
    estimate: (video, timestamp) => estimateMockPoseFrame(video, timestamp),
    kind: "mock",
    release: () => undefined
  };
}

export async function createPreferredPoseDetector(): Promise<PoseDetectorState> {
  try {
    const detector = await createMediaPipeDetector();
    return {
      detector,
      message: "MediaPipe pose active"
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Real pose detector unavailable";

    return {
      detector: createMockDetector(),
      message: `${reason}. Falling back to mock pose.`
    };
  }
}
