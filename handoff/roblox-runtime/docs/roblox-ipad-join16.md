# iPad join investigation — join16

## Actual account test

After the owner completed sign-in in the shared browser, the authenticated catalog and Timebomb Duels experience page loaded. The account's Continue entry opened the requested experience, and Play initiated its real launch. No credentials, cookies, authentication tickets, private URLs, or account identifiers are included in this report or the source.

The cloud Chrome environment could not start either graphics backend:

| Launch | Observed result |
| --- | --- |
| Existing WebGPU default | The browser did not provide a WebGPU adapter. |
| Existing manual WebGL option | `getContext("webgl2")` returned null; the loader failed while reading `getSupportedExtensions`. |

Both failures precede native engine startup. The cloud canvas retained its default 300×150 backing size, and no native `Canvas:` startup line appeared. This environment cannot verify an authenticated join, rendered gameplay, or iPad Safari behavior. The authenticated experience page was left available after using Leave.

![Actual cloud launch failure, not an iPad result](roblox-cloud-launch-join16.jpg)

## Confirmed resize defect and repair

The provider's effective drawing ratio changes with available viewport dimensions. Its actual WasmPlayer `Je.applyPendingResize` resized the backing buffer, but only a resolution media-query callback notified the native engine of a new ratio. A viewport resize alone did not notify it. This was reproduced with the complete inspected `setupPerf`, actual `Je`, and actual `onRuntimeInitialized` callback, with native exports stubbed.

The exact, version-specific transform now calls the existing `update_pixel_ratio` binding after a pending buffer resize when a finite positive ratio needs to be reported. The last notified value starts unset and advances only after a successful call. An unavailable binding does not prevent resizing. The native binding queues the existing pixel-ratio event; it does not synchronously reenter graphics initialization. No rendering loop, binary, flags, memory limit, transport, or automatic join retry was changed.

This fixes a demonstrated resize-state inconsistency. It does not establish the cause of the initial “Joining server” stall.

## Local evidence available on the iPad

The main player's **Loading help → Troubleshooting details** requests a snapshot from the active game frame without navigating, remounting, or replaying a join. The runtime returns only:

- Current canvas CSS and backing dimensions.
- The first strictly parsed, numeric native `Canvas:` startup report, if observed.
- The last of three exact registered native lifecycle messages: join reported, game scripts starting, or game closed.
- The runtime revision. Existing transport status remains visible in Loading help.

The native startup line runs before app initialization. Its presence is not renderer readiness. Startup dimensions may differ from subsequent backing dimensions by one pixel because native startup truncates and the JavaScript resize callback rounds. Reported ratios have only two decimal places; the “raw” ratio is the provider-overridden value, not physical device density.

The join-success native callback is registered during engine initialization and also invokes the existing `__onExperienceJoined` hook. Its observation establishes that the engine reported the event; it does not prove visible or playable gameplay. Missing events remain “not reported,” not definitive failures.

Snapshots stay in memory and pass only to the exact authorized parent origin. The receiver revalidates dimensions and enums and copies only known fields. These additions make no telemetry request and retain no raw engine logs, session identifiers, or account data.

## Interpretation of the latest screenshot

The latest visible picture measures approximately 1600×1200 physical pixels, corresponding to an 800×600 CSS view on the supplied iPad screenshot. Its reduction from the preceding screenshot matches removal of the old iframe magnification. That does not demonstrate double application of the new DPR budget. Native GUI constructors contain 800×600 defaults, but the active branch causing this particular image has not been established.

The next on-device snapshot can distinguish a zero/small canvas, native initialization at a different size, and a full canvas that still displays a smaller loading GUI. The native game event further distinguishes whether join success has been observed. The physical-device cause remains unverified until that evidence or a reproducible graphics-capable session is available.
