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

export type PoseConnection = [PoseLandmarkId, PoseLandmarkId];

export type PoseFrame = {
  connections: PoseConnection[];
  landmarks: PoseLandmark[];
};
