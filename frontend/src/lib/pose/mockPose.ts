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

  const noseY = height * 0.16;
  const eyeY = noseY - height * 0.012;
  const mouthY = noseY + height * 0.018;
  const halfEyeInner = width * 0.012;
  const halfEyeOuter = width * 0.022;
  const halfEar = width * 0.032;
  const halfMouth = width * 0.01;
  const wristX = { left: centerX - halfShoulder * 1.4, right: centerX + halfShoulder * 1.4 };
  const wristY = shoulderY + wristDrop;
  const heelDrop = height * 0.02;
  const footForwardX = width * 0.02;

  const landmarks = [
    createLandmark("nose", centerX, noseY),
    createLandmark("leftEyeInner", centerX - halfEyeInner, eyeY),
    createLandmark("leftEye", centerX - halfEyeInner * 1.6, eyeY),
    createLandmark("leftEyeOuter", centerX - halfEyeOuter, eyeY),
    createLandmark("rightEyeInner", centerX + halfEyeInner, eyeY),
    createLandmark("rightEye", centerX + halfEyeInner * 1.6, eyeY),
    createLandmark("rightEyeOuter", centerX + halfEyeOuter, eyeY),
    createLandmark("leftEar", centerX - halfEar, noseY),
    createLandmark("rightEar", centerX + halfEar, noseY),
    createLandmark("mouthLeft", centerX - halfMouth, mouthY),
    createLandmark("mouthRight", centerX + halfMouth, mouthY),
    createLandmark("leftShoulder", centerX - halfShoulder, shoulderY),
    createLandmark("rightShoulder", centerX + halfShoulder, shoulderY),
    createLandmark("leftElbow", centerX - halfShoulder * 1.25, shoulderY + elbowDrop),
    createLandmark("rightElbow", centerX + halfShoulder * 1.25, shoulderY + elbowDrop),
    createLandmark("leftWrist", wristX.left, wristY),
    createLandmark("rightWrist", wristX.right, wristY),
    createLandmark("leftPinky", wristX.left - width * 0.014, wristY + height * 0.02),
    createLandmark("rightPinky", wristX.right + width * 0.014, wristY + height * 0.02),
    createLandmark("leftIndex", wristX.left - width * 0.006, wristY + height * 0.026),
    createLandmark("rightIndex", wristX.right + width * 0.006, wristY + height * 0.026),
    createLandmark("leftThumb", wristX.left + width * 0.01, wristY + height * 0.012),
    createLandmark("rightThumb", wristX.right - width * 0.01, wristY + height * 0.012),
    createLandmark("leftHip", centerX - halfHip, hipY),
    createLandmark("rightHip", centerX + halfHip, hipY),
    createLandmark("leftKnee", centerX - halfHip * 0.9, kneeY),
    createLandmark("rightKnee", centerX + halfHip * 0.9, kneeY),
    createLandmark("leftAnkle", centerX - halfHip * 0.85, ankleY),
    createLandmark("rightAnkle", centerX + halfHip * 0.85, ankleY),
    createLandmark("leftHeel", centerX - halfHip * 0.85, ankleY + heelDrop),
    createLandmark("rightHeel", centerX + halfHip * 0.85, ankleY + heelDrop),
    createLandmark("leftFootIndex", centerX - halfHip * 0.85 - footForwardX, ankleY + heelDrop),
    createLandmark("rightFootIndex", centerX + halfHip * 0.85 + footForwardX, ankleY + heelDrop)
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
