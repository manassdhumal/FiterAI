import type { PoseFrame, PoseLandmark } from "./types";

export type Point = {
  x: number;
  y: number;
};

export type FitAdjustments = {
  offsetX: number;
  offsetY: number;
  rotation: number;
  scale: number;
  sleeveSpread: number;
  torsoLength: number;
};

export const defaultFitAdjustments: FitAdjustments = {
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scale: 1,
  sleeveSpread: 0,
  torsoLength: 0
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

export type GarmentPlacement = {
  center: Point;
  necklineControl: Point;
  points: Point[];
};

function byId(frame: PoseFrame, id: PoseLandmark["id"]) {
  return frame.landmarks.find((landmark) => landmark.id === id) ?? null;
}

function rotatePoint(point: Point, center: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
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

export function buildGarmentGuidePoints(region: TorsoFitRegion): Point[] {
  return [
    region.neckLeft,
    region.leftShoulder,
    region.sleeveLeft,
    {
      x: region.centerX - region.waistInset - region.width * 0.24,
      y: region.hipLeft.y - region.height * 0.18
    },
    region.hipLeft,
    region.hipRight,
    {
      x: region.centerX + region.waistInset + region.width * 0.24,
      y: region.hipRight.y - region.height * 0.18
    },
    region.sleeveRight,
    region.rightShoulder,
    region.neckRight
  ];
}

export function createGarmentPlacement(
  frame: PoseFrame,
  adjustments: FitAdjustments
): GarmentPlacement | null {
  const fitRegion = calculateTorsoFitRegion(frame);

  if (!fitRegion) {
    return null;
  }

  const points = buildGarmentGuidePoints(fitRegion);
  const center = {
    x: fitRegion.centerX,
    y: (fitRegion.neckLeft.y + fitRegion.hipLeft.y) / 2
  };
  const rotationRadians = (adjustments.rotation * Math.PI) / 180;
  const offset = {
    x: adjustments.offsetX * fitRegion.width * 0.45,
    y: adjustments.offsetY * fitRegion.height * 0.45
  };

  const adjustedPoints = points.map((point, index) => {
    const isSleeve = index === 2 || index === 7;
    const isWaist = index === 3 || index === 6;
    const isHip = index === 4 || index === 5;

    let workingPoint = { ...point };

    if (isSleeve) {
      const direction = index === 2 ? -1 : 1;
      workingPoint.x += direction * adjustments.sleeveSpread * fitRegion.width * 0.26;
      workingPoint.y += adjustments.sleeveSpread * fitRegion.height * 0.05;
    }

    if (isWaist) {
      workingPoint.y += adjustments.torsoLength * fitRegion.height * 0.14;
    }

    if (isHip) {
      workingPoint.y += adjustments.torsoLength * fitRegion.height * 0.26;
    }

    const scaled = {
      x: center.x + (workingPoint.x - center.x) * adjustments.scale + offset.x,
      y: center.y + (workingPoint.y - center.y) * adjustments.scale + offset.y
    };

    return rotatePoint(scaled, { x: center.x + offset.x, y: center.y + offset.y }, rotationRadians);
  });

  const necklineControl = rotatePoint(
    {
      x: center.x + offset.x,
      y: fitRegion.neckLeft.y - fitRegion.height * 0.08 + offset.y
    },
    { x: center.x + offset.x, y: center.y + offset.y },
    rotationRadians
  );

  return {
    center: { x: center.x + offset.x, y: center.y + offset.y },
    necklineControl,
    points: adjustedPoints
  };
}