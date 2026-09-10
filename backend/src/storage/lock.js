import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function acquireLock(filename) {
  mkdirSync(dirname(filename), { recursive: true });
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    let descriptor;
    try {
      descriptor = openSync(filename, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = JSON.parse(readFileSync(filename, 'utf8'));
      try {
        process.kill(owner.pid, 0);
      } catch (processError) {
        if (processError.code !== 'ESRCH') throw processError;
        unlinkSync(filename);
        continue;
      }
      throw new Error(
        'This saved simulation is already open (PID ' +
          owner.pid +
          '). Stop its terminal with Ctrl+C before starting another instance.',
      );
    }
    try {
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token }));
    } finally {
      closeSync(descriptor);
    }
    return () => {
      try {
        if (JSON.parse(readFileSync(filename, 'utf8')).token === token) unlinkSync(filename);
      } catch (error) {
        if (error.code !== 'ENOENT')
          console.error('Could not release simulation lock:', error.message);
      }
    };
  }
  throw new Error('Could not acquire the saved simulation lock.');
}
