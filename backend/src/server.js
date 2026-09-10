import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './api/app.js';
import { DatabaseStore } from './storage/database.js';
import { acquireLock } from './storage/lock.js';
import { parseConfig } from './config.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const config = parseConfig(process.env, root);
const dataFile = config.database;
const releaseLock = acquireLock(dataFile + '.lock');
process.on('exit', releaseLock);
const store = new DatabaseStore(dataFile, { legacyFile: config.legacyFile });
const service = createApp(store, config);
service.engine.state.running = config.autoRun;
store.save(service.engine.state);
const production = process.argv.includes('--production');
if (production) {
  const dist = path.join(root, 'frontend', 'dist');
  if (!existsSync(path.join(dist, 'index.html')))
    throw new Error('Frontend build missing. Run npm run build first.');
  service.app.use((_req, res, next) => {
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  service.app.use(express.static(dist));
  service.app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
const { host, port } = config;
const server = service.app.listen(port, host, () =>
  console.log('TradeScope ' + (production ? 'app' : 'API') + ' http://' + host + ':' + port),
);
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? 'Port ' + port + ' is occupied. Stop the other instance or set PORT.'
      : error,
  );
  process.exit(1);
});
const timer = setInterval(() => {
  try {
    service.pulse();
  } catch (error) {
    service.engine.state.running = false;
    console.error(
      JSON.stringify({ level: 'error', event: 'simulation_paused', message: error.message }),
    );
  }
}, 1000);
function stop() {
  clearInterval(timer);
  service.dispose();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => {
    server.closeAllConnections();
  }, 1000).unref();
  server.closeIdleConnections();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
