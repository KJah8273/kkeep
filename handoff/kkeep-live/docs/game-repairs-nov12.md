# Game repairs and circular interface — November 12

- Preserve opaque profile-save iframe isolation; delegate optional gamepad permission and catch only denied gamepad API calls. Guard denied optional service-worker access without registering a worker.
- Correct desktop-UA iPad detection in Eggy Car, Knife Hit, Tall Man Run, Color Match, Capybara Clicker and Monkey Mart. Remove Eggy Car automatic fullscreen and offline-cache registration.
- Distinguish optional script failures from core runtime download failures; real failures have Retry/Close controls.
- Eggy Car only resumes the supplied build's specific missing prebid-placeholder error after SDK_READY; domain/authorization errors are not treated as success.
- Switch Jetpack Joyride to the verified equivalent Cloudfront asset source. Knife Hit's existing C2 host still returns503; show an actionable failure, do not substitute a different game or reset saves.
- Add30 game-only launchers with genuine covers. Ten Construct launchers use document asset bases and main-thread runtime to retain isolated storage; worker count is limited. Native touch controls are preserved; targeted fixes for Moto X3M2/3, Stack and Factory Balls.
- Stack now saves its actual best completed tower. Soccer Skills is a quick-match game without native persisted levels; do not claim level sync for it.
- UI: Outfit font, circular icon controls, pill text controls, limited glass surfaces, retained reduced-motion support, lazy cover loading and document scrolling.

## Verification

Initial catalog:75 covers/local entries present.190 bootstrap requests and28 nested resources audited. New30:132 substantive runtime/data/physics checks and30 covers verified. These HTTP checks do not establish completed gameplay.

Browser verified Home/Settings circular design and navigation. Cloud test browser blocks /api/game-public resource URLs (ERR_BLOCKED_BY_CLIENT); it also lacks usable WebGL for the inspected Unity player. Full gameplay and physical iPad performance remain unverified. Unit tests exercise denied APIs, optional errors, asset mapping, per-profile save isolation/conflicts and Stack high scores. No authenticated cross-device Profile session was available.
