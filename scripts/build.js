import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const frontend = fileURLToPath(new URL('../frontend/', import.meta.url));
const vite = path.join(
  path.dirname(
    createRequire(new URL('../frontend/package.json', import.meta.url)).resolve(
      'vite/package.json',
    ),
  ),
  'bin/vite.js',
);
const result = spawnSync(process.execPath, [vite, 'build'], { cwd: frontend, stdio: 'inherit' });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
