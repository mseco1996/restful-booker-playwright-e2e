import { buildGuest } from '../../../src/data/guest.builder';
import { expect, test } from '../../../src/fixtures';
import { HomePage } from '../../../src/pages/home.page';
import { ReservationPage } from '../../../src/pages/reservation.page';
import { futureStay } from '../../../src/utils/dates';

/**
 * The revenue path, run on iPhone 17 (mobile-safari) in the PR gate and on desktop nightly.
 *
 * Why two tests: the home page only lists the first three rooms, so a room created for this test
 * never appears there. Test 1 books OUR room, entering at the exact URL "Book now" builds.
 * Test 2 proves the home page builds that URL correctly. It is read-only, so it is safe to run
 * against the shared rooms on the public demo.
 *
 * Xray: add `annotation: { type: 'test_key', description: 'RBP-…' }` to each test once its Test
 * issue exists in Jira. Tests without a key are not reported to Xray.
 */
test.describe('Guest booking', () => {
  test(
    'a guest can book a room and sees the confirmation',
    { tag: ['@smoke'] },
    async ({ page, freshRoom, reportClient }) => {
      const stay = futureStay({ startInDays: 7, nights: 3 });
      const guest = buildGuest();
      const reservation = new ReservationPage(page);
      const { calendar, bookingForm } = reservation;

      await test.step('Open the room with the stay pre-selected', async () => {
        await reservation.goto(freshRoom.roomid, stay);
        await expect(reservation.roomHeading(freshRoom.type)).toBeVisible();
      });

      await test.step('Calendar and price summary reflect the stay', async () => {
        await calendar.showMonthOf(stay.checkin);
        await expect(calendar.selectedStay).toBeVisible();
        await expect(bookingForm.priceSummary).toContainText(
          `£${freshRoom.roomPrice} x ${stay.nights} nights`,
        );
        // Total = nights x price + £25 cleaning + £15 service.
        await expect(bookingForm.priceSummary).toContainText(
          new RegExp(`Total\\s*£${freshRoom.roomPrice * stay.nights + 40}`),
        );
      });

      await test.step('Enter guest details and reserve', async () => {
        await bookingForm.book(guest);
      });

      await test.step('Confirmation shows the booked dates', async () => {
        // If the booking is rejected, the form stays and lists the reasons; see the screenshot.
        await expect(bookingForm.confirmationHeading).toBeVisible();
        await expect(bookingForm.confirmedDates(stay)).toBeVisible();
      });

      await test.step('The booking is stored against the room', async () => {
        // The confirmation is rendered client-side, so check the server really kept the booking.
        // Checked via the API because the guest calendar can't display booked dates (known bug,
        // see ReportClient).
        await expect
          .poll(() => reportClient.roomBookings(freshRoom.roomid), {
            message: 'the booked range should appear in the room report',
          })
          .toContainEqual(expect.objectContaining({ start: stay.checkin, end: stay.checkout }));
      });
    },
  );

  test(
    'the availability search carries the chosen dates to the room page',
    { tag: ['@smoke'] },
    async ({ page }) => {
      // Far enough ahead that the shared rooms are very unlikely to be booked by other users.
      const stay = futureStay({ startInDays: 200, nights: 2 });
      const home = new HomePage(page);
      const reservation = new ReservationPage(page);

      await home.goto();
      const searchQuery = await home.searchAvailability(stay);

      expect(searchQuery.get('checkin'), 'check-in date sent to the room API').toBe(stay.checkin);
      expect(searchQuery.get('checkout'), 'check-out date sent to the room API').toBe(
        stay.checkout,
      );

      const firstRoom = home.bookNowLinks.first();
      await expect(firstRoom).toHaveAttribute(
        'href',
        new RegExp(`\\?checkin=${stay.checkin}&checkout=${stay.checkout}$`),
      );

      await firstRoom.click();
      await expect(page).toHaveURL(/\/reservation\/\d+\?checkin=/);
      await expect(reservation.bookingForm.priceSummary).toContainText(`x ${stay.nights} nights`);
    },
  );
});
