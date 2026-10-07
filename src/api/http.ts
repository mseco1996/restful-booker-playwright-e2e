import type { APIResponse } from '@playwright/test';
import { z } from 'zod';

const MAX_BODY_IN_ERROR = 500;

/** Thrown for any unexpected API response. The message carries everything needed to triage. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function bodyPreview(response: APIResponse): Promise<string> {
  try {
    const text = await response.text();
    return text.length > MAX_BODY_IN_ERROR ? `${text.slice(0, MAX_BODY_IN_ERROR)}…` : text;
  } catch {
    return '<unreadable body>';
  }
}

/** Throws an ApiError describing the response. Use when a non-OK response is final. */
export async function failWith(response: APIResponse, action: string): Promise<never> {
  const body = await bodyPreview(response);
  throw new ApiError(
    `${action} failed: HTTP ${response.status()} ${response.statusText()} from ${response.url()}\n${body}`,
    response.status(),
    response.url(),
    body,
  );
}

export async function expectOk(response: APIResponse, action: string): Promise<void> {
  if (!response.ok()) await failWith(response, action);
}

/**
 * Asserts the response is OK and its JSON matches `schema`, returning the parsed, typed data.
 * A schema mismatch means the API contract changed, which is reported as such.
 */
export async function readJson<S extends z.ZodType>(
  response: APIResponse,
  schema: S,
  action: string,
): Promise<z.output<S>> {
  await expectOk(response, action);
  const result = schema.safeParse(await response.json());
  if (!result.success) {
    // Field paths and messages only: never echo the body, which may contain a token.
    throw new ApiError(
      `${action}: response from ${response.url()} does not match the expected contract\n${z.prettifyError(result.error)}`,
      response.status(),
      response.url(),
      '',
    );
  }
  return result.data;
}
