import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

/**
 * Projects
 *   setup                health check + admin auth; every other project depends on it
 *   api                  API specs; no browser is launched
 *   mobile-safari        PRIMARY. iPhone 17 on WebKit, where most of our users are. PR gate runs here.
 *   mobile-safari-small  iPhone SE (3rd gen), narrowest common viewport; @mobile layout checks only
 *   desktop-chrome       secondary coverage (nightly); skips @mobile-only checks
 *
 * Tags, set with `test('...', { tag: ['@smoke'] }, ...)`:
 *   @smoke       PR gate and hotfixes (keep this set under ~5 minutes)
 *   @mobile      mobile-specific behaviour (hamburger nav, overflow, touch input)
 *   @quarantine  known-flaky; excluded from the PR gate, still runs nightly
 *
 * Xray: link a test to Jira with `annotation: { type: 'test_key', description: 'RBP-123' }`.
 */

const PRIMARY_IPHONE = 'iPhone 17';
const SMALL_IPHONE = 'iPhone SE (3rd gen)';
const E2E_DIR = './tests/e2e';
const MOBILE_ONLY = /@mobile/;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  fullyParallel: true,
  forbidOnly: env.isCI,

  // One retry in CI. A test that only passes on retry is reported as "flaky", not green,
  // and reviewed weekly. More retries would hide real problems on a shared environment.
  retries: env.isCI ? 1 : 0,

  // Be a good citizen on the shared public demo; scale freely against our own container.
  workers: env.workers ?? (env.isPublicDemo ? 2 : undefined),

  // The public demo resets itself every 10 minutes, so tests must be short.
  // A test that needs longer than this is doing too much.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reportSlowTests: { max: 5, threshold: 30_000 },

  // Shown in the HTML report header. Never put credentials here.
  metadata: {
    targetEnv: env.targetEnv,
    baseUrl: env.baseUrl,
    runId: env.runId,
  },

  reporter: [
    env.isCI ? ['github'] : ['list'],
    ['html', { open: env.isCI ? 'never' : 'on-failure', outputFolder: 'playwright-report' }],
    [
      // Playwright's built-in junit reporter dropped Xray's properties in v1.34;
      // Xray maintains this drop-in replacement.
      '@xray-app/playwright-junit-reporter',
      {
        outputFile: 'reports/xray-junit.xml',
        // test_key / requirements / test_summary annotations become <property> elements Xray reads.
        embedAnnotationsAsProperties: true,
        textContentAnnotations: ['test_description'],
        // Only tests linked to Jira (test_key) are reported. Otherwise Xray auto-creates a new
        // Test issue for every unkeyed case: setup steps, WIP tests, and every renamed test.
        ignoreTestCasesWithoutTestKey: true,
        // Attachments (traces, videos) are deliberately NOT embedded: base64 traces would bloat
        // the XML past Xray's import limits. They stay in the CI artifacts, linked from the
        // Test Execution. CI runs one project per job, so each XML maps to one Xray
        // Test Environment (iOS-Safari, Desktop-Chrome).
      },
    ],
  ],

  use: {
    baseURL: env.baseUrl,

    // Pin locale and timezone so date rendering in the browser matches the UTC dates our
    // data builders generate, on every laptop and CI runner.
    locale: 'en-GB',
    timezoneId: 'UTC',

    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    trace: env.isCI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: env.isCI ? 'on-first-retry' : 'off',
  },

  projects: [
    {
      name: 'setup',
      testDir: './tests/setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'api',
      testDir: './tests/api',
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      testDir: E2E_DIR,
      use: { ...devices[PRIMARY_IPHONE] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari-small',
      testDir: E2E_DIR,
      use: { ...devices[SMALL_IPHONE] },
      grep: MOBILE_ONLY,
      dependencies: ['setup'],
    },
    {
      name: 'desktop-chrome',
      testDir: E2E_DIR,
      use: { ...devices['Desktop Chrome'] },
      grepInvert: MOBILE_ONLY,
      dependencies: ['setup'],
    },
  ],
});
