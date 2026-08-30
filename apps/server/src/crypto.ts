import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import path from "node:path";

function derive(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export class Vault {
  private readonly key: Buffer;

  constructor(dataDir: string, suppliedKey?: string) {
    this.key = suppliedKey ? decodeKey(suppliedKey) : loadOrCreateLocalKey(dataDir);
  }

  seal(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  open<T>(sealed: string): T {
    const [version, iv, tag, ciphertext] = sealed.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted value");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  }
}

function decodeKey(value: string): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength !== 32) throw new Error("ORCHESTRATOR_MASTER_KEY must be 32 bytes encoded as base64");
  return decoded;
}

function loadOrCreateLocalKey(dataDir: string): Buffer {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dataDir, "master.key");
  if (existsSync(keyPath)) return decodeKey(readFileSync(keyPath, "utf8").trim());
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString("base64"), { encoding: "utf8", mode: 0o600, flag: "wx" });
  try { chmodSync(keyPath, 0o600); } catch { /* Windows ACLs are managed by the owning user. */ }
  return key;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(password, salt, 64);
  return ["scrypt", "32768", salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, cost, saltText, hashText] = stored.split("$");
  if (algorithm !== "scrypt" || cost !== "32768" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await derive(password, Buffer.from(saltText, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}
