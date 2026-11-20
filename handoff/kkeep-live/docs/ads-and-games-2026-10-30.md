# Ads and new game imports — 30 October 2026

> Advertising was completely removed on 3 November 2026, including banners, sponsored links, timed pop-ups, and the separate ad-frame host. The advertising section below is historical.

## Ad placements

All nine supplied script units and the supplied direct sponsor link are included. Six fixed banners each have their own HTML document/atOptions. Native and Social Bar units run in their own opaque frames. The pop script runs only in an explicit sponsor-offer frame, with the existing 24-hour initialization cap. It cannot intercept clicks on game cards, Profile, navigation or search. No top-page redirects are allowed by these frames. Google AdSense remains absent.

Home uses responsive horizontal banners and both vertical banners when there is space. Games includes a clearly labeled sponsor card plus at most three ad breaks. Break positions/formats shuffle once per visit, remain stable while browsing, and do not auto-refresh. Cloud and Movies use responsive banners; Wallpapers and Movies include native placements. Existing browser-start side banners remain. Ads are removed when Profile or movie playback opens. Gameplay is kept unobstructed.

This is a code/placement integration, not a guarantee that the provider serves inventory. Direct reads of the Social Bar and Native scripts returned empty HTTP 200 bodies in this environment. No ad links were clicked. Ad blockers, provider no-fill and iframe restrictions can still prevent an ad from appearing. Browser preview infrastructure is unavailable, so real ad rendering is unverified.

## New games

- Basket Battle: original supplied zxs entry, pinned Unity build from `bubbls/youtube-playables@86ba622d4f23e944352f50b6052fa16f22c5250d/basket-battle`. Profile-aware local save adapter replaces the host-specific YouTube bridge. Saves the game's own string payload; waits for Unity before returning it. Canvas fits the viewport and caps touch-device rendering at 1x. Original game touch controls remain. All four required build resources returned HTTP 200.
- 2048: original supplied zxs entry and its pinned qollaaa/j assets. Local assets remove dependence on the source wrapper. Added full board/score/win state and best-score persistence to isolated storage. Pointer swipes support iPad, keyboard moves remain, interrupted gestures cancel. Removed broken analytics/social calls that otherwise throw on restart or game-over. Original game and AI code retained.
- Cards remain artwork and name only. Basket Battle artwork comes from its App Store listing (id1622000953); 2048 artwork from the original gabrielecirulli/2048 repository.

## Save audit

33 visible games use SavedGamePlayer: Basket Battle, 2048, Pixel Gun Zombie, Knife Hit, Jetpack Joyride, Angry Birds Online, Amaze, Hill Climb Racing, Paper.io 2, Brawlhalla Offline, Crossy Road, Among Us Old, Angry Birds Epic, Boil Noodles at Night, Stickman Hook, Drive Mad, Block Blast Puzzle, Dune, Draw Climber, Hypersnake, Tomb of the Mask, Fruit Ninja, How to Fish, Idle Mining Empire, Geometry Dash, Stick War: Legacy, Subway Surfers, Solar Smash, Kick the Buddy, Bad Piggies, Trees Hate You, Angry Birds, and Stickman Duel.

The shared player restores before boot, isolates each Profile/game, copies localStorage and IndexedDB, rejects stale revisions, retains a previous backup, and never uploads credentials or asset caches. All 33 have API/codec restore coverage. This does not prove every upstream game writes a checkpoint, or that mid-round memory can be restored. New 2048 tests execute the actual board move/restore/restart path; Basket Battle tests cover its save adapter.

Hgola uses a separate native IndexedDB backup API, with separate-account and second-device Profile tests. Existing device data is not erased or migrated by this update.

Known gaps (not claimed as Profile-synced):
- Stick Fight and 1 2 3 4 Player Games use their own Unity loaders and currently lack a Profile adapter. Their existing local data was left intact.
- Roblox, Clash Royale, and the external 2 3 4 Player Games open other origins. Kkeep cannot read/sync their storage; those services require their own save/account integration.
- Blumgi Paintball is excluded from the visible menu and marked external; it is not included in the 33.

All current menu entries were classified. Deleted Plants vs Zombies and Level Devil were not added back. Actual iPad gameplay and browser-to-browser end-to-end tests remain unverified because the available browser tool cannot start in this environment.
