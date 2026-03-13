# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1.0] - 2026-03-12

### Added

- Added operator magic-link auth, trusted-device gating, and middleware protection for `/admin`, `/quick-add`, and the new operator APIs.
- Added a mobile-first `/quick-add` booking flow with fuzzy member search, new-member creation, Today/Tomorrow suggestions, custom times, and conflict overrides.
- Added shared operator booking and member-search services plus operator API routes for bookings, search, and logout.
- Added database support for idempotent operator request keys and an active member-slot uniqueness guard.
- Added Vitest and Playwright coverage for member search, operator booking, and the Bob Quick Add mobile workflow.
- Added `TODOS.md` to capture the deferred audit, iPhone wrapper, messaging, observability, calendar, and multi-operator follow-up work.

### Changed

- Changed the admin shell to surface Quick Add entry and operator sign-out.
- Changed the admin Add Session modal to use the shared operator booking API instead of inserting sessions directly from the client.
- Changed the app font setup to use local stacks so production builds no longer depend on Google Fonts fetches.

### Fixed

- Fixed the operator booking flow to preserve half-hour end times and reject duplicate active bookings for the same member/date/time.
- Fixed several existing lint/build blockers in shared UI components, the SMS webhook route, and public booking copy.
