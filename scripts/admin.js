import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseStore } from '../backend/src/storage/database.js';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const email = process.argv[process.argv.indexOf('--email') + 1]?.trim().toLowerCase();
if (!process.argv.includes('--email') || !email || !email.includes('@')) {
  console.error(
    'Register an account first, then run: npm run admin -- --email account@example.com',
  );
  process.exit(1);
}
const store = new DatabaseStore(
  process.env.INVESTOGRAM_DATABASE || path.join(root, '.local/investogram.sqlite'),
);
try {
  const identity = store.byEmail(email);
  if (!identity || identity.is_demo)
    throw new Error('No registered account with that email. Register in the app first.');
  store.transaction(() => {
    store.promote(identity.id);
    store.audit(identity.id, 'admin_granted_by_local_cli');
  });
  console.log('Administrator access granted. Reload the app to show administration controls.');
} finally {
  store.close();
}
