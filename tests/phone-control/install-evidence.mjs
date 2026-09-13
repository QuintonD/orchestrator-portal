// Test-only projection: retain fixed install facts, never APK paths or messages.
// AOSP PackageManager.installStatusToString, android16-qpr2-release:
// https://android.googlesource.com/platform/frameworks/base/+/android16-qpr2-release/core/java/android/content/pm/PackageManager.java
const installCodes = new Set([
  ...['ALREADY_EXISTS', 'INVALID_APK', 'INVALID_URI', 'INSUFFICIENT_STORAGE', 'DUPLICATE_PACKAGE', 'NO_SHARED_USER', 'UPDATE_INCOMPATIBLE', 'SHARED_USER_INCOMPATIBLE', 'MISSING_SHARED_LIBRARY', 'REPLACE_COULDNT_DELETE', 'DEXOPT', 'OLDER_SDK', 'CONFLICTING_PROVIDER', 'NEWER_SDK', 'TEST_ONLY', 'CPU_ABI_INCOMPATIBLE', 'MISSING_FEATURE', 'CONTAINER_ERROR', 'INVALID_INSTALL_LOCATION', 'MEDIA_UNAVAILABLE', 'VERIFICATION_TIMEOUT', 'VERIFICATION_FAILURE', 'PACKAGE_CHANGED', 'UID_CHANGED', 'VERSION_DOWNGRADE', 'INTERNAL_ERROR', 'USER_RESTRICTED', 'DUPLICATE_PERMISSION', 'NO_MATCHING_ABIS', 'ABORTED', 'BAD_DEX_METADATA', 'MISSING_SPLIT', 'DEPRECATED_SDK_VERSION', 'BAD_SIGNATURE', 'WRONG_INSTALLED_VERSION', 'PROCESS_NOT_DEFINED', 'SESSION_INVALID', 'SHARED_LIBRARY_BAD_CERTIFICATE_DIGEST', 'MULTI_ARCH_NOT_MATCH_ALL_NATIVE_ABIS'].map(code => 'INSTALL_FAILED_' + code),
  ...['NOT_APK', 'BAD_MANIFEST', 'UNEXPECTED_EXCEPTION', 'NO_CERTIFICATES', 'INCONSISTENT_CERTIFICATES', 'CERTIFICATE_ENCODING', 'BAD_PACKAGE_NAME', 'BAD_SHARED_USER_ID', 'MANIFEST_MALFORMED', 'MANIFEST_EMPTY'].map(code => 'INSTALL_PARSE_FAILED_' + code),
]);
const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV', 'SIGILL', 'SIGBUS', 'SIGFPE', 'SIGHUP', 'SIGPIPE', 'SIGQUIT', 'SIGBREAK']);
const roles = new Set(['companion', 'fixture', 'instrumentation']);
const maximumOutputBytes = 16384;

export function parseInstallEvidence({ role, apkPath, elapsedMs, exitCode, signal, commandSucceeded, stdout, stderr }) {
  const evidence = {
    role: roles.has(role) ? role : null,
    elapsedMs: Number.isInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 60000 ? elapsedMs : null,
    exitCode: Number.isInteger(exitCode) && exitCode >= -2147483648 && exitCode <= 4294967295 ? exitCode : null,
    signal: signals.has(signal) ? signal : null,
    passed: false, installCode: null, protocol: 'unrecognized',
  };
  if (typeof stdout !== 'string' || typeof stderr !== 'string') return evidence;
  if (stdout.length + stderr.length > maximumOutputBytes || Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maximumOutputBytes) return { ...evidence, protocol: 'oversized' };
  const lines = value => value.replace(/\r\r?\n/gu, '\n').split('\n').filter(line => line !== '');
  const out = lines(stdout); const err = lines(stderr);
  const success = err.length === 0 && (out.length === 1 && out[0] === 'Success' || out.length === 2 && out[0] === 'Performing Streamed Install' && out[1] === 'Success');
  if (success) return { ...evidence, protocol: 'success', passed: commandSucceeded === true && exitCode === 0 && signal == null && evidence.role !== null && evidence.elapsedMs !== null };
  const all = [...out, ...err]; const failures = [];
  let banners = 0;
  const prefix = typeof apkPath === 'string' && apkPath.length <= 4096 && !/[\r\n]/u.test(apkPath) ? 'adb: failed to install ' + apkPath + ': ' : null;
  for (const line of all) {
    if (line === 'Performing Streamed Install') { banners++; continue; }
    const payload = prefix && line.startsWith(prefix) ? line.slice(prefix.length) : line;
    const code = /^Failure \[((?:INSTALL_FAILED|INSTALL_PARSE_FAILED)_[A-Z0-9_]+)(?:: [^\r\n]*)?\]$/u.exec(payload)?.[1];
    if (!installCodes.has(code)) return evidence;
    failures.push(code);
  }
  if (failures.length === 1 && banners <= 1) return { ...evidence, installCode: failures[0], protocol: 'package_manager_failure' };
  return evidence;
}
