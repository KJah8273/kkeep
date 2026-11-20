# Kkeep source handoff

Start with `SONNET-START-HERE.md`. Current Sites code lives in `handoff/kkeep-live/` and `handoff/roblox-runtime/`; the older root application is retained only as reference.

The requested investigation is the unresolved iPad Roblox join stall. Read the existing repair notes before editing. Use the actual current source and meaningful regression checks. Preserve working desktop behavior, per-user login state, and bounded recovery. Do not represent a unit test, sign-in, loading screen, or audio as verified gameplay on a physical iPad.

Keep changes scoped to the relevant handoff project. A GitHub commit does not publish either Sites project. Never include account passwords, session cookies, tokens, raw authenticated requests, production database contents, or local browser state in the repository.
