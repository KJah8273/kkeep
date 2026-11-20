# Game loading and isolated ads

## Fixed

- Turbo Stars, Bridge Race and State.io use an external CDN base for their engine assets. Their root `/games/` URLs now resolve to Kkeep's local public-asset route, restoring the shared stylesheet, cover, player and Profile adapter. External game documents retain their own URL semantics.
- Hunter Assassin's Worker used `redirect: 'error'`, which Cloudflare rejects before sending a request. Both downloads now use `manual` and explicitly reject redirects. Byte-range validation, file sizes and Profile save keys are unchanged.
- Isolated ad documents now expose an empty, non-persistent cookie interface only when the browser throws on cookie access. The supplied banner provider's cookie availability check no longer throws. The provider still sees cookies as unavailable. No Profile cookies or storage are exposed. Frame and monitor versions were advanced to avoid reusing the old script.

## Verification

- The old Hunter request setting reproduced a TypeError in workerd. The repaired handler passed GET/HEAD range requests and redirect rejection in Miniflare/workerd.
- The real Hunter source returned HTTP 206 for the first 4 MiB engine segment, with the exact expected range and length.
- Regression coverage uses the three actual entry documents, verifies local assets exist, and retains external-base/query/hash behavior.
- Save adapter and Profile restore checks passed, including isolation between games and profiles. No saved data was cleared.
- Ad tests cover denied cookies/storage, delayed creatives, nested frames and iPad-sized placements. A Safari-header request to the supplied mobile banner URL returned its JavaScript. This does not establish an actual ad impression or fill.

Physical iPad gameplay and live ad rendering were not verified. The connected browser had no originating connection, and the cloud browser failed to initialize its sandbox.
