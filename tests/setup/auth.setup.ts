import { env } from '../../src/config/env';
import { ADMIN_STORAGE_STATE } from '../../src/config/paths';
import { expect, test as setup } from '../../src/fixtures';

/**
 * 1. Proves the admin credentials work before any test needs them (fails fast on a bad secret).
 * 2. Saves a logged-in browser session for admin UI specs:
 *      test.use({ storageState: ADMIN_STORAGE_STATE })
 *
 * Login goes through the API rather than the login form because it's faster and can't flake on
 * UI timing. The login form itself is covered by its own spec in tests/e2e/admin.
 */
setup('admin can authenticate', async ({ authClient, playwright }) => {
  const token = await authClient.login();
  expect(await authClient.isValid(token), 'a freshly issued admin token should validate').toBe(
    true,
  );

  await setup.step('Save admin browser session', async () => {
    // The admin UI keeps the token in a plain `token` cookie on path "/", set by the login form.
    const { hostname, protocol } = new URL(env.baseUrl);
    const context = await playwright.request.newContext({
      storageState: {
        cookies: [
          {
            name: 'token',
            value: token,
            domain: hostname,
            path: '/',
            expires: -1,
            httpOnly: false,
            secure: protocol === 'https:',
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    await context.storageState({ path: ADMIN_STORAGE_STATE });
    await context.dispose();
  });
});
