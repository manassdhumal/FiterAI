import type { PoseLandmark, PoseLandmarkId } from "./types";

// Live camera landmarks are noisy frame to frame; smoothing damps that jitter
// before it reaches garment placement/warping. Mock-pose motion is already a
// deterministic smooth function of time, so it should pass through
// unsmoothed (factor 1) to avoid adding artificial lag to a demo that isn't
// jittery to begin with.
export const DEFAULT_LANDMARK_SMOOTHING_FACTOR = 0.4;

export type LandmarkHistory = Map<PoseLandmarkId, PoseLandmark>;

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
