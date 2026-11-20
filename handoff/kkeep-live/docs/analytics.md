# Kkeep traffic analytics

`/analytics` and `/api/analytics/report` require the hosting platform's authenticated owner email. Anonymous visitors see a sign-in link; other accounts cannot read the report. The site stays public. Responses are private/no-store; the dashboard cannot be framed.

Runtime settings (server only): `KKEEP_ANALYTICS_OWNER_EMAIL`, `KKEEP_ANALYTICS_SECRET`, and `KKEEP_ANALYTICS_STARTED_AT`. Use Sites environment settings, never client bundles or the public source archive. Update the owner setting if the site changes ownership. There is no first-visitor claim or shared dashboard password.

The lightweight collector runs only on Kkeep's shell and app launchers, never inside rewritten remote documents. A page/app category must remain visible for two seconds. Only an allowlisted category (including known game slugs), random in-memory event ID and iPad hint are sent. React app changes and the separate Xbox/GeForce launchers use the same endpoint. HTTP requests, assets, media segments, searches, titles, referrers and target URLs are not recorded.

`/api/games/hot` exposes only the six highest aggregate game-open counts from the last seven days. Reopens of the same game by one estimated visitor within five minutes are deduplicated. These are game opens, not completed gameplay sessions. The public response contains only game IDs and counts; visitor details remain private. The Games page shows New Games when no ranking is available and never fabricates popularity.

The server takes country from the hosting edge and reduces the browser to coarse device/browser families. A secret HMAC of edge address plus coarse device/browser is used for the visitor estimate. Raw IP, full user agent and account data are not stored in analytics. No tracking identifier cookie or localStorage ID is created. This estimate merges some users on shared networks and splits users switching networks/browsers; it is not a headcount of proven humans. VPN location is not physical location.

Known crawler/headless user agents are ignored. Verified bots / low bot scores are ignored when Cloudflare supplies that metadata; those fields are not assumed available. The client skips webdriver, hidden frames and privacy signals. The server also honors DNT, GPC, signed-in owner exclusion and the browser opt-out. These checks cannot eliminate all bots. Non-JavaScript visits and brief visits under two seconds do not count.

The optional `__Host-kkeep-analytics-exclude` cookie is Secure/HttpOnly/SameSite=Strict, contains only `1`, and is set at the visitor's request. A local preference mirrors it to stop pending client sends. Browser exclusion must be selected separately on other browsers or separately installed apps.

Event IDs are HMACed and replay-safe. Input is capped at 512 bytes and rejects unknown fields. Inserts are capped at 20 events/minute and 500/day per estimated visitor. Old records are removed after 35 days on a subsequent event; the report only exposes aggregate 1/7/30-calendar-day ranges in Asia/Dubai, with today partial. No historical visitor data was backfilled.

`tests/analytics.test.mjs` exercises SQLite migrations, owner authorization, replay protection, retention, rate limits, privacy rejection, bot/owner exclusions, iPad classification and date-range/unique counting.
