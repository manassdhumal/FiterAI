import type { PoseFrame, PoseLandmark } from "./types";

type Point = {
  x: number;
  y: number;
};

export type TorsoFitRegion = {
  centerX: number;
  height: number;
  hipLeft: Point;
  hipRight: Point;
  leftShoulder: Point;
  neckLeft: Point;
  neckRight: Point;
  rightShoulder: Point;
  sleeveLeft: Point;
  sleeveRight: Point;
  waistInset: number;
  width: number;
};

function byId(frame: PoseFrame, id: PoseLandmark["id"]) {
  return frame.landmarks.find((landmark) => landmark.id === id) ?? null;
}

export function calculateTorsoFitRegion(frame: PoseFrame): TorsoFitRegion | null {
  const leftShoulder = byId(frame, "leftShoulder");
  const rightShoulder = byId(frame, "rightShoulder");
  const leftHip = byId(frame, "leftHip");
  const rightHip = byId(frame, "rightHip");

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return null;
  }

  const shoulderWidth = rightShoulder.x - leftShoulder.x;
  const torsoHeight = Math.max(leftHip.y, rightHip.y) - Math.min(leftShoulder.y, rightShoulder.y);

  if (shoulderWidth <= 0 || torsoHeight <= 0) {
    return null;
  }

  const centerX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderY = Math.min(leftShoulder.y, rightShoulder.y);
  const hipY = Math.max(leftHip.y, rightHip.y);
  const sleeveDrop = torsoHeight * 0.25;
  const sleeveReach = shoulderWidth * 0.28;
  const shoulderLift = torsoHeight * 0.06;
  const neckInset = shoulderWidth * 0.18;
  const hipInset = shoulderWidth * 0.08;

  return {
    centerX,
    height: torsoHeight,
    hipLeft: { x: leftHip.x + hipInset, y: hipY },
    hipRight: { x: rightHip.x - hipInset, y: hipY },
    leftShoulder: { x: leftShoulder.x - shoulderWidth * 0.08, y: leftShoulder.y + shoulderLift },
    neckLeft: { x: centerX - neckInset, y: shoulderY - shoulderLift },
    neckRight: { x: centerX + neckInset, y: shoulderY - shoulderLift },
    rightShoulder: { x: rightShoulder.x + shoulderWidth * 0.08, y: rightShoulder.y + shoulderLift },
    sleeveLeft: { x: leftShoulder.x - sleeveReach, y: leftShoulder.y + sleeveDrop },
    sleeveRight: { x: rightShoulder.x + sleeveReach, y: rightShoulder.y + sleeveDrop },
    waistInset: shoulderWidth * 0.12,
    width: shoulderWidth
  };
}
