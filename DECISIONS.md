# Test Automation Decisions

|                  |                                                                 |
| ---------------- | --------------------------------------------------------------- |
| **Repository**   | `rbp-e2e`: API and end-to-end tests for Restful Booker Platform |
| **Author**       | Manuel Francisco Seco, QA Lead                                            |
| **Audience**     | Engineering team (9 developers, 1 QA engineer)                  |
| **Last updated** | 7 October 2026                                                  |

This document records the decisions behind our test suite and the reasons for each, so that anyone can extend the suite without having to rediscover them. If you want to change one of these decisions, open a PR that updates this file together with the code.

## Summary

- **Playwright + TypeScript.** iPhone 17 on WebKit is the primary target; desktop Chrome is secondary.
- **Most coverage lives at the API layer.** UI tests cover only what needs a real browser.
- **Every test creates its own data through the API and removes it afterwards.** Nothing depends on seed data or on other tests.
- **The suite is built to survive the public demo's 10-minute reset**, with a health gate, a self-healing admin session and reset-aware cleanup.
- **Building the suite surfaced nine defects and observations** (section 4). Two are high severity and hit guests in the middle of booking.

## Context

| Constraint  | Detail                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Team        | 9 developers and 1 junior QA engineer, so the framework must be easy to read and hard to misuse                 |
| Cadence     | Bi-weekly sprints, occasional hotfixes, daily scheduled runs                                                    |
| Users       | Mostly on iPhone                                                                                                |
| Reporting   | Jira with Xray Cloud; CI on GitHub Actions                                                                      |
| Environment | Public demo at automationintesting.online: shared with anyone, data can change at any time, resets every 10 min |

---

## 1. Architecture & Tooling

### 1.1 Playwright over Cypress

The choice came down to two needs: testing what iPhone users actually run, and managing test data through the API. Playwright covers both natively.

| Need                             | Playwright                                                                                                                                                          | Cypress                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Run Safari's engine              | WebKit is a fully supported browser                                                                                                                                 | WebKit support is still an experimental flag                                                            |
| Emulate an iPhone                | One device descriptor sets viewport, pixel ratio, iOS user agent, touch and mobile layout                                                                           | `cy.viewport()` changes the screen size only                                                            |
| Create and clean up data via API | `APIRequestContext` works inside fixtures, so setup and teardown live in one place. Teardown runs even when the test fails, and a session can be shared per worker. | Possible with `cy.request` in hooks, but setup and cleanup are split across hooks and repeated per spec |
| Parallel runs                    | Built in (workers and sharding), at no cost                                                                                                                         | Parallelizing across machines requires recording to Cypress Cloud                                       |
| Several devices in one run       | One config defines iPhone, small iPhone and desktop projects                                                                                                        | One browser per run                                                                                     |
| Debugging CI failures            | Trace Viewer shows the DOM, network and console at every step                                                                                                       | Screenshots and video; step-by-step replay is a Cypress Cloud feature                                   |

**Trade-offs we accept:**

- Cypress's interactive runner is friendlier to newcomers. Playwright's UI mode (`npm run test:ui`) and the recorder (`npm run codegen:mobile`) close most of that gap.
- Emulation is not a real iPhone. Section 3.5 covers how we handle that.

### 1.2 Repository layout

```
├── playwright.config.ts      projects, reporters, retries, timeouts
├── src/
│   ├── config/               env.ts (validated, typed settings), paths.ts
│   ├── api/                  typed API clients: auth, room, report; shared error handling
│   ├── data/                 builders for valid rooms and guests
│   ├── fixtures/             the project's `test` and `expect`, including freshRoom
│   ├── pages/                page objects and components (home, reservation, calendar, booking form)
│   └── utils/                dates, unique names
└── tests/
    ├── setup/                health check and admin login; runs before everything else
    ├── api/                  API specs (next to be written)
    └── e2e/guest/            UI journeys; the same spec runs on every device project
```

There is no `mobile/` folder. The device is a project setting, not a test category, so one spec covers iPhone and desktop.

### 1.3 Tooling decisions

| Decision                                                     | Why                                                                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript in strict mode                                    | Mistakes in test code surface in the editor, not in a nightly run                                                                                                           |
| TypeScript pinned to 6.0.x                                   | The ESLint TypeScript plugin does not support TypeScript 7 yet. Revisit when it does.                                                                                       |
| Settings validated with zod (`src/config/env.ts`)            | A missing or malformed variable fails the run immediately and lists every problem. Values are never printed. Nothing else reads `process.env`.                              |
| ESLint guardrails                                            | Errors on a missing `await`, fixed waits (`waitForTimeout`), `networkidle`, and specs importing from `@playwright/test` instead of `src/fixtures`, which would skip cleanup |
| Xray reporting via `@xray-app/playwright-junit-reporter`     | Playwright's built-in JUnit reporter dropped Xray support in v1.34; Xray maintains this replacement                                                                         |
| Only tests with a `test_key` annotation are reported to Xray | Otherwise Xray creates a new Test issue for every unkeyed result: setup steps, unfinished tests, and every renamed test                                                     |
| Traces and videos are not embedded in the Xray report        | They would push the report past Xray's import limits. They stay in the CI artifacts, linked from the Test Execution.                                                        |
| Browser pinned to UTC and en-GB                              | Dates render identically on every laptop and CI runner. Trade-off: this hides time-zone bugs, so a dedicated time-zone test is planned (section 5).                         |

### 1.4 Projects and run cadence

| Project               | Device                      | Contents                                         |
| --------------------- | --------------------------- | ------------------------------------------------ |
| `health`              | none                        | Is the environment up? If not, nothing else runs |
| `setup`               | none                        | Admin login check; saves the admin session       |
| `api`                 | none                        | API specs                                        |
| `mobile-safari`       | iPhone 17, WebKit           | **Primary.** All UI journeys                     |
| `mobile-safari-small` | iPhone SE (3rd gen), WebKit | `@mobile` layout checks only                     |
| `desktop-chrome`      | Desktop Chrome              | All UI journeys except `@mobile` checks          |

| Trigger       | Command                               | Scope                                                 |
| ------------- | ------------------------------------- | ----------------------------------------------------- |
| Every PR      | `npm run test:smoke`                  | `@smoke` on `api` and `mobile-safari`; target < 5 min |
| Nightly       | `npm run test:regression`             | Everything except `@quarantine`, all projects         |
| Hotfix        | `npm run test:smoke` + affected specs | Same gate as a PR                                     |
| End of sprint | Full regression + real-device check   | Release sign-off                                      |

The npm scripts exist today. The GitHub Actions workflow that runs them is the first item in section 5.

---

## 2. Test Strategy & Flakiness Mitigation

### 2.1 What the environment does to tests

- **Anyone can create, change or delete data at any moment.** The live room list already contains other people's test rooms.
- **Every 10 minutes the platform resets its databases.** That wipes rooms, bookings and every login token.
- **The API reports some errors misleadingly** (see BUG-07 and BUG-08):
  - Creating a room returns `{ success: true }` without the new room's id.
  - A missing room returns HTTP 500 instead of 404.
  - An expired token on a write request also returns HTTP 500.

A suite that ignores these facts produces red runs that say nothing about the product. Every decision below exists so that a red result means a real problem.

### 2.2 Decisions

**API-first, never UI setup.**

- Most coverage sits at the API layer, where tests are fast and deterministic.
- UI tests cover only what needs a browser.
- All test data is created and removed through the API. Setting data up through the UI is slow, is the biggest source of flakiness, and makes tests fail for reasons unrelated to what they verify.

**Each test owns its data.**

- The `freshRoom` fixture creates a room through the API before the test and deletes it afterwards.
- Every entity gets a unique name tied to the run (`qa-room-<runId>-<random>`), so leftovers are traceable. All workers share one run ID.
- Tests never rely on seed data such as room 101, and they assert only on entities they created.
- A room per test also removes booking clashes with other users: nobody else knows the room exists.
- Room-list parsing is deliberately lenient, so a malformed room created by someone else cannot break our lookups.

**Survive the reset.**

| Mechanism                  | Behaviour                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health gate                | The `health` project runs first and retries for up to 30 s. If the environment is down, you get a single "ENVIRONMENT UNAVAILABLE" failure and everything else is skipped.  |
| Credential check           | `setup` logs in once, so a wrong secret fails fast with "Login rejected"                                                                                                    |
| Self-healing admin session | After any failed write, the session asks the auth service whether its token is still valid. If not, it logs in again and retries once. Genuine failures are reported as-is. |
| Reset-aware cleanup        | A room that is already gone counts as cleaned up. Cleanup never fails a test.                                                                                               |
| Triage annotations         | `env-reset`: the test's data vanished mid-test, so re-run before raising a bug. `cleanup-warning`: a room could not be deleted.                                             |
| Short tests                | 60 s timeout, and data is created right before it is used                                                                                                                   |

**No fixed waits.**

- Tests use web-first assertions and `expect.poll` only.
- ESLint rejects `waitForTimeout` and `networkidle`.

**Retries are visible, not hidden.**

- CI allows one retry. A test that passes only on retry is reported as flaky, not green, and records a trace and video.
- A test that is flaky more than twice in a week gets the `@quarantine` tag and a Jira bug.
- Quarantined tests leave the PR gate but still run nightly.

**Be a good citizen on a shared system.**

- At most 2 workers run against the public demo.
- No test changes global settings there, such as branding.

**Log in through the API.**

- `setup` saves a logged-in browser session for admin UI tests.
- The login form gets its own dedicated spec instead of being exercised in every test.

### 2.3 Verified behaviour

The fixtures were exercised against a stand-in API that reproduces the platform's behaviour as read from its source code.

| Scenario                                 | Result                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| Normal run                               | Rooms created, used and deleted                                |
| Environment reset during a test          | Session logged in again and the test passed                    |
| Delete fails while the room still exists | `cleanup-warning` added; the test still passed                 |
| Room wiped while a failing test ran      | `env-reset` added to the failure                               |
| Wrong admin password                     | One "Login rejected" failure; every other test skipped         |
| Environment down                         | One "ENVIRONMENT UNAVAILABLE" failure after 30 s; rest skipped |

### 2.4 Known limitations

- **The saved admin browser session dies at the next reset.** The admin UI fixture must re-validate it and log in again; this gets built with the admin specs.
- **Bookings made by tests outlive their room**, because the platform does not delete them with it (BUG-09). The reset sweeps them on the demo; booking cleanup is planned (section 5).
- **The public demo is not ours.** Trustworthy daily regression needs our own environment (section 5).

---

## 3. Test Design

### 3.1 The guest booking journey is split into two tests

**Context.** The home page renders only the first three rooms the API returns (`rooms.slice(0, 3)` in `Availability.tsx`). A room created by a test is never among them, so the obvious design (search on the home page, then click our room) cannot work.

**Decision.** The journey is split at the handoff between the two pages:

1. **"a guest can book a room and sees the confirmation"** uses `freshRoom`. It opens `/reservation/{id}?checkin=…&checkout=…`, the exact URL a "Book now" button builds, and then checks:
   - the room heading and the selected stay on the calendar
   - the price summary (nights × price + £40 fees)
   - entering guest details and seeing the confirmation with the booked dates
   - that the booking was stored server-side
2. **"the availability search carries the chosen dates to the room page"** runs the home page search. It checks the dates in the request sent to the room API and in the "Book now" links, then follows a link to the room page. It is **read-only** (no booking is made), so it is safe to run against the shared seed rooms.

Together they cover the whole journey, and each fails for exactly one reason.

**Rejected alternative:** booking a seed room straight from the home page. The test would clash with other users' bookings, and it would leave behind data we cannot attribute or clean up.

### 3.2 Persistence is checked through the API

The confirmation is rendered client-side and appears on any successful response, so the test also confirms the server stored the booking. The ideal check would be the booked dates appearing as "Unavailable" on the calendar, but BUG-01 currently makes that impossible. The test therefore checks the room report API, whose schema accepts both the current and the fixed response shape, so the fix will not break the test.

### 3.3 Locator policy

We cannot add `data-testid` attributes to a public demo, so locators follow what the browser's accessibility tree exposes:

1. **Use accessible locators first:** `getByRole`, `getByLabel`, `getByText`, `getByTitle`.
2. **Always pass `exact: true`.** Playwright's default name matching is case-insensitive and partial. During development it matched the hero banner's "Book Now" link instead of a room's "Book now".
3. **Scope by visible structure when names repeat.**
   - Room links are scoped to the "Our Rooms" section.
   - The booking error alert is scoped to the guest form, because Next.js keeps an always-present `role="alert"` element on every page.
4. **Document every exception in the page object:**
   - The home page date inputs are located by role and order, because they have no accessible name (BUG-03).
   - The calendar's month label uses the calendar library's CSS class, because it has no role.

On a product we own, the answer to a missing accessible name is to fix the accessibility, which also fixes the locator.

### 3.4 Page objects

- **Structure.** `HomePage` and `ReservationPage` are page objects; `ReservationPage` contains the `ReservationCalendar` and `BookingForm` components.
- **Responsibilities.** Page objects hold locators and user-level actions such as `book(guest)`. Specs hold the assertions, so a spec reads as the business rule it verifies.
  - The one exception is calendar month navigation. It waits on the month label between clicks, which is synchronisation, not verification.
- **Calendar.** The stay reaches the calendar through the URL, as it does for real users. Specs never drag across calendar cells, because emulated touch dragging is fragile and adds nothing.

### 3.5 Mobile

- **Primary project: iPhone 17 on WebKit**, with touch and an iOS user agent. The iPhone SE (3rd gen) project catches layout problems at the narrowest common width.
- **Specs are device-agnostic.** Device differences belong in page objects, for example the mobile menu.
- **Emulation is not a real iPhone.** Playwright's WebKit is close to Safari, but it has no native iOS date pickers, Safari toolbars or on-screen keyboard. Each sprint, the junior QA engineer runs the P0 journeys on a real iPhone. It is a short, well-defined area of ownership.

### 3.6 Validation status at the time of writing

- [x] Type-check, lint and formatting are clean (`npm run check`).
- [x] Fixtures, API clients and setup were verified against the stand-in API (section 2.3).
- [x] The booking spec passed in two setups:
  - 3 times on iPhone 17 emulation and on desktop, then again with 2 parallel workers. All test rooms were cleaned up.
  - The front end was the platform's own, built from its current source, with stubbed backend services.
  - The browser was Chromium, because WebKit could not be downloaded in that environment.
- [x] First WebKit run against the public demo: `npx playwright test --project=mobile-safari`.
- [x] Xray `test_key` annotations added once the Test issues exist in Jira.

---

## 4. Bugs & Defects Discovered

None of these has been filed in Jira yet. The **Verified on** column states how far each one has been confirmed:

- **Live**: confirmed on the public demo.
- **Local build**: reproduced with the platform's own front end, built from its current source.
- **Source**: found by reading the code.

| ID     | Title                                                     | Severity | Verified on                         |
| ------ | --------------------------------------------------------- | -------- | ----------------------------------- |
| BUG-01 | Guest calendar never shows booked dates                   | High     | Live (API response) + local build   |
| BUG-02 | Booking dates that are already taken crashes the page     | High     | Local build. Confirm on live        |
| BUG-03 | Home page date inputs have no accessible name             | Medium   | Local build (accessibility tree)    |
| BUG-04 | Mobile menu button has no accessible name                 | Medium   | Local build (accessibility tree)    |
| BUG-05 | Room page opened without dates never shows a booking form | Medium   | Local build                         |
| BUG-06 | Home page lists only the first three rooms                | Medium   | Source                              |
| BUG-07 | API returns HTTP 500 for a missing room or expired token  | Low      | Live (missing room); source (token) |
| BUG-08 | Room creation response omits the new room's id            | Low      | Source                              |
| BUG-09 | Deleting a room leaves its bookings behind                | Low      | Source                              |

### BUG-01: Guest calendar never shows booked dates (High)

- **Steps:** Book a room for some dates. Open that room's page and look at the calendar for those dates.
- **Expected:** The booked dates show as "Unavailable".
- **Actual:** No booked dates are ever shown, for any room.
- **Cause:** `GET /api/report/room/{id}` returns `{ "report": [...] }` (confirmed on the live demo, 7 October 2026). `BookingForm.tsx` passes the response straight to the calendar, which expects a plain list.
  - In a local build of the current source, a rewrite in `next.config.js` sends `/api/report/...` straight to the report service. That bypasses the route handler (`app/api/report/room/[roomid]/route.ts`), which would have unwrapped the list.
- **Impact:** Guests cannot see availability, which leads them straight into BUG-02.
- **Suggested fix:** Unwrap the list in the client (`data.report ?? data`), or remove the conflicting rewrites. Then add a regression test on `calendar.unavailableDates`.

### BUG-02: Booking dates that are already taken crashes the page (High)

- **Steps:** Book room 2 for three nights. In a new session, open room 2 with the same dates, select "Reserve Now", enter valid details and select "Reserve Now" again.
- **Expected:** A message explaining the dates are no longer available.
- **Actual:** The page is replaced by "This page couldn't load". The console shows `TypeError: Cannot read properties of undefined (reading 'length')`.
- **Cause:**
  1. The booking service answers a date clash with HTTP 409 and an empty body.
  2. The `/api/booking` handler then returns `{ error: "Failed to create booking" }`.
  3. The form reads `errorData.errors`, which is undefined, and crashes when it renders the error list.
- **Impact:** Combined with BUG-01, any guest who picks taken dates loses the page with no explanation.
- **Verification:** Reproduced with the platform's front end built from current source, against a stub that returns the booking service's 409 exactly as its Spring code does. **Confirm on the live demo before filing** (about two minutes, manual).
- **Suggested fix:** Return a clear message on 409, and guard the client: `errorData.errors ?? [errorData.error]`.

### BUG-03: Home page date inputs have no accessible name (Medium, accessibility)

- **Actual:** The "Check In" and "Check Out" labels use `for="checkin"` and `for="checkout"`, but the date picker renders its inputs without those ids. Screen readers, including VoiceOver on the iPhone most of our users carry, announce a bare "text field".
- **Standard:** WCAG 2.2, success criteria 1.3.1 (Info and Relationships) and 4.1.2 (Name, Role, Value), both Level A.
- **Suggested fix:** Pass `id="checkin"` and `id="checkout"` to the `DatePicker` components.

### BUG-04: Mobile menu button has no accessible name (Medium, accessibility)

- **Actual:** At phone width, the navigation toggle is announced as just "button".
- **Standard:** WCAG 2.2, success criterion 4.1.2 (Level A).
- **Suggested fix:** `aria-label="Toggle navigation"`.

### BUG-05: Room page opened without dates never shows a booking form (Medium)

- **Steps:** Open `/reservation/2` without `checkin`/`checkout` in the URL, for example from a shared or bookmarked link.
- **Actual:** The booking card shows a loading spinner indefinitely. There is no calendar and no "Reserve Now" button, so the guest cannot book.
- **Suggested fix:** Render the calendar with no pre-selection when the dates are missing.

### Other findings

- **BUG-06: Only the first three rooms are listed.** Any further room cannot be found or booked from the home page. This may be intentional; it needs a product decision.
- **BUG-07: Misleading HTTP 500 errors.**
  - A missing room returns HTTP 500 (confirmed live). A 404 would let clients tell "not found" from "server error".
  - An expired token on a write request also comes back as 500 (source).
- **BUG-08: Room creation does not return the room.** `POST /api/room` returns `{ success: true }` without the created room, so clients must search the list to find its id.
- **BUG-09: Orphaned bookings.** Deleting a room does not delete its bookings, which is a data integrity issue.

---

## 5. Future Improvements

### Now: next sprint

1. **GitHub Actions pipeline**
   - A PR gate running smoke tests on `api` and `mobile-safari`.
   - A nightly matrix with one job per project, so each upload maps to one Xray Test Environment (iOS-Safari, Desktop-Chrome).
   - A hotfix workflow.
   - HTML reports and traces kept as artifacts.
   - An upload script that imports results into a Test Execution linked to the sprint's Test Plan.
   - Secrets: `ADMIN_PASSWORD`, `XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET`.
2. **Booking client and cleanup**
   - Delete test bookings in the `freshRoom` teardown.
   - Add a known-bug test for BUG-01, marked with `test.fail()`. It will start "unexpectedly passing" the day the bug is fixed, which tells us to flip it into a normal test.
3. **Our own environment**
   - Run the regression suite against a container built from the platform's `docker-compose.yml`, with deterministic data, no reset and more workers.
   - Keep the public demo as a nightly synthetic smoke check. Same tests; only `BASE_URL` changes.
4. **Remaining P0 coverage**
   - Contact form message arriving in the admin inbox.
   - Admin login through the UI.
   - An admin session fixture that refreshes its token after a reset.

### Next

5. **Automated accessibility scans** with `@axe-core/playwright` on the home, room and admin pages. These would have caught BUG-03 and BUG-04 automatically.
6. **Real-device coverage.** Start with the junior QA engineer's per-sprint iPhone checklist for P0 journeys. Move to a device cloud if the checklist starts finding WebKit-vs-iOS differences.
7. **Time-zone test.** The search sends dates converted to UTC (`toISOString()`), while the "Book now" links use local dates. Users in time zones ahead of UTC may see an off-by-one date. This comes from reading the code and has not been confirmed. A test with the browser set to, say, `Pacific/Auckland` will settle it.

### Later

8. **Visual regression**, only against our own environment with fixed seed data, since the public demo's content changes constantly.
   - Mask dynamic areas.
   - Generate WebKit baselines inside the CI container, so local machines and CI render identically.
9. **Flakiness tracking.** Track each test's pass-on-retry rate over time, and automate quarantine with a Jira ticket.

---

## Open questions for the team

1. Is showing only three rooms on the home page intended (BUG-06)? If not, the guest journey can become a single test again.
2. Can we have a dedicated environment (3 above) before the pipeline goes live? Daily runs against a shared public demo will produce noise we can explain but cannot remove.
3. Who owns triaging tests tagged `@quarantine`? I propose a weekly rotation between QA and the developer whose area the test covers.

## References

- Cypress: [experimental WebKit support](https://docs.cypress.io/app/references/experiments) and [parallelization requires recording to Cypress Cloud](https://docs.cypress.io/cloud/features/smart-orchestration/parallelization)
- [Xray's Playwright JUnit reporter](https://github.com/Xray-App/playwright-junit-reporter), the replacement for the Xray support removed from Playwright's built-in reporter in v1.34
- [Restful Booker Platform source](https://github.com/mwinteringham/restful-booker-platform), the basis for the cause analysis above
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
