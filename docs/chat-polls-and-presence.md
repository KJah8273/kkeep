# Kkeep Chat polls, members, and profile frames

## Timed polls

Open **Chat**, choose **polls**, and select **Create poll**. Enter a question and two to ten different options, choose single-choice or multiple-choice voting, and set a duration or custom closing date and time. The date field uses the visitor's local timezone; the API stores one absolute closing time.

Poll creation follows the channel's existing posting permissions. The owner and roles with **Manage channels** can create polls in the default read-only polls channel. Members who can post in an ordinary public channel can create a poll there. Polls are not available in direct messages.

Read-only channel settings do not prevent voting. A signed-in, enrolled Chat member who is not banned or timed out can vote in an active public poll. Visitors can read the question and results but must sign in before voting. Each account has one ballot per poll. Changing the selection replaces that ballot, and removing the vote clears it; retries cannot add duplicate votes.

Result cards show each option, its count, a percentage bar, and a checkmark for the current member's selected answers. Single-choice percentages use the number of voters. Multiple-choice percentages also use the number of voters, so the sum can exceed 100% when people choose more than one answer. The card identifies multiple-choice polls and shows the participant total.

The closing time is enforced on the server. Closed polls retain their results and no longer accept vote changes. No scheduled task or open browser is needed to end a poll. A poll's creator or a member with the current **Manage channels** permission can end it early. The owner can also remove the poll message using the existing message controls. Archived channels and deleted poll messages cannot accept votes.

Questions are limited to 240 characters and options to 100 characters each. Closing times can be up to 30 days ahead. The interface starts duration presets at one minute; the API allows a small submission margin for a nearby custom closing time. Once created, a poll's question, options, and voting mode remain fixed so votes retain their meaning.

## Online and offline members

Public channels have a member sidebar grouped into **Online** and **Offline**, with counts. On smaller screens, use the member control in the channel header to open the list. Clicking a member opens the same public profile card used by Chat and friends, including their photo, decoration, colors, nameplate, frame, and role badges.

Presence means activity in Kkeep Chat. An authenticated Chat tab sends a heartbeat approximately every 30 seconds while visible. A lease expires after 90 seconds without a refresh, so a dropped connection cannot leave someone online indefinitely. Separate tabs have separate leases; closing or hiding one tab does not mark a member offline while another tab remains active.

Presence responses contain public profile details and online/offline status. They do not disclose session identifiers, network addresses, or exact last-seen times. The roster and counts respect the signed-in member's block relationships and exclude banned accounts. Guests can see the public member list but do not appear as named members. Large lists are paginated rather than loading every profile at once.

## More profile styles

The profile editor adds a **Profile frame** choice alongside **Avatar decoration** and **Nameplate**. A frame surrounds the full profile card; an avatar decoration follows the member's photo; a nameplate decorates the compact identity strip. These are independent choices and can be combined with photo or animated GIF avatars and banners.

The expanded selection uses original transparent vector artwork based on the supplied reference screenshots. Artwork preserves the avatar center and keeps text and controls usable. Reduced-motion preferences disable decorative animation. Saved frames and styles are included in public profile responses and appear in the editor preview and other members' profile views.

## Data and access

Polls, options, ballots, and presence leases are stored in the existing D1 database. Poll updates have a separate cursor alongside ordinary message events, allowing the existing message refresh to update counts without generating new-message notices for every vote. Presence refresh pauses with hidden tabs and uses bounded leases.

The API checks the current authenticated account, participation restrictions, channel visibility, and applicable role permissions at the database write. Poll choices are validated against the target poll. The schema migration only appends tables, indexes, and the profile-frame column; it does not insert test accounts or messages into production.
