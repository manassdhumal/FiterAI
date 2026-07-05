import type { PoseLandmark, PoseLandmark3d, PoseLandmarkId } from "./types";

// One Euro Filter (Casiez, Roussel & Vogel, 2012): an adaptive low-pass
// filter built specifically for noisy real-time signals like this one. A
// fixed-ratio EMA (the previous approach here) can only trade jitter
// against lag via one constant - smooth it enough to kill MediaPipe's
// per-frame jitter and the garment visibly lags behind real movement;
// loosen it for responsiveness and the jitter comes back. One Euro instead
// tracks the signal's own velocity and tightens smoothing only when nearly
// still, loosening automatically during fast movement - low jitter at rest,
// low lag in motion, without picking one fixed compromise.
export type OneEuroFilterParams = {
  // How aggressively the cutoff rises with velocity - higher means motion
  // has to move faster before lag noticeably drops.
  beta: number;
  // Cutoff (Hz) for smoothing the velocity estimate itself; rarely needs
  // tuning per the original paper.
  dCutoff: number;
  // Baseline cutoff (Hz) used when the landmark is nearly still - lower
  // means more aggressive jitter suppression at rest.
  minCutoff: number;
};

// Tuned for landmark coordinates in video-pixel space (typically a
// 0-1280ish range), not the small mouse-pixel deltas the original paper's
// example parameters assume - beta is scaled so a brisk gesture (several
// hundred px/sec) meaningfully raises the cutoff and cuts lag, while a
// still or slow-moving landmark stays heavily smoothed.
export const DEFAULT_LANDMARK_FILTER_PARAMS: OneEuroFilterParams = {
  beta: 0.012,
  dCutoff: 1,
  minCutoff: 1
};

// Z (world-space depth, meters) moves on a totally different scale than
// pixel-space x/y and is noisier per MediaPipe's own guidance, so it keeps
// its own heavier-smoothing parameter set.
export const DEFAULT_LANDMARK_FILTER_PARAMS_Z: OneEuroFilterParams = {
  beta: 0.4,
  dCutoff: 1,
  minCutoff: 0.8
};

type AxisFilterState = {
  dxPrev: number;
  lastTimestampMs: number | null;
  xPrev: number;
};

function createAxisFilterState(): AxisFilterState {
  return { dxPrev: 0, lastTimestampMs: null, xPrev: 0 };
}

function lowPassAlpha(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

// Floor on dt so a stalled rAF loop (tab backgrounded, huge frame gap)
// can't produce a near-zero or negative dt and blow up the alpha math.
const MIN_DT_SECONDS = 1 / 120;

function stepOneEuro(value: number, timestampMs: number, state: AxisFilterState, params: OneEuroFilterParams): number {
  if (state.lastTimestampMs === null) {
    state.lastTimestampMs = timestampMs;
    state.xPrev = value;
    state.dxPrev = 0;
    return value;
  }

  const dtSeconds = Math.max((timestampMs - state.lastTimestampMs) / 1000, MIN_DT_SECONDS);
  state.lastTimestampMs = timestampMs;

  const rawVelocity = (value - state.xPrev) / dtSeconds;
  const dAlpha = lowPassAlpha(params.dCutoff, dtSeconds);
  const velocity = state.dxPrev + dAlpha * (rawVelocity - state.dxPrev);

  const cutoff = params.minCutoff + params.beta * Math.abs(velocity);
  const alpha = lowPassAlpha(cutoff, dtSeconds);
  const filtered = state.xPrev + alpha * (value - state.xPrev);

  state.xPrev = filtered;
  state.dxPrev = velocity;

  return filtered;
}

type LandmarkFilterState = {
  x: AxisFilterState;
  y: AxisFilterState;
};

type LandmarkFilterState3d = LandmarkFilterState & {
  z: AxisFilterState;
};

// Per-landmark filter state, keyed by landmark id and mutated in place
// frame-to-frame - this is genuinely stateful (unlike the old "previous
// value" history), since the filter needs its own running velocity
// estimate per axis, not just the last position.
export type LandmarkHistory = Map<PoseLandmarkId, LandmarkFilterState>;
export type LandmarkHistory3d = Map<PoseLandmarkId, LandmarkFilterState3d>;

export function createLandmarkHistory(): LandmarkHistory {
  return new Map();
}

export function createLandmarkHistory3d(): LandmarkHistory3d {
  return new Map();
}

export function smoothLandmarks(
  landmarks: PoseLandmark[],
  history: LandmarkHistory,
  timestampMs: number,
  params: OneEuroFilterParams = DEFAULT_LANDMARK_FILTER_PARAMS
): PoseLandmark[] {
  return landmarks.map((landmark) => {
    let state = history.get(landmark.id);

    if (!state) {
      state = { x: createAxisFilterState(), y: createAxisFilterState() };
      history.set(landmark.id, state);
    }

    return {
      ...landmark,
      x: stepOneEuro(landmark.x, timestampMs, state.x, params),
      y: stepOneEuro(landmark.y, timestampMs, state.y, params)
    };
  });
}

export function smoothLandmarks3d(
  landmarks: PoseLandmark3d[],
  history: LandmarkHistory3d,
  timestampMs: number,
  params: OneEuroFilterParams = DEFAULT_LANDMARK_FILTER_PARAMS,
  paramsZ: OneEuroFilterParams = DEFAULT_LANDMARK_FILTER_PARAMS_Z
): PoseLandmark3d[] {
  return landmarks.map((landmark) => {
    let state = history.get(landmark.id);

    if (!state) {
      state = { x: createAxisFilterState(), y: createAxisFilterState(), z: createAxisFilterState() };
      history.set(landmark.id, state);
    }

    return {
      ...landmark,
      x: stepOneEuro(landmark.x, timestampMs, state.x, params),
      y: stepOneEuro(landmark.y, timestampMs, state.y, params),
      z: stepOneEuro(landmark.z, timestampMs, state.z, paramsZ)
    };
  });
}
