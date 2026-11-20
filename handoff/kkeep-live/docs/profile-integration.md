# Kkeep Profile integrations

Google Identity Services is implemented but remains hidden until `KKEEP_GOOGLE_CLIENT_ID` is configured in the Site runtime environment. Create a Google OAuth Web application client, register `https://kkeep.fun` as an authorized JavaScript origin (and `https://kkeep.testerqrr1.chatgpt.site` if that origin should be used), and set the public client ID. This popup credential flow does not use a client secret. Publish the saved Site version again after changing the environment. Sign in to an existing Kkeep Profile first, then connect Google to keep its saves. Google accounts are linked by the verified subject, never by matching an email address.

Fix or idea uses a 60-second one-time code from the signed-in Kkeep Profile, bound to a random state cookie on the community site. Staff logins remain available. Old guest sessions are rejected. No old requests, profile data, or game backups are deleted.

## Adding a game

Add linked games to `lib/games/linked-games.ts`; the menu and saved-game registry now include them automatically. Use the `/play/<slug>` player so localStorage and IndexedDB are restored before game code starts, then synced to the signed-in Profile. Test the actual game, create progress, close/reopen, and restore with a second browser session. Do not mark a game `external` without documenting that its provider owns its saves. Never claim a saved high score or cloud progress based only on a successful embed.

The existing save transport retains the prior revision, rejects conflicting devices and account changes, and has a 1 MiB limit. Do not silently discard oversized saves or overwrite newer cloud data. Unity must write its own progress to IndexedDB/PlayerPrefs for the adapter to capture it.

Provider-managed Roblox, Clash Royale and cloud gaming require the provider's own accounts. Blumgi Paintball's current upstream URL returns a 404 page and cannot be asserted to work. Stick Fight and the multiplayer players use their existing dedicated runtimes; their sessions are not yet integrated into the general Profile save adapter. Hgola uses its dedicated Profile save backend.
