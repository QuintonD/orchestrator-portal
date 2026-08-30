import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  demo: boolean;
  isLoopback: boolean;
  allowedOrigins: Set<string>;
  trustProxy: string[];
  webDist: string;
}

const loopbackNames = new Set(["127.0.0.1", "::1", "localhost"]);

export function loadConfig(): AppConfig {
  const host = process.env.ORCHESTRATOR_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.ORCHESTRATOR_PORT ?? "4400", 10);
  const demo = process.env.ORCHESTRATOR_DEMO === "1";
  const dataDir = path.resolve(process.env.ORCHESTRATOR_DATA_DIR ?? "./data");
  const isLoopback = loopbackNames.has(host) || (isIP(host) === 4 && host.startsWith("127."));
  const defaults = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  if (process.env.NODE_ENV === "development") defaults.push("http://127.0.0.1:5173", "http://localhost:5173");
  const origins = (process.env.ORCHESTRATOR_ALLOWED_ORIGINS ?? defaults.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("ORCHESTRATOR_PORT must be a valid TCP port");
  }
  if (demo && !isLoopback) {
    throw new Error("ORCHESTRATOR_DEMO can only run on a loopback interface");
  }
  if (!isLoopback && !process.env.ORCHESTRATOR_MASTER_KEY) {
    throw new Error("ORCHESTRATOR_MASTER_KEY is required when binding beyond loopback");
  }

  return {
    host,
    port,
    dataDir,
    demo,
    isLoopback,
    allowedOrigins: new Set(origins),
    trustProxy: (process.env.ORCHESTRATOR_TRUST_PROXY ?? "loopback").split(",").map((entry) => entry.trim()).filter(Boolean),
    webDist: fileURLToPath(new URL("../../web/dist", import.meta.url)),
  };
}
