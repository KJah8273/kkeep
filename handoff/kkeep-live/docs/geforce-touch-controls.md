# GeForce NOW touch controls

Kkeep's GeForce launcher now has a Controls button, including in its immersive view. It opens the existing adjustable multitouch controller with a separate saved Call of Duty profile. Enable it before launching the game. In Call of Duty select **Aiming Input Device → Controller** before entering a match; close the provider's own touch overlay if both are visible.

- Two analog sticks, independent hold-to-aim/fire, all face buttons, shoulders, D-pad, stick clicks and menu buttons.
- Call of Duty labels follow its default controller mapping. Customized game bindings can differ. Reload is also the default interact button; long presses are preserved.
- Settings support size, opacity, deadzone, handedness and moving groups. Kkeep's fullscreen keeps the overlay visible; video-only fullscreen cannot contain outside controls.
- Hide, removal, backgrounding, page changes and lost pointer capture release input. Removing controls disconnects the virtual pad. Physical devices retain their native slots.

`lib/geforce/touch-input.mjs` installs an initially inactive getGamepads adapter during the isolated engine's init.post hook, before upstream application scripts start. Cached reader references continue to work after the visitor enables Controls. Only `https://play.geforcenow.com` documents are eligible. Permission-denied APIs remain denied; authentication pages are not patched. Xbox generation explicitly excludes the new hook. No input values are sent to analytics or logged.

The UI only says the player is reading controls when the page actually calls the reader; this is not confirmation that a remote game has accepted input. Automated tests cover cached readers, simultaneous inputs, physical-device slots, neutral release, document replacement, permissions, launch lifecycle and engine isolation. Live iPad/Safari and Call of Duty gameplay still require testing with an active user session; there is no claim of end-to-end gameplay verification.

## Stick-only movement fix — 2026-10-07

The v76 adapter exposed `createPad`'s mutable axes array. GeForce's current standard-gamepad encoder retains that array in its previous sample and compares axis values before sending a packet. Mutating the retained array made stick-only movement, turning and release look unchanged. A trigger/button change could still force a packet, matching the report of movement working only while firing.

The GeForce adapter now publishes independent, frozen input arrays. Unchanged axes/buttons retain their references, but changed values get new arrays; previous samples and timestamps remain intact. No fire press is generated to force movement. Other cloud adapters and their saved controls are unchanged. The GeForce controller script URL revision is incremented for returning clients.

The optional `KKEEP_GFN_VENDOR=/absolute/path/to/vendor.js node --test tests/proxy-geforce-sdk.test.mjs` check extracts the real standard-gamepad encoder, sample comparison and poll method from the downloaded public vendor bundle. It verifies movement, both sticks, fire/release, continued movement after firing, neutral release and idle deduplication. The provider bundle is neither committed nor deployed. The bundle inspected for this fix was `https://play.geforcenow.com/mall/vendor.426171c5aff8984e.js`.

Official references:
- https://nvidia.custhelp.com/app/answers/detail/a_id/4513/ (connect before starting the game)
- https://www.callofduty.com/guides/blackops6/training/call-of-duty-guides-black-ops-6-multiplayer-training-controls (choose aiming device before a match)
