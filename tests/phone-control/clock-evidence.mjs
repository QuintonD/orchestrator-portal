// Test-only clock diagnostics. These facts never authorize or retry an action.
export const CLOCK_SAMPLE_TIMEOUT_MS = 1000;
export const CLOCK_SAMPLE_MAX_BYTES = 128;
const WALL_JUMP_TOLERANCE_MS = 5;
const epoch = value => Number.isSafeInteger(value) && value >= 0;

export function parseDeviceEpochMs(output) {
  if (typeof output !== 'string' || output.length > 32) return null;
  const match = /^(0|[1-9][0-9]{0,15})(?:\r{0,2}\n)$/u.exec(output);
  if (!match || match[0] !== output) return null;
  const value = Number(match[1]);
  return epoch(value) ? value : null;
}

function interval(times, limitMs) {
  const { hostStartedAtMs, hostFinishedAtMs, monotonicStartedMs, monotonicFinishedMs } = times ?? {};
  const elapsed = monotonicFinishedMs - monotonicStartedMs;
  const numeric = epoch(hostStartedAtMs) && epoch(hostFinishedAtMs)
    && Number.isFinite(monotonicStartedMs) && monotonicStartedMs >= 0
    && Number.isFinite(monotonicFinishedMs) && monotonicFinishedMs >= 0
    && Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 60000;
  if (!numeric) return { status: 'unavailable', reason: 'invalid_timing' };
  const facts = { hostStartedAtMs, hostFinishedAtMs, roundTripMs: Math.ceil(elapsed) };
  if (elapsed >= limitMs) return { status: 'unavailable', reason: 'deadline', ...facts };
  // Date.now has integer precision. A larger wall/monotonic disagreement makes
  // the offset interval unreliable; retain only the bounded timing facts.
  if (hostFinishedAtMs < hostStartedAtMs || Math.abs(hostFinishedAtMs - hostStartedAtMs - elapsed) > WALL_JUMP_TOLERANCE_MS) {
    return { status: 'unavailable', reason: 'host_clock_changed', ...facts };
  }
  return { status: 'sampled', ...facts };
}

function deviceInterval(timing, deviceEpochMs) {
  // Positive means the host clock is ahead. This brackets a clock reading, not
  // an action deadline; callers must not use it to change production limits.
  return { ...timing, deviceEpochMs,
    hostMinusDeviceLowerMs: timing.hostStartedAtMs - deviceEpochMs,
    hostMinusDeviceUpperMs: timing.hostFinishedAtMs - deviceEpochMs };
}

export function clockEvidence(result, times) {
  const timing = interval(times, CLOCK_SAMPLE_TIMEOUT_MS);
  if (timing.status !== 'sampled') return timing;
  if (result?.error?.code === 'ETIMEDOUT') return { ...timing, status: 'unavailable', reason: 'deadline' };
  if (!result || result.error || result.status !== 0 || result.signal !== null) {
    return { ...timing, status: 'unavailable', reason: 'query_failed' };
  }
  const deviceEpochMs = parseDeviceEpochMs(result.stdout);
  if (deviceEpochMs === null || result.stderr !== '') {
    return { ...timing, status: 'unavailable', reason: 'invalid_reply' };
  }
  return deviceInterval(timing, deviceEpochMs);
}

export function sampleClock(query, { wallNow = Date.now, monotonicNow = () => performance.now() } = {}) {
  const hostStartedAtMs = wallNow();
  const monotonicStartedMs = monotonicNow();
  let result;
  try { result = query(); } catch { /* Availability only; no exception text is retained. */ }
  const monotonicFinishedMs = monotonicNow();
  const hostFinishedAtMs = wallNow();
  return clockEvidence(result, { hostStartedAtMs, hostFinishedAtMs, monotonicStartedMs, monotonicFinishedMs });
}

export function observationClockEvidence(capturedAt, times) {
  const timing = interval(times, 60000);
  if (timing.status !== 'sampled') return timing;
  if (typeof capturedAt !== 'string' || capturedAt.length !== 24
      || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(capturedAt)) {
    return { ...timing, status: 'unavailable', reason: 'invalid_capture_time' };
  }
  const capturedAtMs = Date.parse(capturedAt);
  if (!epoch(capturedAtMs) || new Date(capturedAtMs).toISOString() !== capturedAt) {
    return { ...timing, status: 'unavailable', reason: 'invalid_capture_time' };
  }
  return { ...timing, capturedAtMs,
    hostMinusCaptureLowerMs: timing.hostStartedAtMs - capturedAtMs,
    hostMinusCaptureUpperMs: timing.hostFinishedAtMs - capturedAtMs };
}
