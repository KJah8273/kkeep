# Wallpaper / Profile update

Existing project and deployment identity retained. Baseline commit: 65c98682cfca82f74d4fff1a963cd5b16b1e4d5f (version 131).

- Removed visible Settings and customization entry points. Wallpaper opens a thumbnail-only gallery, preserving the current choice, local uploads, and original assets.
- Profile uses a required Arabic/English username and password; server-side profanity checks and normalized uniqueness, bcrypt cost 12, hashed random sessions, Secure/HttpOnly/SameSite cookies, same-origin API guards, and atomic rate limits.
- Appearance snapshot is versioned and allowlisted. New devices read the saved snapshot before writing; optimistic revisions reject stale writes. The selected uploaded wallpaper is backed up privately in R2 before its snapshot is committed (8 account media IDs maximum). Existing local media is retained.
- Kkeep browser items become account-owned. Hgola backups are adopted only when the account has none; existing account backups are not replaced by adoption. Cross-device Hgola restoration occurs before Unity mounts an empty local filesystem. A detected switch between accounts with conflicting local progress disables automatic backup; no local save is deleted.
- Third-party cookies, passwords, login sessions, and arbitrary cross-origin game saves are not exported or restored. There is no password-recovery service; no email address is collected.
- Uploaded media has size, type and binary-signature checks, account ownership, and private responses. SVG/HTML imports are not accepted.

## Hgola loading

The reported 90% screenshot does not identify the exact device-side failure. Added bounded IndexedDB open/sync checks to prevent a silent, permanent storage wait, preserving all existing database names/paths. Temporary play is an explicit recovery button, uses an in-memory /idbfs directory, and never mounts or overwrites the saved database. It does not save progress. Original game binary and assets remain unchanged. No 15-second or physical-iPad gameplay claim.

## Verification

Automated tests cover real SQLite account creation/login/restore, password hashing, isolation, logout, stale writes, rate limits, username filtering, file authorization/signatures, and storage timeout recovery. Existing route/proxy regression tests remain; baseline hashes updated only for explicitly changed API integration/player files. TypeScript checked. Chrome managed preview checked for wallpaper selection, persistence, image-only gallery and minimal Profile form. Auth backend tested separately; preview is HTTP and cannot verify production Secure-cookie browser login. Physical iPad / full Unity gameplay not verified.

## Rollback

Redeploy saved version 131 to revert the interface and startup additions. Keep the additive account/profile tables and private media: rollback must not delete user data. No existing migration, service worker, proxy transport, game binary or manifest identity was replaced.
