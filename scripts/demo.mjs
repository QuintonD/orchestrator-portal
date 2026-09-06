// A disposable, populated workspace. Never reuses the operator's gateway data.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'orchestrator-demo-'));
Object.assign(process.env, {
  NODE_ENV: 'production',
  ORCHESTRATOR_DEMO: '1',
  ORCHESTRATOR_HOST: '127.0.0.1',
  ORCHESTRATOR_PORT: '4425',
  ORCHESTRATOR_DATA_DIR: dataDir,
  ORCHESTRATOR_ALLOWED_ORIGINS: 'http://127.0.0.1:4425,http://localhost:4425',
});
console.log(`Demo: http://127.0.0.1:4425\nSynthetic workspace: ${dataDir}\nRestart for a fresh workspace. Ctrl+C stops it.`);
const { createApp } = await import('../apps/server/dist/server.js');
const { loadConfig } = await import('../apps/server/dist/config.js');
const config = loadConfig();
const app = await createApp(config);
await app.listen({ host: config.host, port: config.port });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close(); });
