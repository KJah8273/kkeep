# Hunter Assassin loading update

- Removed Turbo Stars, Bridge Race and State.io from the catalog and public game assets. Their old play routes return 410. Existing Profile records were not deleted.
- Verified the requested Unity page (`249d2b8f-96eb-4402-af03-dca7d3113dc3/hunter-assassin`) still publishes build `fdec53b8-a2bc-427a-ba04-4d4475987ef7`, which is the native game used by Kkeep.
- The previous cover-only screen could conceal roughly 184 MB of downloads. Hunter now shows an actual byte-based percentage and progress bar, followed by explicit engine/start phases. The cover remains until the first native render succeeds.
- Downloads use two ordered 4 MiB parts at a time, with timeouts and bounded retries. Retried bytes do not count twice toward progress.
- The Worker validates each part's exact size, archive range and pinned SHA-256 before storing it in R2. Immutable part URLs allow browser cache reuse. Engine/native code is gzip-compressed for transfer; already-compressed textures/audio are not recompressed. Legacy range URLs remain supported for open tabs.
- The chunk hashes in `worker/hunter-chunks.json` were calculated from the original build members described by `worker/hunter-files.json`; neither file nor the save keys changes the game build.
- `hunter-assassin:kkeep:prefs` and `hunter-assassin:kkeep:files` are unchanged. Download caches are not included in Profile saves. The existing 540 × 810 touch canvas remains in use on iPad.

## Validation

67 targeted tests passed: Worker range handling, real R2 cache writes and gzip in workerd, checksum/length failures, retry accounting, bounded concurrent download order, first-frame loading behavior, touch-coordinate mapping, native save restoration and Profile round trips. TypeScript checking also passed.

The Worker cache test substitutes a tiny known binary to exercise real runtime behavior without checking a large native engine into the test suite. The startup test uses a stub native renderer and verifies loading/touch behavior; it does not establish actual gameplay compatibility.

Physical iPad gameplay was not verified in this session. The available browser connections could not initialize, so device rendering remains a separate verification limit.
