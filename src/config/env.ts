/**
 * Single source of truth for test configuration.
 *
 * - Loads `.env` for local runs. In CI, GitHub Actions injects real variables and secrets
 *   (an existing env var always wins over the file).
 * - Validates everything once, at startup. A missing or malformed variable fails the whole run
 *   immediately with a readable message, instead of 40 cryptic test failures later.
 * - Exposes a typed, frozen `env` object. Tests, fixtures and clients import `env`;
 *   nothing else in the repo should read `process.env` directly.
 */
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

const TARGET_ENVS = ['public-demo', 'local'] as const;
export type TargetEnv = (typeof TARGET_ENVS)[number];

const DEFAULT_XRAY_BASE_URL = 'https://xray.cloud.getxray.app';

const httpUrl = (message: string) =>
  z.url({ protocol: /^https?$/, error: message }).transform((url) => url.replace(/\/+$/, ''));

const required = (what: string) =>
  z.string({ error: `is required (${what})` }).min(1, `is required (${what})`);

const EnvSchema = z.object({
  /** Which environment we are pointing at. Drives worker limits and env-specific skips. */
  TARGET_ENV: z
    .enum(TARGET_ENVS, { error: `must be one of: ${TARGET_ENVS.join(', ')}` })
    .default('public-demo'),

  /** Front-end URL, e.g. https://automationintesting.online or http://localhost:3003 */
  BASE_URL: httpUrl('is required and must be an http(s) URL'),

  /** Optional override. Defaults to `${BASE_URL}/api`, which is where the public demo serves it. */
  API_BASE_URL: httpUrl('must be an http(s) URL').optional(),

  ADMIN_USERNAME: required('admin user for the API and admin panel'),
  ADMIN_PASSWORD: required('admin password; use a GitHub secret in CI'),

  /** Optional worker override. Otherwise playwright.config.ts decides based on TARGET_ENV. */
  WORKERS: z.coerce
    .number({ error: 'must be a whole number' })
    .int('must be a whole number')
    .positive('must be greater than 0')
    .optional(),

  /**
   * Prefix for every entity a test creates (rooms, bookings, messages), so leftovers on a shared
   * environment are traceable to a run. Generated automatically when not set.
   */
  RUN_ID: z
    .string()
    .regex(/^[a-z0-9-]{1,24}$/i, 'letters, digits and dashes only, max 24 characters')
    .optional(),

  /** Set to "true" by GitHub Actions (and most CI systems). */
  CI: z.stringbool({ error: 'must be a boolean-like value (true/false/1/0)' }).default(false),

  /** Xray Cloud. Only the upload script needs these, so they are optional for test runs. */
  XRAY_BASE_URL: httpUrl('must be an http(s) URL').default(DEFAULT_XRAY_BASE_URL),
  XRAY_CLIENT_ID: z.string().optional(),
  XRAY_CLIENT_SECRET: z.string().optional(),
  XRAY_PROJECT_KEY: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]+$/, 'must be a Jira project key, e.g. RBP')
    .optional(),
  XRAY_TEST_PLAN_KEY: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, 'must be a Jira issue key, e.g. RBP-42')
    .optional(),
});

type EnvKey = keyof typeof EnvSchema.shape;

/** `KEY=` (blank, as copied from .env.example) means "not set", not "empty string". */
function readRawEnv(): Partial<Record<EnvKey, string>> {
  const keys = Object.keys(EnvSchema.shape) as EnvKey[];
  return Object.fromEntries(
    keys.map((key) => {
      const value = process.env[key]?.trim();
      return [key, value === '' ? undefined : value];
    }),
  );
}

function parseEnv() {
  const result = EnvSchema.safeParse(readRawEnv());
  if (!result.success) {
    // Only names and messages are printed, never values, so secrets can't leak into CI logs.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid test environment configuration:\n${problems}\n\n` +
        'Local runs: copy .env.example to .env and fill it in.\n' +
        'CI: define these as GitHub Actions variables/secrets.',
    );
  }
  return result.data;
}

/**
 * Playwright evaluates the config in the main process first, then starts worker processes that
 * inherit its environment. Writing the generated id back to process.env makes every worker
 * share one RUN_ID instead of each generating its own.
 */
function resolveRunId(explicit: string | undefined): string {
  const runId =
    explicit ??
    (process.env.GITHUB_RUN_ID
      ? `gh-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
      : `local-${Date.now().toString(36)}`);
  process.env.RUN_ID = runId;
  return runId;
}

const parsed = parseEnv();

export const env = Object.freeze({
  targetEnv: parsed.TARGET_ENV,
  isPublicDemo: parsed.TARGET_ENV === 'public-demo',
  isCI: parsed.CI,
  baseUrl: parsed.BASE_URL,
  apiUrl: parsed.API_BASE_URL ?? `${parsed.BASE_URL}/api`,
  admin: Object.freeze({
    username: parsed.ADMIN_USERNAME,
    password: parsed.ADMIN_PASSWORD,
  }),
  workers: parsed.WORKERS,
  runId: resolveRunId(parsed.RUN_ID),
  xray: Object.freeze({
    baseUrl: parsed.XRAY_BASE_URL,
    clientId: parsed.XRAY_CLIENT_ID,
    clientSecret: parsed.XRAY_CLIENT_SECRET,
    projectKey: parsed.XRAY_PROJECT_KEY,
    testPlanKey: parsed.XRAY_TEST_PLAN_KEY,
  }),
});

export type Env = typeof env;

/**
 * For the Xray upload script: returns the Xray settings with credentials guaranteed present,
 * or throws listing exactly what is missing.
 */
export function requireXrayConfig() {
  const { baseUrl, clientId, clientSecret, projectKey, testPlanKey } = env.xray;
  if (!clientId || !clientSecret || !projectKey) {
    const missing = [
      !clientId && 'XRAY_CLIENT_ID',
      !clientSecret && 'XRAY_CLIENT_SECRET',
      !projectKey && 'XRAY_PROJECT_KEY',
    ].filter(Boolean);
    throw new Error(`Xray upload is missing: ${missing.join(', ')}`);
  }
  return { baseUrl, clientId, clientSecret, projectKey, testPlanKey } as const;
}
