import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Logged-in admin browser session, written by tests/setup/auth.setup.ts (git-ignored).
 * Admin UI specs opt in with: test.use({ storageState: ADMIN_STORAGE_STATE })
 */
export const ADMIN_STORAGE_STATE = path.join(ROOT, 'playwright', '.auth', 'admin.json');
