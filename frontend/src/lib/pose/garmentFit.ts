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

export function calculateTorsoFitRegion(frame: PoseFrame): TorsoFitRegion | null {
  const leftShoulderRaw = byId(frame, "leftShoulder");
  const rightShoulderRaw = byId(frame, "rightShoulder");
  const leftHipRaw = byId(frame, "leftHip");
  const rightHipRaw = byId(frame, "rightHip");
  const leftElbowRaw = byId(frame, "leftElbow");
  const rightElbowRaw = byId(frame, "rightElbow");

  if (!leftShoulderRaw || !rightShoulderRaw || !leftHipRaw || !rightHipRaw) {
    return null;
  }

  // MediaPipe's left/right landmarks are the subject's own anatomical
  // sides, which land on opposite sides of the raw camera frame depending
  // on whether the person is facing the camera or has turned around (a
  // person facing the camera has their anatomical right shoulder appear on
  // the smaller-x side of the frame, like any normal, unmirrored photo of
  // someone facing you). Everything below assumes screen-space left/right
  // (smaller x = left) instead, so landmarks are normalized to that before
  // use - without this, shoulderWidth goes negative and this whole function
  // fails silently for anyone facing the camera normally (the common case),
  // only "working" by coincidence when facing away.
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

  // Turning toward profile relative to the camera foreshortens the 2D
  // shoulder-to-shoulder (and hip-to-hip) projection toward zero even though
  // the person hasn't actually gotten narrower - torsoHeight barely changes
  // under yaw rotation, only width does. A flat front-view garment image
  // warped by a mesh keyed directly to that width has no real depth to fall
  // back on, so an unclamped width collapses the whole garment to a
  // near-invisible sliver mid-turn instead of just narrowing it. Floor both
  // widths to the same minimum, derived from typical shoulder-width/torso-
  // height body proportions, so a turn still visibly narrows the garment but
  // can't erase it - and floors shoulder/hip together so the taper between
  // them stays consistent instead of one collapsing while the other doesn't.
  const MIN_WIDTH_TO_HEIGHT_RATIO = 0.35;
  const minHalfWidth = (torsoHeight * MIN_WIDTH_TO_HEIGHT_RATIO) / 2;
  const shoulderWidth = Math.max(rawShoulderWidth, minHalfWidth * 2);

  const centerX = (leftShoulder.x + rightShoulder.x) / 2;
  const sleeveDrop = torsoHeight * 0.25;
  const sleeveReach = shoulderWidth * 0.28;
  const neckInset = shoulderWidth * 0.18;

  // Live-tested feedback (collar sits too low, shoulders too narrow and too
  // low, waist still too tight and sits too high) pointed at these four
  // constants specifically - each tuned in the reported direction rather
  // than guessed blind:
  // - collar was only rising 2x shoulderLift (0.12*torsoHeight) above the
  //   shoulder line; raised further on its own constant.
  // - the shoulder row was pushed DOWN from the raw landmark, when it
  //   needed to sit AT/above it instead - and widened further (was too
  //   narrow even after the existing +8%/side outset).
  // - the waist row's upward offset from the hip line (0.18*torsoHeight)
  //   put it too far above the real hip; brought much closer to the hip
  //   line, and the hip width it interpolates toward now includes a
  //   drape-ease margin since even matching the real hip width read as
  //   too tight (a T-shirt hangs with some slack, it doesn't cling).
  const neckRise = torsoHeight * 0.16;
  const shoulderOutset = shoulderWidth * 0.14;
  const shoulderRise = torsoHeight * 0.03;
  const shoulderRowHalfWidth = shoulderWidth / 2 + shoulderOutset;
  const waistEase = 1.18;
  const hipHalfWidth = Math.max((Math.abs(rightHip.x - leftHip.x) / 2) * waistEase, minHalfWidth);

  // Interpolate the waist row's half-width between the shoulder row and the
  // (eased) hip half-width, following garmentMeshRowSourceFractions' own
  // [shoulder=0.11, hip=1] positions, so the taper follows the body's own
  // proportions instead of a fixed, body-agnostic guess.
  const waistT = (0.83 - 0.11) / (1 - 0.11);
  const waistHalfWidth = lerp(shoulderRowHalfWidth, hipHalfWidth, waistT);
  const waistDrop = torsoHeight * 0.06;
  const waistY = { left: leftHip.y - waistDrop, right: rightHip.y - waistDrop };

  // Same width-floor reasoning as shoulderWidth above, applied to the raw hip
  // line: only pushes each side outward from its own real position (leaving
  // normal, non-degenerate hip width untouched, preserving the earlier
  // hourglass-pinch fix below) when the raw span has collapsed under a
  // profile turn.
  const rawHipHalfWidth = Math.abs(rightHip.x - leftHip.x) / 2;
  const hipOutset = Math.max(0, minHalfWidth - rawHipHalfWidth);

  // Each row keeps its own left/right landmark Y instead of collapsing to a
  // shared min/max, so real shoulder/hip tilt reaches the mesh-warp rows
  // (buildGarmentGuidePoints) instead of being flattened out.
  return {
    centerX,
    height: torsoHeight,
    // No inward inset on the hip line - it previously narrowed the hem
    // inside the person's real hip width, compounding the pinch above.
    hipLeft: { x: leftHip.x - hipOutset, y: leftHip.y },
    hipRight: { x: rightHip.x + hipOutset, y: rightHip.y },
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