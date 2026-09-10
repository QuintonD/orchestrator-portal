import path from "node:path";
import { createApp } from "../../apps/server/dist/server.js";

// Native ESM avoids Playwright's CommonJS transform of import.meta. Use an OS
// allocated port and a disposable directory, never an operator's live workspace.
const dataDir = path.resolve(process.argv[2]);
const root = path.resolve("test-results", "onboarding-workspaces");
if (!dataDir.startsWith(`${root}${path.sep}`)) throw new Error("Expected a disposable onboarding workspace");
const allowedOrigins = new Set();
const app = await createApp({ demo: false, dataDir, allowedOrigins, webDist: path.resolve("apps/web/dist"), host: "127.0.0.1", isLoopback: true });
const url = await app.listen({ host: "127.0.0.1", port: 0 });
allowedOrigins.add(url);
process.send({ url });
process.on("message", async (message) => {
  if (message === "stop") { await app.close(); process.exit(0); }
});
process.on("disconnect", async () => { await app.close(); process.exit(0); });
