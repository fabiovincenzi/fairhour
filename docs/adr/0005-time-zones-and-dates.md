# ADR-0005: Time zones and dates: UTC instants, local dates in the user's zone, Temporal via `temporal-polyfill`

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** @fabiovincenzi (lead maintainer)
- **Backlog:** CORE-003, CORE-009
- **Supersedes:** none

## Context

Fairhour records time entries and turns them into reports and invoices. Two kinds of time are
involved and must not be confused:

- **Instants**: when a timer started and stopped. They are absolute points on the timeline and must
  survive any change of the user's or the server's time zone.
- **Local dates**: "Monday 2 March", "March 2026", an invoice period from the 1st to the 31st, an
  ISO week. They only exist relative to a time zone, and that zone is the user's, not the server's.

Constraints and facts:

- Users work across time zones and through daylight-saving transitions. A local day can last 23,
  24 or 25 hours, some zones shift by 30 minutes (`Australia/Lord_Howe`), and a naive
  "add 24 hours" or "local midnight = UTC midnight + offset" produces entries on the wrong day
  twice a year. CORE-003 requires DST tests for `Europe/Rome`, `America/New_York` and
  `Australia/Lord_Howe`.
- The same domain code (`@fairhour/core`) runs on the server (Node 22 and 24), in browsers and in
  the Tauri desktop webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), and must
  give identical results everywhere.
- JavaScript's `Date` has no notion of a calendar date or of an arbitrary IANA zone: it is an
  instant with ambiguous local-time accessors in the _host's_ zone. `Intl.DateTimeFormat` can
  render an instant in any IANA zone but cannot do arithmetic on local dates.
- `Temporal`, the TC39 date/time API, models exactly these concepts (`Instant`,
  `ZonedDateTime`, `PlainDate`, IANA zones, DST-aware arithmetic), but it is not available
  natively in every runtime we support: Node 22.22 (our toolchain) has no global `Temporal`
  (verified on 2026-10-09), and support in the engines behind browsers and desktop webviews is
  still uneven.
- PostgreSQL's `timestamptz` stores an absolute instant (internally UTC) and is the idiomatic type
  for it; `date` stores a calendar date without a zone.
- Invoices are legal documents: the period an invoice covers and the day an entry is billed on
  must be unambiguous and reproducible.

## Decision drivers

1. Correctness across DST transitions and in any IANA zone.
2. Identical results on the server, in browsers and in the desktop webview.
3. A model that keeps instants and local dates apart in the types, so mistakes are compile errors.
4. A path to the native platform API, with as little code to change as possible when it arrives.
5. Small, well-maintained, permissively licensed dependency (ADR-0002).

## Considered options

1. **`Temporal` through `temporal-polyfill` 1.0.x** until `Temporal` is native everywhere (chosen).
2. **date-fns 4 with `@date-fns/tz`.**
3. **Luxon.**
4. **Native `Date` + `Intl` only**, with our own zone arithmetic.

### Option 1: Temporal via `temporal-polyfill`

- Good, because `Temporal` is the standard: `Instant`, `ZonedDateTime` and `PlainDate` map one to
  one onto "UTC instant", "instant seen in the user's zone" and "local date", and DST
  disambiguation is explicit (`disambiguation: "compatible" | "earlier" | "later" | "reject"`).
- Good, because `temporal-polyfill` (FullCalendar, MIT) is spec-compliant, about 19.5 kB
  min+gzip according to its README, reached 1.0, and is used as a **ponyfill**
  (`import { Temporal } from "temporal-polyfill"`): it never patches globals, and it already
  delegates to the native implementation where one exists.
- Good, because migrating to the native API is a change of import, not a rewrite.
- Bad, because it adds a runtime dependency to `@fairhour/core` and its bundle weight to the web
  app and the desktop webview until the native API lands.
- Bad, because the polyfill relies on the host's `Intl` time-zone data, so very old engines with
  stale tzdata can disagree on historical offsets (acceptable: the same holds for every option).

### Option 2: date-fns 4 + `@date-fns/tz`

- Good, because it is popular, tree-shakeable and MIT.
- Bad, because it operates on `Date` objects (a `TZDate` subclass for zones): there is no separate
  type for a local date, so "instant" versus "calendar day" is a naming convention, not a type.
- Bad, because the code would have to be rewritten to adopt `Temporal` later.

### Option 3: Luxon

- Good, because it has first-class IANA zones and a mature, immutable API (MIT).
- Bad, because, like date-fns, it has no distinct plain-date type, it is larger and not
  tree-shakeable, and its API is not the future platform API.

### Option 4: native `Date` + `Intl` only

- Good, because it has no dependency.
- Bad, because local-date arithmetic in an arbitrary zone (start of a local day, adding a month,
  splitting at local midnight across a DST change) would be our own code, exactly the kind of
  subtle, rarely exercised logic that libraries exist for. High risk for a core feature.

## Decision

We will:

1. **Store instants in UTC.** Every timestamp (entry start and end, created/updated times) is a
   PostgreSQL `timestamptz`, exchanged in the API as an ISO 8601 instant with `Z` or a numeric
   offset (`2026-03-02T08:00:00Z`). The server's time zone never affects stored data.
2. **Render in the user's IANA zone.** Each user has an IANA time zone (`Europe/Rome`), and the UI
   shows instants in that zone. Workspaces may set a default; the user's zone wins for their own
   views.
3. **Compute local dates in the user's zone.** Report grouping (day, ISO week, month) and invoice
   periods use local dates (`YYYY-MM-DD`, Temporal `PlainDate`) interpreted in the user's zone; an
   invoice period is inclusive on both ends (`from`, `to`), as in the
   [tax engine design, section 7](../design/tax-engine.md#7-core-to-engine-bridge-fairhourcore).
4. **Split for reporting, not for billing.** An entry spanning local midnight is split across the
   days it covers for reporting (CORE-003); for billing it belongs entirely to the local day it
   **starts** on, and that day decides whether it falls inside an invoice period (design section 7,
   step 1). An entry is never billed twice or half-billed because it crosses midnight.
5. **Use `temporal-polyfill` 1.0.x** as a ponyfill in `@fairhour/core` (already a dependency there)
   for all DST-sensitive date math, until `Temporal` is native in every supported runtime (Node 22
   and 24, the browsers we support, and the Tauri webviews). Domain functions take and return ISO
   strings (`string` instants, `LocalDate` strings) rather than Temporal objects, so the polyfill
   stays an implementation detail of `core`.
6. **Keep clocks injectable.** No domain function reads the current time; running entries and
   "today" use an injected clock (CORE-003), which keeps `core` pure and testable.

The MIT tax packages do not depend on `temporal-polyfill`: they only see ISO dates (`IsoDate`) and
compare them as strings, as specified in the tax engine design.

Out of scope: non-Gregorian calendars (the polyfill entry point we use supports only `iso8601`
and `gregory`), per-project time zones, and leap seconds (Temporal ignores them, as does
PostgreSQL).

## Consequences

### Positive

- Instants and local dates are different types, so "which zone is this day in?" always has an
  answer, and DST bugs become unlikely and testable.
- Results are identical on the server, in the browser and on the desktop: the same code and the
  same polyfill run everywhere.
- Moving to native `Temporal` is a mechanical change of import in `packages/core`.

### Negative

- A runtime dependency in `@fairhour/core` and about 19.5 kB (min+gzip) in client bundles until
  the native API is available.
- Developers must learn Temporal's model (`Instant` versus `ZonedDateTime` versus `PlainDate`);
  the API boundary of `core` (ISO strings) limits the exposure.
- The user's zone becomes part of the input of every report and invoice draft, so changing one's
  zone can move entries between local days in reports. This is correct behaviour, documented in
  the user docs; invoices already issued are snapshots and do not change.

### Revisit when

- `Temporal` ships unflagged in Node (LTS) and in every engine behind our webviews: drop the
  polyfill and import the global.
- A use case needs per-project or per-client time zones (for example billing a client in its own
  zone): a new ADR extends rule 3.

## Compliance and enforcement

- CORE-003 tests group entries in `Europe/Rome`, `America/New_York` and `Australia/Lord_Howe`
  across DST transitions and check the midnight split; CORE-009 tests that a cross-midnight entry
  is billed on its start day.
- `packages/core` imports only `temporal-polyfill` (never `temporal-polyfill/global`); review
  rejects `new Date()` or `Date.now()` in domain code (the clock is injected).
- The database schema review (phase 3) checks that timestamps are `timestamptz` and that users have
  an IANA zone validated with zod.

## Links

- [Tax engine design, section 7](../design/tax-engine.md#7-core-to-engine-bridge-fairhourcore)
- [ADR-0001: Technology stack](0001-technology-stack.md), [ADR-0002: Licensing](0002-licensing.md)
- TC39 Temporal proposal: <https://tc39.es/proposal-temporal/docs/>
- `temporal-polyfill`: <https://github.com/fullcalendar/temporal-polyfill>
- PostgreSQL date/time types: <https://www.postgresql.org/docs/current/datatype-datetime.html>
- IANA Time Zone Database: <https://www.iana.org/time-zones>
