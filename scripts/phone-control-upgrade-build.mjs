// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../components/phone-control/ATTRIBUTION.md.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPrivate, securePath, writePrivate } from '../components/phone-control/src/security.mjs';

// Owner tooling only. The stable companion key is separate from the gateway key.
export function phoneSigningEnvironment(environment = process.env) {
  const directory = join(environment.LOCALAPPDATA, 'Orchestrator', 'signing');
  if (!existsSync(directory)) { mkdirSync(directory, { recursive: true }); securePath(directory, true); } assertPrivate(directory);
  const keystore = join(directory, 'phone-control.jks'); const passwordFile = join(directory, 'phone-control-password.txt');
  if (existsSync(keystore) !== existsSync(passwordFile)) throw new Error('phone_signing_identity_incomplete');
  const javaHome = environment.JAVA_HOME || 'C:/Program Files/Android/Android Studio/jbr';
  if (!existsSync(keystore)) {
    const password = randomBytes(32).toString('base64url'); writePrivate(passwordFile, password, { exclusive: true });
    execFileSync(join(javaHome, 'bin', 'keytool.exe'), ['-genkeypair', '-keystore', keystore, '-storetype', 'JKS', '-storepass:env', 'PHONE_SIGNING_PASSWORD', '-keypass:env', 'PHONE_SIGNING_PASSWORD', '-alias', 'phone-control', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Orchestrator Phone Control,OU=Companion Alpha,O=Orchestrator,C=NL'], { env: { ...environment, PHONE_SIGNING_PASSWORD: password }, stdio: 'pipe', windowsHide: true });
    securePath(keystore);
  }
  assertPrivate(keystore); assertPrivate(passwordFile);
  return { ...environment, JAVA_HOME: javaHome, ANDROID_HOME: environment.ANDROID_HOME || join(environment.LOCALAPPDATA, 'Android', 'Sdk'), PHONE_ANDROID_KEYSTORE: keystore, PHONE_ANDROID_KEY_PASSWORD: readFileSync(passwordFile, 'utf8').trim(), PHONE_ANDROID_KEY_ALIAS: 'phone-control' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = resolve(process.argv[2] || '.'); const environment = phoneSigningEnvironment();
  execFileSync(process.execPath, ['scripts/phone-android-build.mjs', 'release'], { cwd: project, env: environment, stdio: 'inherit', windowsHide: true, timeout: 600_000 });
}
