export type PoseLandmarkId =
  | "nose"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle";

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
