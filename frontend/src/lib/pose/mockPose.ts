import type { PoseConnection, PoseFrame, PoseLandmark, PoseLandmarkId } from "./types";

const connections: PoseConnection[] = [
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"]
];

function createLandmark(
  id: PoseLandmarkId,
  x: number,
  y: number,
  confidence = 0.72
): PoseLandmark {
  return { confidence, id, x, y };
}

export function estimateMockPoseFrame(video: HTMLVideoElement, timestamp: number): PoseFrame {
  const width = video.videoWidth || video.clientWidth || 1280;
  const height = video.videoHeight || video.clientHeight || 720;
  const sway = Math.sin(timestamp / 650) * width * 0.015;
  const shoulderY = height * 0.26;
  const hipY = height * 0.52;
  const kneeY = height * 0.76;
  const ankleY = height * 0.93;
  const centerX = width * 0.5 + sway;
  const halfShoulder = width * 0.12;
  const halfHip = width * 0.085;
  const elbowDrop = height * 0.12;
  const wristDrop = height * 0.18;

  const landmarks = [
    createLandmark("nose", centerX, height * 0.16),
    createLandmark("leftShoulder", centerX - halfShoulder, shoulderY),
    createLandmark("rightShoulder", centerX + halfShoulder, shoulderY),
    createLandmark("leftElbow", centerX - halfShoulder * 1.25, shoulderY + elbowDrop),
    createLandmark("rightElbow", centerX + halfShoulder * 1.25, shoulderY + elbowDrop),
    createLandmark("leftWrist", centerX - halfShoulder * 1.4, shoulderY + wristDrop),
    createLandmark("rightWrist", centerX + halfShoulder * 1.4, shoulderY + wristDrop),
    createLandmark("leftHip", centerX - halfHip, hipY),
    createLandmark("rightHip", centerX + halfHip, hipY),
    createLandmark("leftKnee", centerX - halfHip * 0.9, kneeY),
    createLandmark("rightKnee", centerX + halfHip * 0.9, kneeY),
    createLandmark("leftAnkle", centerX - halfHip * 0.85, ankleY),
    createLandmark("rightAnkle", centerX + halfHip * 0.85, ankleY)
  ];

  return {
    connections,
    landmarks
  };
}
