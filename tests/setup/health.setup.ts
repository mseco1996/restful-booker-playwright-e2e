import { env } from '../../src/config/env';
import { expect, test as setup } from '../../src/fixtures';

/**
 * Runs first. Every other project depends on it, so if the target environment is down this is the
 * single failure you see, and Playwright skips the rest instead of reporting dozens of misleading
 * product failures. Each check is retried briefly to ride out a cold start or a one-off blip.
 */
const checks = [
  { name: 'Front-end', url: env.baseUrl },
  { name: 'Room API', url: `${env.apiUrl}/room` },
  { name: 'Branding API', url: `${env.apiUrl}/branding` },
];

setup('target environment is reachable', async ({ request }) => {
  await Promise.all(
    checks.map(({ name, url }) =>
      setup.step(`${name} responds at ${url}`, async () => {
        await expect(async () => {
          // A refused or timed-out connection becomes a readable value instead of a raw stack.
          const status = await request.get(url, { timeout: 15_000 }).then(
            (response) => response.status(),
            (error: Error) => `unreachable (${error.message.split('\n')[0]})`,
          );
          expect(
            status,
            `ENVIRONMENT UNAVAILABLE: ${name} at ${url}. No tests were run against it.`,
          ).toBe(200);
        }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 5_000] });
      }),
    ),
  );
});
