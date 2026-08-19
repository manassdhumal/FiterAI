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
  waistLeft: Point;
  waistRight: Point;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

export function calculateTorsoFitRegion(frame: PoseFrame, category?: string): TorsoFitRegion | null {
  const isBottoms = category && ["pants", "shorts", "skirt"].includes(category);
  const isShortsOrSkirt = category === "shorts" || category === "skirt";
  const isLooserTop = category && ["jacket", "sweater"].includes(category);

  const leftHipRaw = byId(frame, "leftHip");
  const rightHipRaw = byId(frame, "rightHip");
  const leftShoulderRaw = byId(frame, "leftShoulder");
  const rightShoulderRaw = byId(frame, "rightShoulder");
  const leftElbowRaw = byId(frame, "leftElbow");
  const rightElbowRaw = byId(frame, "rightElbow");

  if (isBottoms) {
    if (!leftHipRaw || !rightHipRaw) {
      return null;
    }
    
    const leftKneeRaw = byId(frame, "leftKnee");
    const rightKneeRaw = byId(frame, "rightKnee");
    const leftAnkleRaw = byId(frame, "leftAnkle");
    const rightAnkleRaw = byId(frame, "rightAnkle");

    const facesScreenNormally = rightHipRaw.x >= leftHipRaw.x;
    const leftHip = facesScreenNormally ? leftHipRaw : rightHipRaw;
    const rightHip = facesScreenNormally ? rightHipRaw : leftHipRaw;
    const leftKnee = facesScreenNormally ? leftKneeRaw : rightKneeRaw;
    const rightKnee = facesScreenNormally ? rightKneeRaw : leftKneeRaw;
    const leftAnkle = facesScreenNormally ? leftAnkleRaw : rightAnkleRaw;
    const rightAnkle = facesScreenNormally ? rightAnkleRaw : leftAnkleRaw;

    const leftShoulder = leftShoulderRaw && rightShoulderRaw ? (facesScreenNormally ? leftShoulderRaw : rightShoulderRaw) : null;
    const rightShoulder = leftShoulderRaw && rightShoulderRaw ? (facesScreenNormally ? rightShoulderRaw : leftShoulderRaw) : null;

    let waistLeft: Point;
    let waistRight: Point;

    if (leftShoulder && rightShoulder) {
      // waist is slightly above hip, towards shoulder
      waistLeft = {
        x: leftHip.x + (leftShoulder.x - leftHip.x) * 0.15,
        y: leftHip.y + (leftShoulder.y - leftHip.y) * 0.15
      };
      waistRight = {
        x: rightHip.x + (rightShoulder.x - rightHip.x) * 0.15,
        y: rightHip.y + (rightShoulder.y - rightHip.y) * 0.15
      };
    } else {
      // Guess waist location based on hip width
      const hipWidth = Math.abs(rightHip.x - leftHip.x);
      waistLeft = { x: leftHip.x, y: leftHip.y - hipWidth * 0.35 };
      waistRight = { x: rightHip.x, y: rightHip.y - hipWidth * 0.35 };
    }

    let kneeL = leftKnee ? { x: leftKnee.x, y: leftKnee.y } : { x: leftHip.x, y: leftHip.y + 0.3 };
    let kneeR = rightKnee ? { x: rightKnee.x, y: rightKnee.y } : { x: rightHip.x, y: rightHip.y + 0.3 };
    let ankleL = leftAnkle ? { x: leftAnkle.x, y: leftAnkle.y } : { x: kneeL.x, y: kneeL.y + 0.3 };
    let ankleR = rightAnkle ? { x: rightAnkle.x, y: rightAnkle.y } : { x: kneeR.x, y: kneeR.y + 0.3 };

    if (isShortsOrSkirt) {
      // Cut off at knee
      ankleL = { x: leftHip.x + (kneeL.x - leftHip.x) * 0.8, y: leftHip.y + (kneeL.y - leftHip.y) * 0.8 };
      ankleR = { x: rightHip.x + (kneeR.x - rightHip.x) * 0.8, y: rightHip.y + (kneeR.y - rightHip.y) * 0.8 };
      kneeL = { x: leftHip.x + (kneeL.x - leftHip.x) * 0.45, y: leftHip.y + (kneeL.y - leftHip.y) * 0.45 };
      kneeR = { x: rightHip.x + (kneeR.x - rightHip.x) * 0.45, y: rightHip.y + (kneeR.y - rightHip.y) * 0.45 };
    }

    const hemL = { x: ankleL.x, y: ankleL.y + 0.05 };
    const hemR = { x: ankleR.x, y: ankleR.y + 0.05 };

    const width = Math.max(0.1, Math.abs(rightHip.x - leftHip.x));
    const height = Math.max(0.1, Math.max(ankleL.y, ankleR.y) - waistLeft.y);

    return {
      centerX: (leftHip.x + rightHip.x) / 2,
      height,
      width,
      // Map bottoms landmarks to the 10-point mesh guide structure
      neckLeft: waistLeft,
      neckRight: waistRight,
      leftShoulder: { x: leftHip.x, y: leftHip.y },
      rightShoulder: { x: rightHip.x, y: rightHip.y },
      sleeveLeft: kneeL,
      sleeveRight: kneeR,
      waistLeft: ankleL,
      waistRight: ankleR,
      hipLeft: hemL,
      hipRight: hemR
    };
  }

  // Top wear logic
  if (!leftShoulderRaw || !rightShoulderRaw || !leftHipRaw || !rightHipRaw) {
    return null;
  }

  const facesScreenNormally = rightShoulderRaw.x >= leftShoulderRaw.x;
  const leftShoulder = facesScreenNormally ? leftShoulderRaw : rightShoulderRaw;
  const rightShoulder = facesScreenNormally ? rightShoulderRaw : leftShoulderRaw;
  const leftHip = facesScreenNormally ? leftHipRaw : rightHipRaw;
  const rightHip = facesScreenNormally ? rightHipRaw : leftHipRaw;
  const leftElbow = facesScreenNormally ? leftElbowRaw : rightElbowRaw;
  const rightElbow = facesScreenNormally ? rightElbowRaw : leftElbowRaw;

  const rawShoulderWidth = rightShoulder.x - leftShoulder.x;
  const torsoHeight = Math.max(leftHip.y, rightHip.y) - Math.min(leftShoulder.y, rightShoulder.y);

  if (rawShoulderWidth <= 0 || torsoHeight <= 0) {
    return null;
  }

  const MIN_WIDTH_TO_HEIGHT_RATIO = 0.35;
  const minHalfWidth = (torsoHeight * MIN_WIDTH_TO_HEIGHT_RATIO) / 2;
  const shoulderWidth = Math.max(rawShoulderWidth, minHalfWidth * 2);

  const centerX = (leftShoulder.x + rightShoulder.x) / 2;
  const sleeveDrop = torsoHeight * 0.25;
  const sleeveReach = shoulderWidth * 0.28;
  const neckInset = shoulderWidth * 0.18;

  const neckRise = torsoHeight * 0.16;
  const shoulderOutset = shoulderWidth * (isLooserTop ? 0.18 : 0.14); // Wider for jacket/sweater
  const shoulderRise = torsoHeight * 0.03;
  const shoulderRowHalfWidth = shoulderWidth / 2 + shoulderOutset;
  const waistEase = isLooserTop ? 1.25 : 1.18; // Looser fit for jacket/sweater
  const hipHalfWidth = Math.max((Math.abs(rightHip.x - leftHip.x) / 2) * waistEase, minHalfWidth);

  const waistT = (0.83 - 0.11) / (1 - 0.11);
  const waistHalfWidth = lerp(shoulderRowHalfWidth, hipHalfWidth, waistT);
  const waistDrop = torsoHeight * 0.06;
  const waistY = { left: leftHip.y - waistDrop, right: rightHip.y - waistDrop };

  const rawHipHalfWidth = Math.abs(rightHip.x - leftHip.x) / 2;
  const hipOutset = Math.max(0, minHalfWidth - rawHipHalfWidth);

  let targetLeftHip = { x: leftHip.x - hipOutset, y: leftHip.y };
  let targetRightHip = { x: rightHip.x + hipOutset, y: rightHip.y };

  if (isLooserTop) {
    // Drop hem slightly for jacket/sweater
    targetLeftHip.y += torsoHeight * 0.05;
    targetRightHip.y += torsoHeight * 0.05;
  }

  return {
    centerX,
    height: torsoHeight,
    hipLeft: targetLeftHip,
    hipRight: targetRightHip,
    leftShoulder: { x: leftShoulder.x - shoulderOutset, y: leftShoulder.y - shoulderRise },
    neckLeft: { x: centerX - neckInset, y: leftShoulder.y - neckRise },
    neckRight: { x: centerX + neckInset, y: rightShoulder.y - neckRise },
    rightShoulder: { x: rightShoulder.x + shoulderOutset, y: rightShoulder.y - shoulderRise },
    sleeveLeft: resolveSleevePoint(leftShoulder, leftElbow, {
      x: leftShoulder.x - sleeveReach,
      y: leftShoulder.y + sleeveDrop
    }),
    sleeveRight: resolveSleevePoint(rightShoulder, rightElbow, {
      x: rightShoulder.x + sleeveReach,
      y: rightShoulder.y + sleeveDrop
    }),
    waistLeft: { x: centerX - waistHalfWidth, y: waistY.left },
    waistRight: { x: centerX + waistHalfWidth, y: waistY.right },
    width: shoulderWidth
  };
}

export function buildGarmentGuidePoints(region: TorsoFitRegion): Point[] {
  return [
    region.neckLeft,
    region.leftShoulder,
    region.sleeveLeft,
    region.waistLeft,
    region.hipLeft,
    region.hipRight,
    region.waistRight,
    region.sleeveRight,
    region.rightShoulder,
    region.neckRight
  ];
}

export function createGarmentPlacement(
  frame: PoseFrame,
  adjustments: FitAdjustments,
  category?: string
): GarmentPlacement | null {
  const fitRegion = calculateTorsoFitRegion(frame, category);

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