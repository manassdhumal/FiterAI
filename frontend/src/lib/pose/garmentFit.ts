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

// buildGarmentGuidePoints() returns 10 points walking the outline
// (neckLeft, leftShoulder, sleeveLeft, waistLeft, hipLeft, hipRight,
// waistRight, sleeveRight, rightShoulder, neckRight). These pair up into
// 5 left/right rows (neck, shoulder, sleeve, waist, hip) that double as a
// mesh for piecewise-affine garment warping, instead of one rigid transform
// for the whole garment image.
export const garmentMeshRowIndexPairs: [number, number][] = [
  [0, 9],
  [1, 8],
  [2, 7],
  [3, 6],
  [4, 5]
];

// Approximate vertical position (0 = top/neck, 1 = bottom/hem) of each mesh
// row within a garment image, derived from calculateTorsoFitRegion's own
// proportions (shoulderLift/sleeveDrop/waist-inset/hip offsets).
export const garmentMeshRowSourceFractions = [0, 0.11, 0.29, 0.83, 1];

const ELBOW_CONFIDENCE_THRESHOLD = 0.5;
const SLEEVE_ELBOW_REACH_RATIO = 0.6;

function byId(frame: PoseFrame, id: PoseLandmark["id"]) {
  return frame.landmarks.find((landmark) => landmark.id === id) ?? null;
}

// Anchors the sleeve hem toward the real elbow direction/distance instead of
// a fixed shoulder-relative offset, so a raised or outstretched arm actually
// moves the sleeve. Falls back to the fixed offset when the elbow isn't
// confidently visible (e.g. tight upper-body framing).
function resolveSleevePoint(shoulder: Point, elbow: PoseLandmark | null, fallback: Point): Point {
  if (elbow && elbow.confidence >= ELBOW_CONFIDENCE_THRESHOLD) {
    return {
      x: shoulder.x + (elbow.x - shoulder.x) * SLEEVE_ELBOW_REACH_RATIO,
      y: shoulder.y + (elbow.y - shoulder.y) * SLEEVE_ELBOW_REACH_RATIO
    };
  }

  return fallback;
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
  const leftElbow = byId(frame, "leftElbow");
  const rightElbow = byId(frame, "rightElbow");

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return null;
  }

  const shoulderWidth = rightShoulder.x - leftShoulder.x;
  const torsoHeight = Math.max(leftHip.y, rightHip.y) - Math.min(leftShoulder.y, rightShoulder.y);

  if (shoulderWidth <= 0 || torsoHeight <= 0) {
    return null;
  }

  const centerX = (leftShoulder.x + rightShoulder.x) / 2;
  const sleeveDrop = torsoHeight * 0.25;
  const sleeveReach = shoulderWidth * 0.28;
  const shoulderLift = torsoHeight * 0.06;
  const neckInset = shoulderWidth * 0.18;
  const hipInset = shoulderWidth * 0.08;

  // Each row keeps its own left/right landmark Y instead of collapsing to a
  // shared min/max, so real shoulder/hip tilt reaches the mesh-warp rows
  // (buildGarmentGuidePoints) instead of being flattened out.
  return {
    centerX,
    height: torsoHeight,
    hipLeft: { x: leftHip.x + hipInset, y: leftHip.y },
    hipRight: { x: rightHip.x - hipInset, y: rightHip.y },
    leftShoulder: { x: leftShoulder.x - shoulderWidth * 0.08, y: leftShoulder.y + shoulderLift },
    neckLeft: { x: centerX - neckInset, y: leftShoulder.y - shoulderLift },
    neckRight: { x: centerX + neckInset, y: rightShoulder.y - shoulderLift },
    rightShoulder: { x: rightShoulder.x + shoulderWidth * 0.08, y: rightShoulder.y + shoulderLift },
    sleeveLeft: resolveSleevePoint(leftShoulder, leftElbow, {
      x: leftShoulder.x - sleeveReach,
      y: leftShoulder.y + sleeveDrop
    }),
    sleeveRight: resolveSleevePoint(rightShoulder, rightElbow, {
      x: rightShoulder.x + sleeveReach,
      y: rightShoulder.y + sleeveDrop
    }),
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