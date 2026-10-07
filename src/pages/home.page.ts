import type { Locator, Page } from '@playwright/test';
import { toUkDate, type Stay } from '../utils/dates';

/**
 * The public front page: the "Check Availability & Book Your Stay" search and the room cards.
 *
 * Note: the page renders only the FIRST THREE rooms the API returns. A room created by a test is
 * never among them on a shared environment, so specs that need a specific room open it with
 * ReservationPage.goto(), which builds exactly the URL these cards' "Book now" links use.
 */
export class HomePage {
  readonly availabilityForm: Locator;
  readonly checkInInput: Locator;
  readonly checkOutInput: Locator;
  readonly checkAvailabilityButton: Locator;
  readonly bookNowLinks: Locator;

  constructor(private readonly page: Page) {
    this.checkAvailabilityButton = page.getByRole('button', {
      name: 'Check Availability',
      exact: true,
    });
    this.availabilityForm = page.locator('form').filter({ has: this.checkAvailabilityButton });

    // The date inputs have no accessible name: their <label for="checkin|checkout"> points at ids
    // the date picker never renders (an accessibility defect worth raising). Until that's fixed we
    // locate them by role and order within the search form.
    this.checkInInput = this.availabilityForm.getByRole('textbox').nth(0);
    this.checkOutInput = this.availabilityForm.getByRole('textbox').nth(1);

    // Scoped to "Our Rooms" with an exact name: the hero banner has a "Book Now" link to #booking.
    this.bookNowLinks = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Our Rooms', exact: true }) })
      .getByRole('link', { name: 'Book now', exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /**
   * Enters the stay and runs the search. Returns the query the app actually sent to the room API,
   * so specs can assert the dates survived the trip (time-zone bugs show up exactly there).
   */
  async searchAvailability(stay: Stay): Promise<URLSearchParams> {
    await this.enterDate(this.checkInInput, stay.checkin);
    await this.enterDate(this.checkOutInput, stay.checkout);

    const searchResponse = this.page.waitForResponse(
      (response) => response.url().includes('/api/room?') && response.request().method() === 'GET',
    );
    await this.checkAvailabilityButton.click();
    return new URL((await searchResponse).url()).searchParams;
  }

  private async enterDate(input: Locator, iso: string): Promise<void> {
    await input.fill(toUkDate(iso));
    // Close the date picker pop-up so it can't cover the next control on a small screen.
    await input.press('Escape');
  }
}
