import type { Locator, Page } from '@playwright/test';
import type { Stay } from '../utils/dates';
import { BookingForm } from './components/booking-form';
import { ReservationCalendar } from './components/reservation-calendar';

/** A single room's page: /reservation/{roomId}?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD */
export class ReservationPage {
  readonly calendar: ReservationCalendar;
  readonly bookingForm: BookingForm;

  constructor(private readonly page: Page) {
    this.calendar = new ReservationCalendar(page);
    this.bookingForm = new BookingForm(page);
  }

  /**
   * Opens a room with a stay pre-selected: the same URL a home page "Book now" link builds.
   * The dates are required: without them the booking card shows a spinner forever.
   */
  async goto(roomId: number, stay: Stay): Promise<void> {
    await this.page.goto(
      `/reservation/${roomId}?checkin=${stay.checkin}&checkout=${stay.checkout}`,
    );
  }

  /** The page title, e.g. "Double Room". */
  roomHeading(roomType: string): Locator {
    return this.page.getByRole('heading', { level: 1, name: `${roomType} Room`, exact: true });
  }
}
