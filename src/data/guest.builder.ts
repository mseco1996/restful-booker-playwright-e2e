import { randomBytes } from 'node:crypto';

export interface Guest {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
}

/**
 * A guest that passes the booking service's validation (firstname 3-18 chars, lastname 3-30,
 * valid email, phone 11-21 chars). The lastname is unique so a booking can be traced in the admin
 * report. The phone number is in Ofcom's reserved drama range, so it can never reach a real person.
 */
export function buildGuest(overrides: Partial<Guest> = {}): Guest {
  const tag = randomBytes(3).toString('hex');
  return {
    firstname: 'Grace',
    lastname: `Tester-${tag}`,
    email: `qa.guest+${tag}@example.com`,
    phone: '+447700900123',
    ...overrides,
  };
}
