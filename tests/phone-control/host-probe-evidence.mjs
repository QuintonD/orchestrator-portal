// Test-only, fixed diagnostic facts. These never establish a successful action.
const reasons = new Set(['probe_error', 'probe_deadline', 'host_stop_file', 'screen_off', 'accessibility_interrupted', 'accessibility_disconnected', 'accessibility_disabled', 'session_deadline', 'listener_unavailable', 'paired_host_stop', 'owner_stop', 'policy_changed', 'other_session_end']);
const maximumElapsedMs = 86_400_000;
export function parseHostProbeEvidence(output, exitCode) {
  const lines = String(output).split(/[\r\n]+/u);
  const ready = lines.flatMap(line => /^INSTRUMENTATION_STATUS: stream=PHONE_HOST_PROBE_READY \(private test token; (180|360) second maximum\)$/u.exec(line)?.slice(1) ?? []);
  const fields = new Map();
  for (const line of lines) {
    const match = /^INSTRUMENTATION_RESULT: phone_qa_probe_(end_reason|elapsed_ms|lease_seconds|interactive|keyguard_locked)=(.*)$/u.exec(line);
    if (match) { const values = fields.get(match[1]) ?? []; values.push(match[2]); fields.set(match[1], values); }
  }
  const single = name => fields.get(name)?.length === 1 ? fields.get(name)[0] : undefined;
  const reason = single('end_reason'); const elapsed = single('elapsed_ms'); const lease = single('lease_seconds');
  const interactive = single('interactive'); const keyguard = single('keyguard_locked');
  const valid = ready.length === 1 && ready[0] === lease && fields.size === 5 && reasons.has(reason) && /^(?:0|[1-9]\d{0,7})$/u.test(elapsed ?? '') && Number(elapsed) <= maximumElapsedMs
    && ['180', '360'].includes(lease) && ['true', 'false'].includes(interactive) && ['true', 'false'].includes(keyguard);
  return {
    adbExitCode: Number.isSafeInteger(exitCode) ? exitCode : null,
    readyLeaseSeconds: ready.length === 1 ? Number(ready[0]) : null,
    terminalState: fields.size === 0 ? 'missing' : valid ? 'recorded' : 'invalid',
    ...(valid ? { endReason: reason, nativeElapsedMs: Number(elapsed), leaseSeconds: Number(lease), interactive: interactive === 'true', keyguardLocked: keyguard === 'true' } : {}),
  };
}
export function parsePowerEvidence(output) {
  const lines = String(output).split(/\r?\n/u);
  const values = name => lines.filter(line => new RegExp(`^\\s*${name}=`).test(line)).map(line => line.trim().slice(name.length + 1));
  const wakefulness = values('mWakefulness'); const powered = values('mIsPowered');
  return {
    wakefulness: wakefulness.length === 1 && ['Awake', 'Asleep', 'Dozing', 'Dreaming'].includes(wakefulness[0]) ? wakefulness[0] : null,
    powered: powered.length === 1 && ['true', 'false'].includes(powered[0]) ? powered[0] === 'true' : null,
  };
}
