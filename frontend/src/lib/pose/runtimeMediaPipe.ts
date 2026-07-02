import { poseConnections } from "./connections";
import type { DetectorMode, PoseDetector } from "./poseDetector";
import type { PoseFrame, PoseLandmark, PoseLandmarkId, SegmentationMask } from "./types";

type MediaPipeTasksVisionModule = {
  FilesetResolver: {
    forVisionTasks: (basePath: string) => Promise<unknown>;
  };
  PoseLandmarker: {
    createFromOptions: (
      vision: unknown,
      options: {
        baseOptions: {
          delegate: "GPU" | "CPU";
          modelAssetPath: string;
        };
        numPoses: number;
        outputSegmentationMasks: boolean;
        runningMode: "VIDEO";
      }
    ) => Promise<MediaPipePoseLandmarker>;
  };
};

type MediaPipeNormalizedLandmark = {
  x: number;
  y: number;
  visibility?: number;
};

type MediaPipeMask = {
  close?: () => void;
  getAsFloat32Array: () => Float32Array;
  height: number;
  width: number;
};

type MediaPipePoseResult = {
  landmarks?: MediaPipeNormalizedLandmark[][];
  segmentationMasks?: MediaPipeMask[];
};

type MediaPipePoseLandmarker = {
  close?: () => void;
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => MediaPipePoseResult;
};

const TASKS_VISION_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const TASKS_VISION_WASM_ROOT = `${TASKS_VISION_URL}/wasm`;
const TASKS_VISION_BUNDLE = `${TASKS_VISION_URL}/vision_bundle.mjs`;
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

const landmarkMap: PoseLandmarkId[] = [
  "nose",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle"
];

const mediapipeIndices: Record<PoseLandmarkId, number> = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28
};

function toPoseLandmarks(source: MediaPipeNormalizedLandmark[]): PoseLandmark[] {
  return landmarkMap.map((id) => {
    const candidate = source[mediapipeIndices[id]];

    return {
      confidence: candidate?.visibility ?? 0.8,
      id,
      x: candidate?.x ?? 0,
      y: candidate?.y ?? 0
    };
  });
}

async function loadTasksVisionModule(): Promise<MediaPipeTasksVisionModule> {
  const loaded = await import(/* @vite-ignore */ TASKS_VISION_BUNDLE);
  return loaded as MediaPipeTasksVisionModule;
}

function extractSegmentationMask(result: MediaPipePoseResult): SegmentationMask | null {
  const mask = result.segmentationMasks?.[0];

  if (!mask) {
    return null;
  }

  try {
    const data = new Float32Array(mask.getAsFloat32Array());
    const { height, width } = mask;
    mask.close?.();

    if (!width || !height || !data.length) {
      return null;
    }

    return { data, height, width };
  } catch {
    return null;
  }
}

export async function createMediaPipeDetector(): Promise<PoseDetector> {
  if (typeof window === "undefined") {
    throw new Error("Pose detection only runs in the browser");
  }

  const visionModule = await loadTasksVisionModule();
  const vision = await visionModule.FilesetResolver.forVisionTasks(TASKS_VISION_WASM_ROOT);
  const landmarker = await visionModule.PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      delegate: "GPU",
      modelAssetPath: POSE_MODEL_URL
    },
    numPoses: 1,
    outputSegmentationMasks: true,
    runningMode: "VIDEO"
  });

  return {
    estimate: (video, timestamp) => {
      const result = landmarker.detectForVideo(video, timestamp);
      const sourceLandmarks = result.landmarks?.[0];

      if (!sourceLandmarks?.length) {
        return null;
      }

      const width = video.videoWidth || video.clientWidth || 1;
      const height = video.videoHeight || video.clientHeight || 1;
      const normalized = toPoseLandmarks(sourceLandmarks).map((landmark) => ({
        ...landmark,
        x: landmark.x * width,
        y: landmark.y * height
      }));

      return {
        connections: poseConnections,
        landmarks: normalized,
        segmentationMask: extractSegmentationMask(result)
      } satisfies PoseFrame;
    },
    kind: "mediapipe" satisfies DetectorMode,
    release: () => {
      landmarker.close?.();
    }
  };
}
