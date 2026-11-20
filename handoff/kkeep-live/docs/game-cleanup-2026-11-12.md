# Game-only integration, November 12

Four requested games and ten additional entries have local launch documents in
public/games. They use a small Kkeep loader and lifecycle adapter instead of the
provider's shared advertising SDK. Rewarded breaks return false: rewards are not
fabricated. The source URLs remain in linked-games.ts. Game assets continue to
come from the providers through the existing per-game resource allowlist.

Touch pixel density is capped to 1 in these launch documents. Construct games
keep their runtime on the main thread, with an explicit base and at most two job
workers. Existing game controls and physics remain unchanged.

Blumgi Splash, Astro Survivors and Neon Swing also use local launch documents.
Stacky Dash, Mob Control and Mountain Bike Xtreme still use their existing
external players; their advertising/branding cleanup is not verified.
Idle Coffee Shop 3D was not added: the supplied URL expires and the stable host
launcher has a host-controlled branding/launch policy. No launch token is stored.

Validation: TypeScript and 22 existing game delivery tests passed. Local Kkeep
loader UI was observed. The managed browser lacks WebGL, and the preview resource
fetch returned a provider asset failure, so gameplay and physical iPad performance
remain unverified pending production checks. Haystack's original provider player
was observed reaching gameplay in the connected browser.

Production checks: Haystack, Blumgi Bloom, Longcat, Apple Worm, Drift Boss,
Jumping Shell, Murder and Unicycle Hero reached their game screens. The initial
worker origin issue was corrected with scoped blob worker launchers while keeping
the save-frame sandbox. Unity launch documents now use the source Build folder.
Sandtris still displays black; Hotel and Red Ball 4 reject startup in the testing
browser. These three need further verification and must not be described as working.
iPad desktop-mode detection is normalized only inside these local game frames
so older engines select their existing mobile control layouts. No physical iPad
performance or full ad-free gameplay certification has been completed.
