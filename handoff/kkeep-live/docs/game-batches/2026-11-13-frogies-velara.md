# Frogies and Velara game batch — 13 November 2026

Discovery: https://frogiesarcade.net/math/ and https://velara.cc/g.
Twelve visible additions; Chess Classic remains under review because its loader stopped at 93% in browser QA.

## Integration

Local, inlined game engines inside the existing sandboxed SavedGamePlayer. Original graphics/audio remain on the recorded asset bases. No portal page iframe or custom Kkeep touch controls. Native touch detection includes desktop-mode iPadOS; touch DPR is capped at 1. Kkeep loading waits for the engine-ready signal. WebGL-dependent games fail clearly when the browser cannot provide graphics rather than hanging indefinitely.

Profile-compatible localStorage and IndexedDB snapshot integration is inherited from SavedGamePlayer. Playables saveData is bridged to per-game localStorage. There Is No Game additionally snapshots Construct runtime state, bounded to 700 KB. 8 Ball saves native settings and records, not an unfinished match. Actual signed-in cross-device restoration and physical iPad performance were not tested.

Portal ads, rewarded offers and external menu links were disabled in the adapters. Ball Blast extra-life advert offer removed. Basketball FRVR waterfalls disabled, tracker initialization removed, portal logo removed from the board. Pokey Ball paid-coin retry continues without requesting an ad. Vex portal splash and cross-promotions replaced; native canvas clearing fixed for browsers that fall back to Canvas2D.

## Validation

201 game/player/save regression tests passed before final build. Manual browser QA: Ball Blast gameplay, 8 Ball playable table, Basketball FRVR play screen, Vex 3/4/5 menus and Vex 4 level hub, There Is No Game opening. Cloud browser does not provide WebGL: Pokey Ball, Bottle Jump 3D, Bouncemasters, Dragon vs Bricks and Retro Bowl could only receive source/integration checks, not a completed gameplay test here. These builds expose native mobile input and native save routines.

## Follow-up

Chess Classic loading must be resolved before enabling. Test the WebGL games on physical iPad Safari and verify account-to-account-isolated profile restoration on two devices. Do not interpret this batch as an all-games/no-ads-in-every-state certification.
