# HustLevel rebrand
- [ ] Render replacement PNGs from the app SVG, replace Android/doc legacy images, remove unused source PNG and verify colors/sizes.
- [x] Update visible names, metadata, palette, logo and SVG icons without changing data or behavior.
- [x] Verify desktop/iPhone-sized login and signup, metadata, icon serving and five existing routing/timer tests; preserve stored names, keys, URLs and Android signing/application identifiers. Signed-in appearance not verified: no requesting-user account/session available.

## Previous rebrand
- [x] Rename user-facing app names without changing the coach program.
- [x] Generate and install logo and all icon sizes.
- [x] Verify names, icon sizes, login and signup in the live app; verify Training logo and preserved program name in source. Signed-in visual check unavailable without a preview session.

## Exercise demo videos
- [x] Create read-only exercise media and add the 19 supplied demos; verify RLS and explicit read-only grants.
- [x] Add shared video sheet, session thumbnails, and separate Training play controls.
- [x] Verify player loads, closing removes iframe, row navigation, and missing-media/mobile layouts using isolated browser fixtures; app builds successfully. Real-account checks unavailable without a preview sign-in.

## Timers + Chat
- [x] Timer suite (7 types) with Select Timer sheet, mini timer, Training entry.
- [x] Chat schema, privacy rules, media storage, live updates, unread badge.
- [x] Chat list, DMs, conversation screen, reactions, unsend, workout posts, share toggle.
- [x] Tested with test accounts, then deleted them.
