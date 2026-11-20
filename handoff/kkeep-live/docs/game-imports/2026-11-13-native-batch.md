# Native mobile game batch

Sources inspected: Fern Games (179 curated entries), Lucidity/ixlsucks (921), Truffled (666), GN Math (855). Existing Kkeep slugs were compared before selecting this batch. Original game code, assets and titles retain their authorship; this integration does not claim Kkeep created them.

| Game | Discovery source | Original controls | Saved state |
| --- | --- | --- | --- |
| Coreball | GN Math | Native tap | Level |
| Rolly Vortex | GN Math | Construct touch | Native local storage |
| Maze Speedrun | GN Math | Native pointer/swipe | Native/Playables storage |
| 1 | Truffled | Swipe | Best score (original game does not save an unfinished board) |
| Wordle Unlimited | Truffled | Original on-screen keyboard | Puzzle state and statistics |
| Little Alchemy | Truffled | Native drag/drop | Discovered elements |
| Ten Basket | Truffled | Native pointer aiming | Ball selection and score |
| 2048 Cupcakes | Fern | Swipe | Board and best score |
| Hextris | Lucidity | Native touch | Native saved state and high scores |
| Flappy 2048 | Lucidity | Tap | Best score |
| Wall Kickers | Truffled | Port's native mobile tap input | SQLite progress mirrored into localStorage and IndexedDB |
| 3D Bowling | GN Math | Native touch bowling | Playables/local storage |
| Sushi Roll | GN Math | Native touch | Playables/local storage |
| Cannon Balls 3D | GN Math | Native PlayCanvas touch | Playables/local storage |
| Parking Rush | GN Math | Native Construct touch | Playables/local storage |
| Tower Crash 3D | GN Math | Native PlayCanvas touch | Playables/local storage |

All entries use the existing isolated SavedGamePlayer, restoring localStorage and IndexedDB before engine startup. Profile sign-in enables the existing cloud synchronization. No Kkeep controls were added. The existing 1 MiB snapshot limit remains; it is not a promise to sync arbitrary emulator worlds or third-party server accounts.

The new runtime caps touch-device pixel density at 1, identifies desktop-mode iPads to older mobile detectors, prevents unwanted double-tap zoom and retains native input coordinates/physics. Wall Kickers also caps its framebuffer ratio at 1. This reduces rendering allocation; real iPad frame rate and memory pressure have not been measured.

Initial classic scripts are bundled into the local entry to preserve startup ordering in the sandbox. Kkeep's loader uses the engine readiness callback where available; older canvas engines use a rendering fallback. Optional ad/provider SDKs and promotional page elements are omitted. Famobi adapters disable interstitial/reward/mock ads and provider features; rewards report unavailable, not a fake completed ad. Two embedded provider sprites were disabled in their original game source, separately from game title art.

Validation: 154 existing save/delivery/asset tests passed. Three SDK adapter tests check restored progress, writes, readiness, disabled ads and pause/audio subscriptions. Inline JavaScript syntax passed. Browser checks found and repaired initial script ordering and embedded provider logos. The cloud browser does not support WebGL for the PlayCanvas games; physical iPad testing and account-to-account online game behavior are not verified by these checks.

Source URLs are retained in linked-games.ts and each HTML base. Adapter source hashes and the two precise logo edits are recorded beside this file. Earlier catalog entries and previously held games are outside this batch's verification.

Territorial.io was tested but not enabled: the mirrored client is rejected by the multiplayer server as outdated; the current official client includes host-bound Turnstile checks. Those restrictions are preserved. No online compatibility is claimed.

Wall Kickers provider badge was found during an actual game start and removed together with its hit target and extra WebGL rendering pass. Native engine rendering and touch input are preserved.

Live verification follow-up: Wall Kickers reached gameplay with the badge removed; 3D Bowling, Sushi Roll and Ten Basket reached their menus; Cannon Balls reached gameplay. Parking Rush and Tower Crash revealed SDK entry URL mismatches, now corrected to the audited local adapters. Adapter checks now enforce this wiring. Little Alchemy's duplicate upstream jQuery bundle contained an unrelated obfuscated script injector; that duplicate and its fallback were removed, retaining the clean bundled jQuery 2.1.0. Its settings read now handles new players with no prior save, and Kkeep readiness waits for the actual library.

Live data follow-up: Little Alchemy resource AJAX failed through the provider relay. Its element database, icons, English strings and templates are retained locally and its original AJAX requests route to those files. Transparent branding placeholders use a valid PNG to avoid WebGL image-decoder errors.

Little Alchemy jQuery requests explicitly use cross-origin mode inside the opaque save frame. This omits the automatic X-Requested-With header (unsupported by the game relay preflight) while preserving the sandbox and normal CORS validation.
