import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { USERS } from '../domain/catalog.js';
export class StateStore {
  constructor(filename) {
    this.filename = filename;
  }
  load() {
    if (!existsSync(this.filename)) return null;
    const state = JSON.parse(readFileSync(this.filename, 'utf8'));
    if (state.version !== 1)
      throw new Error(
        'Unsupported saved simulation version. Back up .local/state.json before resetting.',
      );
    // Keep existing demo sessions anonymous without resetting their trading records.
    for (const user of state.users) {
      const label = USERS[Number(user.id) - 1];
      if (label) user.name = label;
    }
    state.running = false;
    return state;
  }
  save(state) {
    mkdirSync(dirname(this.filename), { recursive: true });
    writeFileSync(this.filename + '.tmp', JSON.stringify(state), 'utf8');
    renameSync(this.filename + '.tmp', this.filename);
  }
}
