// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../../components/phone-control/ATTRIBUTION.md.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { phoneSigningEnvironment } from '../../scripts/phone-control-upgrade-build.mjs';
import { installedIdentity, sameInstallation, verifiedSnapshot } from './upgrade-evidence.mjs';

// Owner-side destructive-install operations are deliberately absent: no uninstall,
// data clearing, downgrade flag, or emulator wipe is part of this upgrade proof.
const TARGET = 'io.github.quintond.orchestrator.phonecontrol';
const TEST = 'io.github.quintond.orchestrator.phoneupgrade';
const root = fileURLToPath(new URL('../../', import.meta.url));
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (!['--serial', '--baseline', '--candidate', '--output', '--resume-results'].includes(key) || options[key] || !process.argv[index + 1]) throw new Error('usage_serial_baseline_candidate_output');
  options[key] = process.argv[index + 1];
}
if (!/^emulator-\d+$/u.test(options['--serial'] ?? '') || !options['--baseline'] || !options['--candidate'] || !options['--output']) throw new Error('explicit_emulator_and_apks_required');
const serial = options['--serial']; const output = resolve(options['--output']); mkdirSync(output, { recursive: true });
const environment = phoneSigningEnvironment(); const sdk = environment.ANDROID_HOME; const buildTools = join(sdk, 'build-tools', '36.0.0');
const adbTool = join(sdk, 'platform-tools', 'adb.exe'); const java = join(environment.JAVA_HOME, 'bin'); const androidJar = join(sdk, 'platforms', 'android-36', 'android.jar');
const evidence = { kind: 'signed-companion-in-place-upgrade', serial, startedAt: new Date().toISOString(), baseline: {}, candidate: {}, assertions: [], status: 'running', limits: ['Emulator engineering evidence; not physical-device acceptance.', 'The signed baseline is established from a retained alpha 1 source snapshot, not a previous published companion release.'] };
let seedProcess; let localPort;
function checkpoint() { writeFileSync(join(output, 'results.json'), JSON.stringify(evidence, null, 2)); }
function check(value, name) { evidence.assertions.push({ name, passed: Boolean(value) }); checkpoint(); if (!value) throw new Error(name); }
function run(tool, args, extra = {}) {
  if (tool.endsWith('apksigner.bat')) return run(join(java, 'java.exe'), ['-jar', join(buildTools, 'lib', 'apksigner.jar'), ...args], extra);
  if (tool.endsWith('d8.bat')) return run(join(java, 'java.exe'), ['-cp', join(buildTools, 'lib', 'd8.jar'), 'com.android.tools.r8.D8', ...args], extra);
  return execFileSync(tool, args, { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 60_000, ...extra }).trim();
}
function adb(...args) { return run(adbTool, ['-s', serial, ...args]); }
const sha = (value) => createHash('sha256').update(value).digest('hex');
evidence.harnessSources = ['tests/phone-control/upgrade.mjs', 'tests/phone-control/upgrade-evidence.mjs', 'tests/phone-control/upgrade/UpgradeProbe.java'].map((path) => ({ path, sha256: sha(readFileSync(join(root, path))) }));
function apkIdentity(path) {
  const badging = run(join(buildTools, 'aapt.exe'), ['dump', 'badging', path]);
  const packageInfo = badging.match(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/mu);
  const signature = run(join(buildTools, 'apksigner.bat'), ['verify', '--print-certs', path]);
  const certificate = signature.match(/^Signer #1 certificate SHA-256 digest: ([a-f0-9]+)$/mu)?.[1];
  check(Boolean(packageInfo && certificate), 'apk_metadata_available');
  const digest = sha(readFileSync(path)); const metadata = join(output, 'metadata', digest); mkdirSync(metadata, { recursive: true });
  run(join(java, 'jar.exe'), ['xf', path, 'assets/release-identity.json'], { cwd: metadata });
  const source = JSON.parse(readFileSync(join(metadata, 'assets/release-identity.json'), 'utf8'));
  check(/^[a-f0-9]{40}$/u.test(source.commit) && typeof source.dirty === 'boolean' && source.variant === 'Release', 'embedded_release_source_identity_available');
  return { path, sha256: digest, applicationId: packageInfo[1], versionCode: Number(packageInfo[2]), versionName: packageInfo[3], signerSha256: certificate, debuggable: /^application-debuggable$/mu.test(badging), source };
}
function installed() {
  const value = adb('shell', 'dumpsys', 'package', TARGET);
  return installedIdentity(value);
}
function buildProbe() {
  const probe = join(output, 'probe'); const classes = join(probe, 'classes'); const dex = join(probe, 'dex'); mkdirSync(classes, { recursive: true }); mkdirSync(dex, { recursive: true });
  const manifest = join(probe, 'AndroidManifest.xml');
  writeFileSync(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${TEST}"><uses-sdk android:minSdkVersion="34" android:targetSdkVersion="36"/><application android:label="Phone Upgrade QA" android:hasCode="true"/><instrumentation android:name="${TEST}.UpgradeProbe" android:targetPackage="${TARGET}"/></manifest>`);
  run(join(java, 'javac.exe'), ['--release', '17', '-classpath', androidJar, '-d', classes, join(root, 'tests/phone-control/upgrade/UpgradeProbe.java')]);
  const classFiles = []; const visit = (directory) => { for (const item of readdirSync(directory, { withFileTypes: true })) item.isDirectory() ? visit(join(directory, item.name)) : item.name.endsWith('.class') && classFiles.push(join(directory, item.name)); }; visit(classes);
  run(join(buildTools, 'd8.bat'), ['--min-api', '34', '--lib', androidJar, '--output', dex, ...classFiles]);
  const unsigned = join(probe, 'unsigned.apk'); const aligned = join(probe, 'aligned.apk'); const apk = join(probe, 'upgrade-probe.apk');
  run(join(buildTools, 'aapt2.exe'), ['link', '-I', androidJar, '--manifest', manifest, '-o', unsigned]);
  run(join(java, 'jar.exe'), ['uf', unsigned, '-C', dex, 'classes.dex']);
  run(join(buildTools, 'zipalign.exe'), ['-f', '4', unsigned, aligned]);
  run(join(buildTools, 'apksigner.bat'), ['sign', '--ks', environment.PHONE_ANDROID_KEYSTORE, '--ks-key-alias', environment.PHONE_ANDROID_KEY_ALIAS, '--ks-pass', 'env:PHONE_ANDROID_KEY_PASSWORD', '--key-pass', 'env:PHONE_ANDROID_KEY_PASSWORD', '--out', apk, aligned]);
  return apk;
}
async function startSeed() {
  return new Promise((yes, no) => {
    let text = ''; const timeout = setTimeout(() => no(new Error('baseline_seed_timeout')), 45_000);
    seedProcess = spawn(adbTool, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-e', 'phase', 'seed', `${TEST}/${TEST}.UpgradeProbe`], { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    seedProcess.stderr.on('data', () => {});
    seedProcess.stdout.on('data', (chunk) => {
      text += chunk.toString('utf8'); if (text.length > 32768) { clearTimeout(timeout); no(new Error('baseline_seed_output_invalid')); return; }
      const token = text.match(/INSTRUMENTATION_STATUS: upgrade_token=([A-Za-z0-9_-]{32,96})/u)?.[1];
      const snapshot = text.match(/INSTRUMENTATION_STATUS: upgrade_snapshot=([a-f0-9]{64})/u)?.[1];
      if (token && snapshot) { clearTimeout(timeout); yes({ token, snapshot }); }
    });
    seedProcess.on('error', () => { clearTimeout(timeout); no(new Error('baseline_seed_unavailable')); });
    seedProcess.on('close', () => { clearTimeout(timeout); evidence.seedDiagnostic = text.replace(/[A-Za-z0-9_-]{32,}/gu, '[REDACTED]').slice(-4096); no(new Error('baseline_seed_ended_early')); });
  });
}
async function nativeDescribe(token) {
  const id = randomUUID(); const response = await fetch(`http://127.0.0.1:${localPort}/v1/call`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ id, method: 'describe', params: {} }), signal: AbortSignal.timeout(3000) });
  const body = await response.json(); return { accepted: response.ok && body.id === id && body.result?.protocolVersion === 1, appVersion: body.result?.appVersion };
}
try {
  const bootDeadline = Date.now() + 180_000;
  let booted = false;
  while (!booted && Date.now() < bootDeadline) { try { booted = adb('shell', 'getprop', 'sys.boot_completed') === '1'; } catch { /* Wait only for this explicitly selected emulator. */ } if (!booted) await delay(500); }
  check(booted, 'emulator_boot_completed');
  check(adb('shell', 'getprop', 'ro.kernel.qemu') === '1', 'target_is_emulator');
  evidence.platform = { sdk: adb('shell', 'getprop', 'ro.build.version.sdk'), release: adb('shell', 'getprop', 'ro.build.version.release'), fingerprint: adb('shell', 'getprop', 'ro.build.fingerprint') };
  check(Number(evidence.platform.sdk) >= 34, 'supported_android_version');
  const baselineCopy = join(output, 'baseline-signed.apk'); const candidateCopy = join(output, 'candidate-signed.apk');
  check(!existsSync(baselineCopy) && !existsSync(candidateCopy), 'evidence_directory_not_reused');
  copyFileSync(resolve(options['--baseline']), baselineCopy); copyFileSync(resolve(options['--candidate']), candidateCopy);
  evidence.baseline = apkIdentity(baselineCopy); evidence.candidate = apkIdentity(candidateCopy);
  if (evidence.candidate.source.dirty) evidence.limits.push('Candidate contains uncommitted source; publication requires a fresh build and full upgrade run from the released commit.');
  check(evidence.baseline.applicationId === TARGET && evidence.candidate.applicationId === TARGET, 'production_application_id_retained');
  check(!evidence.baseline.debuggable && !evidence.candidate.debuggable, 'both_companions_are_nondebuggable_releases');
  check(evidence.baseline.signerSha256 === evidence.candidate.signerSha256, 'dedicated_signing_identity_retained');
  check(evidence.baseline.versionCode < evidence.candidate.versionCode && evidence.baseline.versionName !== evidence.candidate.versionName, 'displayed_version_and_version_code_advance');
  const present = installed();
  const priorText = options['--resume-results'] ? readFileSync(resolve(options['--resume-results']), 'utf8') : undefined;
  const prior = priorText ? JSON.parse(priorText) : undefined;
  if (prior) {
    check(prior.status === 'failed' && prior.serial === serial && ['candidate_preserves_allowlists_pins_settings_bytes_and_defaults_disclosure_to_deny', 'independently_read_state_snapshot_identical_after_upgrade'].includes(prior.failure), 'continuation_is_only_postupgrade_verifier_completion');
    check(prior.baseline.sha256 === evidence.baseline.sha256 && prior.candidate.sha256 === evidence.candidate.sha256 && sameInstallation(prior.before, present) && present.versionCode === evidence.candidate.versionCode, 'continuation_retains_exact_apks_and_installed_data');
    check(prior.assertions.some((item) => item.name === 'old_active_authority_rejected_before_any_verifier_restart' && item.passed), 'prior_upgrade_independently_revoked_live_authority');
    evidence.continuation = { priorResults: resolve(options['--resume-results']), priorResultsSha256: sha(priorText), reason: 'Complete the corrected verifier on the existing updated installation; no production APK was installed again.' };
    evidence.limits.push('This is a linked verifier continuation. A publishable release requires a fresh complete run without continuation.');
  } else check(present.versionCode === 0 || present.versionCode === evidence.baseline.versionCode, 'no_downgrade_or_replacement_of_candidate');
  const probe = buildProbe();
  evidence.probeSha256 = sha(readFileSync(probe));
  evidence.fixtureSha256 = sha(readFileSync(resolve('apps/phone-android/fixture/build/outputs/apk/debug/fixture-debug.apk')));
  if (!prior) { adb('install', '-r', resolve('apps/phone-android/fixture/build/outputs/apk/debug/fixture-debug.apk')); adb('install', '-r', evidence.baseline.path); }
  adb('install', '-r', probe);
  let seeded;
  if (!prior) {
  adb('shell', 'pm', 'grant', TARGET, 'android.permission.POST_NOTIFICATIONS');
  adb('shell', 'input', 'keyevent', '82');
  adb('shell', 'am', 'start', '-W', '-n', `${TARGET}/${TARGET}.MainActivity`);
  seeded = await startSeed(); evidence.seedSnapshotSha256 = seeded.snapshot;
  localPort = Number(adb('forward', 'tcp:0', 'tcp:8837')); check(Number.isInteger(localPort) && localPort > 1024, 'dedicated_native_forward_created');
  const oldAuthority = await nativeDescribe(seeded.token); check(oldAuthority.accepted, 'previous_signed_version_has_live_session_before_upgrade');
  evidence.before = installed(); check(evidence.before.versionCode === evidence.baseline.versionCode && evidence.before.notificationGranted, 'previous_install_and_notification_setting_verified');
  const accessibilityBefore = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services'); check(accessibilityBefore.includes(`${TARGET}/${TARGET}.PhoneService`), 'accessibility_setting_present_before_upgrade');
  checkpoint();
  adb('install', '-r', evidence.candidate.path); // The actual supported update: same app, signature and retained data.
  adb('shell', 'am', 'start', '-W', '-n', `${TARGET}/${TARGET}.MainActivity`);
  evidence.after = installed();
  check(evidence.after.versionCode === evidence.candidate.versionCode && evidence.after.versionName === evidence.candidate.versionName, 'candidate_launches_with_new_version');
  check(sameInstallation(evidence.before, evidence.after), 'same_android_installation_and_uid_preserved');
  check(evidence.after.notificationGranted, 'notification_permission_preserved');
  check(adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services') === accessibilityBefore, 'accessibility_setting_preserved');
  let oldTokenAccepted = false; try { oldTokenAccepted = (await nativeDescribe(seeded.token)).accepted; } catch { /* Closed transport is the expected stopped-session outcome. */ }
  check(!oldTokenAccepted, 'old_active_authority_rejected_before_any_verifier_restart');
  } else {
    seeded = { snapshot: prior.seedSnapshotSha256 }; evidence.seedSnapshotSha256 = seeded.snapshot;
    evidence.before = prior.before; evidence.after = present;
    evidence.assertions.push(...prior.assertions.filter((item) => item.passed)); checkpoint();
  }
  const verified = adb('shell', 'am', 'instrument', '-w', '-r', '-e', 'phase', 'verify', `${TEST}/${TEST}.UpgradeProbe`);
  evidence.verifierDiagnostic = verified.replace(/[A-Za-z0-9_-]{32,}/gu, '[REDACTED]').slice(-4096);
  const afterSnapshot = verifiedSnapshot(verified);
  check(Boolean(afterSnapshot), 'candidate_preserves_allowlists_pins_settings_bytes_and_defaults_disclosure_to_deny');
  check(afterSnapshot === seeded.snapshot, 'independently_read_state_snapshot_identical_after_upgrade');
  evidence.candidateSnapshotSha256 = afterSnapshot; evidence.status = 'passed'; evidence.finishedAt = new Date().toISOString();
  checkpoint(); console.log(JSON.stringify({ status: evidence.status, assertions: evidence.assertions.length, results: join(output, 'results.json') }));
} catch (failure) {
  evidence.status = 'failed'; evidence.failure = /^[a-z_]+$/u.test(failure.message) ? failure.message : 'upgrade_qa_command_failed'; evidence.finishedAt = new Date().toISOString(); checkpoint();
  console.error(JSON.stringify({ status: evidence.status, failure: evidence.failure, results: join(output, 'results.json') })); process.exitCode = 1;
} finally {
  seedProcess?.kill(); if (localPort) { try { adb('forward', '--remove', `tcp:${localPort}`); } catch { /* Dedicated forwarding only; no other emulator is touched. */ } }
}
