// The full 33-point MediaPipe BlazePose topology (previously only 13 of
// these were used) - face/hand/foot detail included so the on-screen
// skeleton reads as a denser, more connected body tracker rather than a
// sparse stick figure. Garment fitting (garmentFit.ts) only ever reads the
// shoulders/hips/elbows subset, so this is purely additive for the rest.
export type PoseLandmarkId =
  | "nose"
  | "leftEyeInner"
  | "leftEye"
  | "leftEyeOuter"
  | "rightEyeInner"
  | "rightEye"
  | "rightEyeOuter"
  | "leftEar"
  | "rightEar"
  | "mouthLeft"
  | "mouthRight"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftPinky"
  | "rightPinky"
  | "leftIndex"
  | "rightIndex"
  | "leftThumb"
  | "rightThumb"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle"
  | "leftHeel"
  | "rightHeel"
  | "leftFootIndex"
  | "rightFootIndex";

export type PoseLandmark = {
  confidence: number;
  id: PoseLandmarkId;
  x: number;
  y: number;
};

// Real-world 3D coordinates in meters, hip-centered, as provided by
// MediaPipe's `worldLandmarks` (distinct from the normalized image-space
// `landmarks` above, which have no true depth/scale information).
export type PoseLandmark3d = {
  confidence: number;
  id: PoseLandmarkId;
  x: number;
  y: number;
  z: number;
};

export type PoseConnection = [PoseLandmarkId, PoseLandmarkId];

export type SegmentationMask = {
  data: Float32Array;
  height: number;
  width: number;
};

export type PoseFrame = {
  connections: PoseConnection[];
  landmarks: PoseLandmark[];
  segmentationMask?: SegmentationMask | null;
  worldLandmarks?: PoseLandmark3d[];
};
