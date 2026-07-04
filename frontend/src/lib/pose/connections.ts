import type { PoseConnection } from "./types";

export const poseConnections: PoseConnection[] = [
  // Face: brow-to-brow across the eyes/nose, plus ears and mouth corners.
  ["leftEyeOuter", "leftEye"],
  ["leftEye", "leftEyeInner"],
  ["leftEyeInner", "nose"],
  ["nose", "rightEyeInner"],
  ["rightEyeInner", "rightEye"],
  ["rightEye", "rightEyeOuter"],
  ["leftEar", "leftEyeOuter"],
  ["rightEar", "rightEyeOuter"],
  ["mouthLeft", "mouthRight"],
  // Torso and arms.
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  // Hands: wrist fans out to thumb/index/pinky, with index-pinky closing
  // the loop into a simple hand outline.
  ["leftWrist", "leftThumb"],
  ["leftWrist", "leftIndex"],
  ["leftWrist", "leftPinky"],
  ["leftIndex", "leftPinky"],
  ["rightWrist", "rightThumb"],
  ["rightWrist", "rightIndex"],
  ["rightWrist", "rightPinky"],
  ["rightIndex", "rightPinky"],
  // Legs and feet.
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["leftAnkle", "leftHeel"],
  ["leftHeel", "leftFootIndex"],
  ["leftAnkle", "leftFootIndex"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"],
  ["rightAnkle", "rightHeel"],
  ["rightHeel", "rightFootIndex"],
  ["rightAnkle", "rightFootIndex"]
];
