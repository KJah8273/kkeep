# Kkeep Chat profiles and moderation

## Profile customization

Open Profile, then **Edit photo and profile**, or use the profile settings button at the bottom of Chat. The editor has a live preview and explicit Save and Reset controls.

Members can set a display name, account username, name color, photo or animated GIF avatar, photo or animated GIF banner, two profile colors, and an About me description. They can also choose an avatar decoration, a nameplate background, and a frame around the full profile card. Decorations preserve the center of the avatar, and reduced-motion preferences disable decorative animation.

The same saved appearance is used in messages, friends, direct-message lists, member management, and the public profile card. Clicking a member's photo or name opens their profile. The compact nameplate is separate from the full profile banner.

The username is the account's login handle. Existing Kkeep normalization applies: letters are normalized and lowercased, and spaces, periods, underscores, and hyphens are ignored. The editor shows this separately from the display name. Renaming keeps the account ID, password, sessions, friends, roles, saved progress, and moderation state. A taken username or conflicting edit on another device returns an error without changing the username. Username-change attempts are rate limited.

## Visitors and signed-in members

Anyone can read active public channels and view public Chat profiles and their saved media. Visitors see a sign-in prompt in place of the message composer. Posting, friend requests, direct messages, profile changes, and moderation require a Kkeep account; a new account joins Chat before participating.

Direct messages remain available only to the two participants with an accepted friendship. A moderation role does not grant access to another person's direct messages. Blocks and archived-channel restrictions continue to apply on the server.

## Owner controls

The existing account selected by the site owner is linked to ownership using its immutable account ID. Its initial canonical login username is `owner`. Display names and subsequent username changes do not grant or remove ownership. The reserved `owner` handle cannot be registered by another account.

Ownership is stored in `kkeep_chat_owner`. The first use links only the exact pre-existing account identified for this Kkeep deployment. On another installation where that account is absent, a verified site-owner session can explicitly link its signed-in Kkeep account through the owner setup flow. A linked installation cannot be claimed by another account.

Open **Server settings** in Chat to manage roles and members. The owner can create, rename, recolor, reorder, and delete roles, and choose which roles each member receives. Role assignments are limited to eight custom roles per member; the installation supports up to fifty custom roles.

### Selectable permissions

| Permission | Result |
| --- | --- |
| Delete messages | Delete another member's message in a public channel when that member is below the moderator's highest role. |
| Timeout members | Apply or remove a temporary participation restriction for members below the moderator's highest role. |
| Ban members | Apply or remove a Chat participation ban for members below the moderator's highest role. |
| Manage channels | Create, rename, and archive channels, and post in read-only channels. |

Role priority ranges from 1 to 9999. A larger number is higher in the hierarchy. Members with equal or higher priority are protected from that moderator's actions. The owner is always protected and retains control over role definitions and assignments. A decorative role can have no permissions.

The Members tab provides role assignment, timeout, remove-timeout, ban, and unban controls as permitted. Timeouts support durations up to 28 days and expire automatically. Moderation dialogs accept an optional reason. Removing a role or permission takes effect in the server authorization checks for subsequent actions.

A practical initial setup is a **Moderator** role with Delete messages and Timeout members, plus a **Developer** role with a distinct color and no moderation permissions. Enable Ban members or Manage channels when the owner wants to delegate those responsibilities.

## Implementation and verification

Profile records, roles, membership, and moderation are stored in D1. Avatars and banners are stored in R2 and validated before publication. PNGs are normalized; GIF validation preserves animation while enforcing file, dimension, frame, and work limits. Uploaded images have versioned URLs. Session credentials, password hashes, and storage keys are never included in public Chat responses.

Permissions and hierarchy are checked in the database statements that perform moderation, message writes, and channel changes. The API also enforces same-origin requests, authenticated identities, bounded inputs, and rate limits. Client controls reflect those permissions, and every write remains subject to server checks.

Database migrations append the new schema without changing earlier migrations. The owner binding is initialized through the narrowly scoped runtime helper, keeping schema migrations free of production account data.

The focused tests cover guest access boundaries, private-message access, owner binding and impersonation, custom roles and hierarchy, moderation and revocation races, profile media, account rename conflicts, and concurrent profile edits. Browser checks use synthetic accounts in the local preview database.
