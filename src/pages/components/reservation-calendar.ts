import { expect, type Locator, type Page } from '@playwright/test';
import { monthLabel, monthsBetween, todayIso } from '../../utils/dates';

/**
 * The availability calendar on a room's page (a react-big-calendar month view).
 *
 * The stay chosen on the home page arrives in the URL and shows as an event titled "Selected";
 * existing bookings are meant to show as "Unavailable". Guests can also drag across days to pick
 * a stay, but the URL route is the journey real users take, so specs don't need to drag.
 */
export class ReservationCalendar {
  readonly monthView: Locator;
  readonly nextMonthButton: Locator;
  /** The toolbar's "October 2026" label. It has no role, so this uses the library's class. */
  readonly monthLabel: Locator;
  /** The guest's chosen stay. A stay that spans two weeks renders as two segments. */
  readonly selectedStay: Locator;
  /**
   * Dates already booked for this room. Currently never rendered (known bug: the room report API
   * returns { report: [...] } but the calendar expects an array). Kept for the regression test
   * that should start passing once that's fixed.
   */
  readonly unavailableDates: Locator;

  constructor(page: Page) {
    this.monthView = page.getByRole('table', { name: 'Month View', exact: true });
    this.nextMonthButton = page.getByRole('button', { name: 'Next', exact: true });
    this.monthLabel = page.locator('.rbc-toolbar-label');
    this.selectedStay = this.monthView.getByTitle('Selected', { exact: true }).first();
    this.unavailableDates = this.monthView.getByTitle('Unavailable', { exact: true }).first();
  }

  /** Moves forward from the current month (the calendar always opens on today) to the month of `iso`. */
  async showMonthOf(iso: string): Promise<void> {
    const today = todayIso();
    await expect(this.monthLabel).toHaveText(monthLabel(today));
    for (let step = 1; step <= monthsBetween(today, iso); step++) {
      await this.nextMonthButton.click();
      await expect(this.monthLabel).toHaveText(monthLabel(today, step));
    }
  }
}
