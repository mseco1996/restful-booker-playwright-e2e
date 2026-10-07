import { randomBytes } from 'node:crypto';
import { env } from '../config/env';

/**
 * A name that is unique per entity and traceable to the run that created it,
 * e.g. "qa-room-gh-1234567-1-a3f9c2". Use it for anything a test creates on a shared environment.
 */
export function uniqueName(kind: string): string {
  return `qa-${kind}-${env.runId}-${randomBytes(3).toString('hex')}`;
}
