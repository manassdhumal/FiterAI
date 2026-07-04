import type { PoseLandmark, PoseLandmark3d, PoseLandmarkId } from "./types";

// Live camera landmarks are noisy frame to frame; smoothing damps that jitter
// before it reaches garment placement/warping. Mock-pose motion is already a
// deterministic smooth function of time, so it should pass through
// unsmoothed (factor 1) to avoid adding artificial lag to a demo that isn't
// jittery to begin with.
export const DEFAULT_LANDMARK_SMOOTHING_FACTOR = 0.4;

// World-space z (real depth, in meters) is noisier than normalized x/y per
// MediaPipe's own guidance, so it gets its own, heavier smoothing factor.
export const DEFAULT_LANDMARK_SMOOTHING_FACTOR_Z = 0.25;

export type LandmarkHistory = Map<PoseLandmarkId, PoseLandmark>;
export type LandmarkHistory3d = Map<PoseLandmarkId, PoseLandmark3d>;

export function smoothLandmarks(
  landmarks: PoseLandmark[],
  previous: LandmarkHistory | null,
  smoothingFactor: number
): PoseLandmark[] {
  if (!previous || smoothingFactor >= 1) {
    return landmarks;
  }

  return landmarks.map((landmark) => {
    const prior = previous.get(landmark.id);

    if (!prior) {
      return landmark;
    }

    return {
      ...landmark,
      x: prior.x + (landmark.x - prior.x) * smoothingFactor,
      y: prior.y + (landmark.y - prior.y) * smoothingFactor
    };
  });
}

export function toLandmarkHistory(landmarks: PoseLandmark[]): LandmarkHistory {
  return new Map(landmarks.map((landmark) => [landmark.id, landmark]));
}

export function smoothLandmarks3d(
  landmarks: PoseLandmark3d[],
  previous: LandmarkHistory3d | null,
  smoothingFactor: number,
  smoothingFactorZ: number = smoothingFactor
): PoseLandmark3d[] {
  if (!previous || (smoothingFactor >= 1 && smoothingFactorZ >= 1)) {
    return landmarks;
  }

  return landmarks.map((landmark) => {
    const prior = previous.get(landmark.id);

    if (!prior) {
      return landmark;
    }

    return {
      ...landmark,
      x: prior.x + (landmark.x - prior.x) * smoothingFactor,
      y: prior.y + (landmark.y - prior.y) * smoothingFactor,
      z: prior.z + (landmark.z - prior.z) * smoothingFactorZ
    };
  });
}

export function toLandmarkHistory3d(landmarks: PoseLandmark3d[]): LandmarkHistory3d {
  return new Map(landmarks.map((landmark) => [landmark.id, landmark]));
}
