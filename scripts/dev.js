import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseConfig } from '../backend/src/config.js';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const dataFile = parseConfig(process.env, root).database;
const sessionFile = dataFile + '.dev.json';
try {
  const existing = JSON.parse(readFileSync(sessionFile, 'utf8'));
  const health = await fetch(existing.apiUrl + '/api/health', {
    signal: AbortSignal.timeout(1500),
  });
  const info = await health.json();
  if (info.devSessionId === existing.id) {
    const frontend = await fetch(existing.webUrl, { signal: AbortSignal.timeout(1500) });
    if (frontend.ok) {
      console.log('TradeScope is already running: ' + existing.webUrl);
      process.exit(0);
    }
  }
} catch {
  // A stopped preview leaves metadata behind; the next launch replaces it.
}
async function freePort(start) {
  for (let port = start; port < start + 50; port++) {
    if (
      await new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
      })
    )
      return port;
  }
  throw new Error('No available local port.');
}
const apiPort = await freePort(Number(process.env.PORT || 3001));
const webPort = await freePort(Number(process.env.FRONTEND_PORT || 5173));
const viteBin = path.join(
  path.dirname(
    createRequire(new URL('../frontend/package.json', import.meta.url)).resolve(
      'vite/package.json',
    ),
  ),
  'bin/vite.js',
);
const env = {
  ...process.env,
  TRADESCOPE_DEV_SESSION: randomUUID(),
  PORT: String(apiPort),
  VITE_API_TARGET: 'http://127.0.0.1:' + apiPort,
  APP_ORIGIN: 'http://127.0.0.1:' + webPort,
};
const children = [
  spawn(process.execPath, [path.join(root, 'backend/src/server.js')], {
    cwd: root,
    env,
    stdio: 'inherit',
  }),
  spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'],
    { cwd: path.join(root, 'frontend'), env, stdio: 'inherit' },
  ),
];
mkdirSync(path.dirname(sessionFile), { recursive: true });
writeFileSync(
  sessionFile,
  JSON.stringify({
    id: env.TRADESCOPE_DEV_SESSION,
    apiUrl: 'http://127.0.0.1:' + apiPort,
    webUrl: 'http://127.0.0.1:' + webPort,
  }),
);
console.log('TradeScope: http://127.0.0.1:' + webPort);
console.log('Press Ctrl+C to stop both servers.');
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 400).unref();
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code || 0);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
