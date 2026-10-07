import type { Locator, Page } from '@playwright/test';
import type { Guest } from '../../data/guest.builder';
import type { Stay } from '../../utils/dates';

/**
 * The "Book This Room" card on a room's page. It moves through three states in place:
 *   1. calendar + price summary + "Reserve Now"
 *   2. guest details form + price summary + "Reserve Now" / "Cancel"
 *   3. "Booking Confirmed" with the booked dates
 */
export class BookingForm {
  /** Advances from state 1 to 2, then submits the booking from state 2. */
  readonly reserveNowButton: Locator;
  readonly cancelButton: Locator;
  readonly firstnameInput: Locator;
  readonly lastnameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  /** Validation messages returned by the booking service. */
  readonly errors: Locator;
  /** The price breakdown block: "£150 x 3 nights", fees and "Total". */
  readonly priceSummary: Locator;
  readonly confirmationHeading: Locator;
  readonly returnHomeLink: Locator;

  constructor(private readonly page: Page) {
    // `exact: true` everywhere: Playwright matches names case-insensitively by substring by default.
    this.reserveNowButton = page.getByRole('button', { name: 'Reserve Now', exact: true });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    this.firstnameInput = page.getByLabel('Firstname', { exact: true });
    this.lastnameInput = page.getByLabel('Lastname', { exact: true });
    this.emailInput = page.getByLabel('Email', { exact: true });
    this.phoneInput = page.getByLabel('Phone', { exact: true });
    // Scoped to the guest form: Next.js adds an always-present role="alert" route announcer.
    this.errors = page.locator('form').filter({ has: this.firstnameInput }).getByRole('alert');
    this.priceSummary = page
      .getByRole('heading', { name: 'Price Summary', exact: true })
      .locator('..');
    this.confirmationHeading = page.getByRole('heading', {
      name: 'Booking Confirmed',
      exact: true,
    });
    this.returnHomeLink = page.getByRole('link', { name: 'Return home', exact: true });
  }

  /** The booked range as the confirmation shows it, e.g. "2026-10-20 - 2026-10-23". */
  confirmedDates(stay: Stay): Locator {
    return this.page.getByText(`${stay.checkin} - ${stay.checkout}`, { exact: true });
  }

  async startReservation(): Promise<void> {
    await this.reserveNowButton.click();
  }

  async fillGuestDetails(guest: Guest): Promise<void> {
    await this.firstnameInput.fill(guest.firstname);
    await this.lastnameInput.fill(guest.lastname);
    await this.emailInput.fill(guest.email);
    await this.phoneInput.fill(guest.phone);
  }

  async submit(): Promise<void> {
    await this.reserveNowButton.click();
  }

  /** The whole guest flow from state 1 to the submitted booking. */
  async book(guest: Guest): Promise<void> {
    await this.startReservation();
    await this.fillGuestDetails(guest);
    await this.submit();
  }
}
