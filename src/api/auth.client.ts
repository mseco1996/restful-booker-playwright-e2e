import { test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { env } from '../config/env';
import { ApiError, expectOk, readJson } from './http';
import { LoginResponseSchema } from './models';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Client for /api/auth.
 *
 * Contract (from the platform's Next.js API routes):
 * - POST /auth/login    { username, password } → 200 { token } | 401. The token is in the body; no cookie is set.
 * - POST /auth/validate { token }              → 200 { valid: true } | 401 / 403.
 * - POST /auth/logout is a no-op on the current platform, so it is deliberately not wrapped.
 */
export class AuthClient {
  constructor(private readonly request: APIRequestContext) {}

  async login(credentials: Credentials = env.admin): Promise<string> {
    return test.step(
      `Log in as "${credentials.username}"`,
      async () => {
        const url = `${env.apiUrl}/auth/login`;
        const response = await this.request.post(url, { data: credentials });
        if (response.status() === 401) {
          throw new ApiError(
            `Login rejected for "${credentials.username}". Check ADMIN_USERNAME / ADMIN_PASSWORD.`,
            401,
            url,
            '',
          );
        }
        const { token } = await readJson(response, LoginResponseSchema, 'Login');
        return token;
      },
      { box: true },
    );
  }

  /** Whether the auth service still knows this token. Every environment reset wipes all tokens. */
  async isValid(token: string): Promise<boolean> {
    const response = await this.request.post(`${env.apiUrl}/auth/validate`, { data: { token } });
    if (response.status() === 401 || response.status() === 403) return false;
    await expectOk(response, 'Validate token');
    return true;
  }
}

/**
 * One admin token per worker, kept alive across environment resets.
 *
 * The public demo wipes every token on its 10-minute reset, and the room proxy turns the backend's
 * resulting 403 into a generic 500, so a dead token looks exactly like a server error. `send()`
 * handles that: after a failed call it asks the auth service whether the token is still valid.
 * If not, it logs in again and retries the call once. Genuine failures are returned untouched for
 * the caller to report.
 */
export class AdminSession {
  private token: string | undefined;

  constructor(
    private readonly auth: AuthClient,
    private readonly credentials: Credentials = env.admin,
  ) {}

  async getToken(): Promise<string> {
    this.token ??= await this.auth.login(this.credentials);
    return this.token;
  }

  /** Sends an authenticated request. `call` receives the headers to attach. */
  async send(
    call: (headers: Record<string, string>) => Promise<APIResponse>,
  ): Promise<APIResponse> {
    const token = await this.getToken();
    const response = await call(tokenCookie(token));
    if (response.ok() || (await this.auth.isValid(token))) return response;

    const fresh = await test.step(
      'Admin token expired (environment reset); logging in again',
      () => this.auth.login(this.credentials),
      { box: true },
    );
    this.token = fresh;
    return call(tokenCookie(fresh));
  }
}

/** The room, booking and message services read the token from a `token` cookie, not a header. */
function tokenCookie(token: string): Record<string, string> {
  return { Cookie: `token=${token}` };
}
