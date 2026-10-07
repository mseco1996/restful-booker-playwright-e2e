/**
 * The project's `test` and `expect`. Every spec imports from here, never from '@playwright/test'
 * (ESLint enforces this), so data setup and cleanup can't be skipped by accident.
 *
 *   import { test, expect } from '../../src/fixtures';
 *
 *   test('a guest can book a room', async ({ page, freshRoom }) => { ... });
 */
import { test as base, expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import { AdminSession, AuthClient } from '../api/auth.client';
import type { Room, RoomPayload } from '../api/models';
import { ReportClient } from '../api/report.client';
import { RoomClient } from '../api/room.client';
import { buildRoom } from '../data/room.builder';

type WorkerFixtures = {
  /** One cookie-less API context per worker, shared by all API clients. */
  apiContext: APIRequestContext;
  authClient: AuthClient;
  /** Admin token for this worker; logs in lazily and again after an environment reset. */
  adminSession: AdminSession;
  roomClient: RoomClient;
  reportClient: ReportClient;
};

type TestFixtures = {
  /** Option to customise freshRoom: test.use({ roomOverrides: { type: 'Suite' } }) */
  roomOverrides: Partial<RoomPayload>;
  /** A room created through the API for this test only, and deleted after it. */
  freshRoom: Room;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  apiContext: [
    async ({ playwright }, use) => {
      const context = await playwright.request.newContext({
        extraHTTPHeaders: { Accept: 'application/json' },
      });
      await use(context);
      await context.dispose();
    },
    { scope: 'worker' },
  ],

  authClient: [
    async ({ apiContext }, use) => {
      await use(new AuthClient(apiContext));
    },
    { scope: 'worker' },
  ],

  adminSession: [
    async ({ authClient }, use) => {
      await use(new AdminSession(authClient));
    },
    { scope: 'worker' },
  ],

  roomClient: [
    async ({ apiContext, adminSession }, use) => {
      await use(new RoomClient(apiContext, adminSession));
    },
    { scope: 'worker' },
  ],

  reportClient: [
    async ({ apiContext }, use) => {
      await use(new ReportClient(apiContext));
    },
    { scope: 'worker' },
  ],

  roomOverrides: [{}, { option: true }],

  freshRoom: async ({ roomClient, roomOverrides }, use, testInfo) => {
    const room = await roomClient.create(buildRoom(roomOverrides));
    await testInfo.attach('fresh-room.json', {
      body: JSON.stringify(room, null, 2),
      contentType: 'application/json',
    });

    await use(room);

    await removeRoom(roomClient, room, testInfo);
  },
});

export { expect };

/**
 * Teardown never fails a test: a leftover room is harmless on the public demo (the next reset
 * sweeps it), and a red result caused by cleanup would hide the test's real outcome.
 */
async function removeRoom(roomClient: RoomClient, room: Room, testInfo: TestInfo): Promise<void> {
  const testFailed = testInfo.status !== testInfo.expectedStatus;
  try {
    const outcome = await roomClient.deleteIfPresent(room.roomid);
    if (outcome === 'already-gone' && testFailed) {
      // The room vanished while the test ran, so the failure is likely environmental.
      testInfo.annotations.push({
        type: 'env-reset',
        description:
          `Room #${room.roomid} "${room.roomName}" disappeared during the test. The shared ` +
          'environment probably reset mid-test; re-run before raising a bug.',
      });
    }
  } catch (error) {
    testInfo.annotations.push({
      type: 'cleanup-warning',
      description: `Could not delete room #${room.roomid} "${room.roomName}": ${String(error)}`,
    });
  }
}
