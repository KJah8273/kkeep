# Kkeep — current Roblox source handoff

This branch supplies the current Sites source that was missing from the older GitHub export. **Start with [SONNET-START-HERE.md](SONNET-START-HERE.md).**

| Work area | Source |
| --- | --- |
| Current Kkeep player, login/recovery UI, application source and host tests | [`handoff/kkeep-live/`](handoff/kkeep-live/) — Sites version 324 |
| Complete Roblox compatibility runtime, worker, bootstrap data, fixtures and tests | [`handoff/roblox-runtime/`](handoff/roblox-runtime/) — Sites version 32 |
| Exact source commits, included paths, file hashes and export boundaries | [`handoff/SOURCE-MANIFEST.json`](handoff/SOURCE-MANIFEST.json) |

The older files at the repository root remain for reference. **Run commands inside the relevant handoff project, not at the repository root.** The production Roblox host is an embedded player with recovery controls; the root-level legacy redirect does not describe it.

This is a source-access handoff, not a gameplay fix or a production deployment. The iPad “Joining server” issue remains unresolved. GitHub `main` and both live Sites publications were left unchanged.

The runtime has its complete tracked text source and all build/test inputs. The main application snapshot omits unrelated game binaries, media and infrastructure; it supports the focused Roblox checks, but is not a full-site deployment bundle.
