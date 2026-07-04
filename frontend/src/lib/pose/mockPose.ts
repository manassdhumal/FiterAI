import { poseConnections } from "./connections";
import type { PoseFrame, PoseLandmark, PoseLandmark3d, PoseLandmarkId } from "./types";

function createLandmark(
  id: PoseLandmarkId,
  x: number,
  y: number,
  confidence = 0.72
): PoseLandmark {
  return { confidence, id, x, y };
}

function createLandmark3d(
  id: PoseLandmarkId,
  x: number,
  y: number,
  z: number,
  confidence = 0.72
): PoseLandmark3d {
  return { confidence, id, x, y, z };
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
    connections: poseConnections,
    landmarks,
    worldLandmarks: estimateMockWorldLandmarks(timestamp)
  };
}

// Synthesizes plausible hip-centered, real-scale (meters) world landmarks so
// the 3D path is testable without a camera. Rigidly yaws the whole mock body
// left/right over time (a real person's shoulders/hips would rotate
// together) so poseTo3d's yaw math has something non-trivial to compute
// against, even in the mock/demo path.
function estimateMockWorldLandmarks(timestamp: number): PoseLandmark3d[] {
  const yaw = Math.sin(timestamp / 1800) * 0.4;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  const halfShoulder = 0.19;
  const halfHip = 0.15;
  const halfElbow = halfShoulder * 1.2;
  const halfWrist = halfShoulder * 1.3;
  const halfKnee = halfHip * 0.9;
  const halfAnkle = halfHip * 0.85;

  const shoulderY = 0.5;
  const elbowY = shoulderY - 0.25;
  const wristY = shoulderY - 0.5;
  const kneeY = -0.45;
  const ankleY = -0.9;
  const noseY = 0.65;

  return [
    createLandmark3d("nose", 0, noseY, sin * 0.05),
    createLandmark3d("leftShoulder", -halfShoulder * cos, shoulderY, -halfShoulder * sin),
    createLandmark3d("rightShoulder", halfShoulder * cos, shoulderY, halfShoulder * sin),
    createLandmark3d("leftElbow", -halfElbow * cos, elbowY, -halfElbow * sin),
    createLandmark3d("rightElbow", halfElbow * cos, elbowY, halfElbow * sin),
    createLandmark3d("leftWrist", -halfWrist * cos, wristY, -halfWrist * sin),
    createLandmark3d("rightWrist", halfWrist * cos, wristY, halfWrist * sin),
    createLandmark3d("leftHip", -halfHip * cos, 0, -halfHip * sin),
    createLandmark3d("rightHip", halfHip * cos, 0, halfHip * sin),
    createLandmark3d("leftKnee", -halfKnee * cos, kneeY, -halfKnee * sin),
    createLandmark3d("rightKnee", halfKnee * cos, kneeY, halfKnee * sin),
    createLandmark3d("leftAnkle", -halfAnkle * cos, ankleY, -halfAnkle * sin),
    createLandmark3d("rightAnkle", halfAnkle * cos, ankleY, halfAnkle * sin)
  ];
}
