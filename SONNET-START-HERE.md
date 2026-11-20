# Sonnet: start with the current Kkeep sources

Prepared on **21 November 2026** for the owner of `KJah8273/kkeep`.

## Select this branch

Use **`handoff/roblox-live-source-2026-11-21`**:

```sh
git clone --branch handoff/roblox-live-source-2026-11-21 --single-branch https://github.com/KJah8273/kkeep.git
cd kkeep
```

If you already cloned the repository, fetch the handoff branch and switch to it with your current work preserved. The repository was publicly readable when this export was prepared. Public read access alone does not establish authenticated push access in your environment.

The GitHub base is `751677c39dec8a7a90e06884db85e2df6b8ada92` (the five-commit branch with the home redesign). It was an older source export and has **not** been overwritten. Its `app/roblox/page.tsx` redirects to an older standalone address. **That root-level route is not the live player implementation.**

## The two live projects

| Project | Working directory | Confirmed Sites version | Exact source commit |
| --- | --- | --- | --- |
| Main Kkeep website | `handoff/kkeep-live` | 324 | `60c4fc45aa6ec759d8f977c0999da1236f18e9a6` |
| Isolated Roblox runtime | `handoff/roblox-runtime` | 32 | `ff8c31d806369cb41f755b0d1c5c10138ef84e80` |

Both matching Sites deployment records reported success when checked for this handoff.

- Main website: <https://kkeep.fun>.
- Current runtime: <https://kkeep-roblox-runtime.kha971.chatgpt.site>.
- Current catalog route: `/_rbx/app/` on that runtime.
- The old `kkeep-roblox-private.testerqrr1.chatgpt.site` destination belongs to the earlier GitHub export.

Kkeep is a gaming and entertainment website. Its Roblox feature uses a main-site player UI and an isolated provider compatibility runtime. The runtime serves selected public launch assets and bridges permitted browser-session requests. The provider's game services and compiled engine remain external dependencies. This export is not the original Roblox engine source or a self-contained replacement for those services.

## Where to investigate

### Main player

In `handoff/kkeep-live/`:

- `app/roblox/page.tsx`: renders the actual player; it is not the legacy redirect.
- `components/roblox-player.tsx`: frame lifecycle, sign-in/recovery state, Loading help, runtime events, game launching and controls.
- `lib/roblox-player.ts`: runtime origin, validated events/URLs, iPad classification, FPS preference and bounded recovery decisions.
- `app/roblox/roblox.css` and `components/roblox-snow.tsx`: player presentation.
- `lib/touch/providers.ts`, `lib/apps.ts`, `components/proxy-browser.tsx`: entry points from the rest of Kkeep.
- `worker/index.ts`: main-site response/isolation handling. A changed runtime origin needs coordinated review here as well as in the player library.
- `tests/roblox-session.test.mjs`, `tests/roblox-view.test.mjs`, `tests/touch-launch.test.mjs`: focused host regression checks.

### Runtime

In `handoff/roblox-runtime/`:

- `worker/index.js`, `worker/gateway.js`: routing and controlled asset transformations.
- `worker/session.js`, `worker/session-state.js`, `worker/proxy-session.js`, `worker/signin.js`: browser-local sign-in/session flow and recovery.
- `worker/runtime.js`, `worker/graphics.js`, `worker/preferences.js`: engine integration, presentation and preference delivery.
- `worker/transport.js`, `worker/relay.js`: transport compatibility and relay selection.
- `worker/engine.js`, `worker/engine-loader.js`: inspected engine/bootstrap compatibility.
- `worker/launch-shell.js`, `worker/launch-data.json`, `worker/public-assets.js`: pinned public bootstrap assets and shell. **Keep `launch-data.json`; the build requires it.** It contains 24 checked public bootstrap resources, not a captured account session.
- `worker/check.js`, `worker/session-check.js`: startup/session diagnostics.
- `tests/` and `tests/fixtures/`: regression coverage, including inspected provider JavaScript and synthetic account-free responses.

Read `README.md` in the runtime and the latest notes first:

- `docs/roblox-ipad-join-compatibility.md`
- `docs/roblox-automatic-signin-recovery.md`
- `docs/roblox-postjoin-transport-recovery.md`
- `docs/roblox-native-presentation.md`
- `docs/roblox-black-screen-join17.md`
- `docs/roblox-join18-verification.md`

## Current problem and existing work

The owner's latest report is: **PC works, but iPad Safari can remain on “Joining server” and never reach playable gameplay.** Earlier reports also included a black screen with audible movement, missing graphics, sign-in failures and error 277 shortly after the game appeared. A screenshot of the loading card does not establish the root cause.

The owner previously reported an iPad 10th generation (2022) and iPadOS 27.2. Confirm the model/build for the particular failing device if device-specific evidence is required; friends' devices may differ.

The current source already includes desktop-UA iPad detection, a default 30 FPS choice with explicit user preference precedence, the iOS engine FPS setting, existing relay selection for ordinary iPad launches, full CSS viewport with a drawing-buffer budget, native presentation work and bounded Loading help/recovery. Review these implementations and their tests before adding another workaround.

The next fix must be based on a reproduced defect or observed diagnostic evidence. Trace both the host and runtime through startup, authentication, launch, transport and frame presentation. Do not infer that only the runtime is faulty from the older redirect-only GitHub copy. Preserve the working desktop path and account isolation. Do not clear sign-in data, replay authentication/join requests, or introduce unlimited reload/rejoin loops as a substitute for diagnosis.

## Install and run the relevant checks

Use **Node 24** for the handoff commands. The checks recorded below used Node `24.22.3` and npm `11.19.1`.

### Complete runtime

From the repository root:

```sh
cd handoff/roblox-runtime
npm ci --ignore-scripts
npm test
npm run build
node --check dist/server/index.js
```

The runtime dependencies are locked. Its build script is included and does not require an unavailable external Sites build helper.

### Focused main player checks

From the repository root:

```sh
cd handoff/kkeep-live
npm ci --ignore-scripts
node --experimental-strip-types --test tests/roblox-session.test.mjs tests/roblox-view.test.mjs tests/touch-launch.test.mjs
```

The executable modes of the tracked shell scripts are preserved. The direct install above is the verified setup for these source checks; it avoids depending on the older root export's install environment.

**Do not run the old root `npm test` and present that as validation of this source.** Likewise, the limited public assets in `handoff/kkeep-live/` are not a full collection of Kkeep's games and media. Its standard full-site build invokes game pre/post-processing that depends on omitted assets. A full main-site production build belongs in the complete existing Sites checkout, with its normal assets and bindings.

## Checks performed for this handoff

- Recovered both exact Sites source commits and verified the matching successful publication records.
- Preserved every included source file byte for byte, including file modes; `handoff/SOURCE-MANIFEST.json` records source blob IDs, SHA-256 hashes and included paths.
- Runtime: **395 tests passed, 0 failures, 0 skipped** on the exact exported revision.
- Runtime build and generated-server syntax check passed, including a build from the exported folder.
- Main player/view/touch-launch: **70 tests passed, 0 failures** from the exported main-source folder.
- Reviewed included text and decoded runtime bootstrap resources for embedded credentials or captured account state. Fixture token-like values are synthetic mocks/canaries or public source metadata.

**No physical iPad gameplay was verified during this handoff.** Unit tests, simulated events, a rendered loading screen, audio, or successful login do not establish a sustained authenticated game join. The owner's latest report means the iPad issue remains open.

## Export boundaries

The runtime contains all tracked text source, required pinned bootstrap data, build scripts, locked dependencies, tests and fixtures. Historical screenshots are omitted. Older text notes may still mention those screenshots; they are historical references and are not included evidence in this handoff.

The main snapshot includes current application source, worker code, database schema/migrations, build scripts, lockfile, tests, text notes and relevant small shared/Roblox assets. It omits unrelated infrastructure copies, bulk game binaries, media, screenshots and generated caches. The manifest records the categories and counts. Do not report those intentional omissions as newly discovered production missing-file bugs.

No repository history, `node_modules`, generated build output, browser storage, account passwords, session cookies, production environment variables, runtime logs, database rows or private uploads are included. The existing non-secret `.openai/hosting.json` identifiers are retained for project/build fidelity; they grant no publishing permission.

## Delivering and publishing a real fix

1. Create a fix branch from this handoff branch and change the relevant files under `handoff/kkeep-live/` and/or `handoff/roblox-runtime/`.
2. Run the matching checks and explain the reproduced defect, changed behavior and remaining device-test limits.
3. If your environment has authenticated GitHub write access, push and open a PR against this handoff branch. Otherwise return a patch with exact relative paths. Public cloning does not grant write access.
4. Apply the reviewed changes back to the matching complete Sites project, removing the `handoff/<project>/` prefix from each path. Check for newer Sites changes before applying them; preserve unrelated files and production bindings.
5. Build and publish each affected project through an authorized Sites environment. A GitHub push or merge alone does **not** publish `kkeep.fun` or its runtime. This session has not installed automatic synchronization.
6. Confirm sustained game rendering, movement/touch controls, sign-in persistence, leaving/rejoining and game changes on the actual iPad before calling the gameplay problem fixed.

This branch supplies the missing code so the investigation can proceed. It does not claim to resolve the iPad failure.
