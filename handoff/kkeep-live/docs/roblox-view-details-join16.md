# Roblox local view details — join16

The existing Loading help panel now includes a collapsed **Troubleshooting details** section while an experience is selected. Opening help or choosing **Refresh details** requests a snapshot from the active runtime iframe. Neither action navigates, replaces the iframe, retries a join, changes performance settings, nor clears an engine error.

The response is accepted only from the current iframe and the exact isolated runtime origin. The receiver copies only bounded dimensions, bounded scale values, the known runtime revision, and one of three native lifecycle enums. Account information and arbitrary runtime fields are not retained. Snapshots clear on a new experience, restart, or exit.

The details show current CSS dimensions, backing dimensions, the reported native startup size when available, and the last observed native game event. Zero-size initialization is a real reported measurement; null means no report was observed. A one-pixel startup/current difference is expected because native startup truncates and the JavaScript resize callback rounds. Neither sizing nor a reported native join establishes visible gameplay.

## Checks completed

- 37 focused session, view-validation, and touch-launch tests passed.
- The project TypeScript check passed.
- The controlled browser preview uses the actual React player and runtime observer, with explicitly simulated native output. Opening Loading help displayed the snapshot; Refresh details preserved the same game document. The expanded panel avoids nested scrolling and leaves its contents accessible on smaller screens.
- The separate authenticated production account test reached the requested experience, but this cloud browser could not start either graphics backend. This is not a physical-iPad or successful-gameplay verification.

Reproduce the local integration preview with `node scripts/preview-roblox-view.mjs <absolute-output-directory> <absolute-runtime-checkout>`, then use the managed preview workflow for that output directory. Its generated files remain development-only and do not add a public production test endpoint.

![Controlled diagnostic preview; native output is simulated and no game is running](roblox-view-details-join16.jpg)

For an actual iPad that remains at “Joining server,” the useful follow-up is a screenshot of Loading help with Troubleshooting details expanded, including the connection status. That distinguishes the live browser measurement from this synthetic example.
