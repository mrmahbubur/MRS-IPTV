# M R S IPTV — Real Player Redesign Prompt

Nov 7, 2026 · @shahin

## How to use

Paste the prompt below into your AI Studio chat for this app, send it once, then test on your phone.

1. Open your app in Google AI Studio (the `aistudio.google.com/apps/ff57` project).
2. Copy the whole prompt from the code block in "Paste-ready AI Studio prompt" and send it.
3. Reload the live site, check the test list at the end of the prompt, and use the patch prompts if anything breaks.

I could not see the running app (it renders only with JavaScript), so this is written from your screenshot and the site's meta tags. The prompt tells AI Studio to read its own code first and keep every existing feature.

## What the screenshot shows

Seven layout problems make the player feel like a web page instead of a real TV player; the redesign fixes each one.

| Problem in the screenshot | Fix in the redesign |
| --- | --- |
| "CONNECTING LIVE STREAM" is cut off and the NEXT/PREV swipe panel covers the CH+ button | Swipe hint becomes a thin edge handle; status text gets its own centered row |
| Channel title wraps one word per line ("T / Sports / 7 HD") because the LIVE TV badge sits beside it | Title gets the full row, badge moves above it, description gets two lines |
| CH-, CH+, 1h VIP and play controls repeat in the top bar, info card and bottom bar | One control zone per job: top = status, center = player, bottom = one dock |
| Bottom bar overflows ("Line 1" cut off) | Scrollable dock with a fade edge, plus a "More" sheet for rare settings |
| Black video area with no logo or loading graphic | Channel logo watermark, "searching signal" animation and a TV-style channel banner |
| Seven buttons crammed in the top bar | Three icons plus a menu; the rest move into the menu sheet |
| Heavy gold borders and glow compete with the video | Dark glass panels, thin 1px borders, glow only on the focused item |

## Paste-ready AI Studio prompt

Copy everything in the box below and send it in your AI Studio chat.

```text
ROLE
You are a senior front-end engineer and UI designer. Update my existing app 'M R S IPTV' (live sports and TV streaming, mobile-first, Android-style). Read the full current code first. Do NOT rewrite from scratch and do NOT remove or rename any existing feature, data flow, storage key or setting. Change only the visual theme and layout, and add the instruction system described below.

GOAL
Make the player look and behave like a real premium TV player (Android TV / set-top box feel) with realistic graphics, while everything that works today keeps working.

KEEP UNCHANGED (functionality)
- Real-time M3U playlist processing, direct m3u8 playback, Camellia Stream Doctor, Line 1/2/... source switching with AUTO mode, TV mode navigation (remote/D-pad keys), channel numbers (CH 001...), favorites star, lock, 1h VIP timer, TV Guide (1500 channels), aspect ratio switch (16:9 etc.), volume, play/pause, prev/next, swipe up/down for next/prev channel.
- Same URLs, API calls, storage keys, meta tags and the Monetag script tag.

DESIGN SYSTEM: 'Midnight Broadcast'
- Colors: base #050816 (keep theme-color). Panels = dark glass rgba(12,18,40,0.72) with backdrop-filter blur(16px) and 1px border rgba(255,255,255,0.08). Accents: gold #F5B301 for active/focus, cyan #22B8F0 for info, red #FF3B4E for LIVE/error, green #2ECC71 for signal OK. Text white 92%, secondary white 60%.
- Type: Inter or system sans for UI; a tabular, technical face (Rajdhani or Orbitron style) only for the channel number. Titles 20px/700, meta 13px/500. Never let a title wrap one word per line: give titles the full row, min-width:0, 2-line clamp.
- Radius 14px panels, 12px buttons, pill chips. Glow only on the focused or active item. Touch targets at least 44px. Respect safe-area insets. Must work in portrait and landscape.

LAYOUT (portrait)
1. Top status bar (48px, overlays video, auto-hides after 4s): back button, small channel logo + 'CH 001', LIVE chip with pulsing red dot, signal-bars icon, clock, and ONE menu button that opens a 'More' bottom sheet (Favorites, Lock, 1h VIP, Aspect ratio, Line/Quality, Settings, Help & Instructions).
2. Video stage in the chosen aspect ratio with a real-TV look: black letterbox, soft inner vignette, thin glass highlight on the top edge. With no picture yet: faint channel-logo watermark, an animated 'searching signal' arc pulse, and the text 'Connecting to live stream...' on its own centered row that no other element may overlap. While playing: small logo watermark top-right at 60% opacity.
3. OSD channel banner on every channel change (shows 4s, then fades), bottom of the video: large gold channel-number box (CH 001), channel logo, channel name (1 line, ellipsis), LIVE chip, Now/Next line with progress bar (use EPG data if the app has it, otherwise category + country), and 'Line 1 . HD . AUTO' with signal bars.
4. Center transport (appears on tap, hides after 3s): prev channel, a large 64px glossy round play/pause button with pressed state, next channel. No seek bar (live stream).
5. Channel info card under the video (replaces the current gold-bordered box): row 1 chips (LIVE TV, category, HD); row 2 channel title (max 2 lines); row 3 description (2-line clamp); row 4 two buttons: 'TV Guide (1500)' and 'Channels'. Do NOT repeat CH-/CH+/play buttons here.
6. Bottom control dock, ONE row, horizontally scrollable with a fade edge, above the safe area: Play/Pause, CH-, CH+, Volume (icon + popup slider showing %), Aspect ratio, Line selector (shows 'Line 1' with AUTO toggle), Favorite, 1h VIP, More. Active item = gold underline + glow. Add a press ripple. Nothing may be cut off.
7. Swipe up = next, swipe down = prev (keep). Replace the big NEXT/PREV panel with a slim 24px swipe hint on the right edge (up arrow = NEXT, down arrow = PREV). Show it ONLY when the site is opened: display it right after the player loads, keep it about 4 seconds (or until the first swipe or tap), then fade it out and do not show it again until the site is opened the next time. Never show it while swiping, on channel change, or at any other moment. It must never cover any control.

TV GUIDE AND CHANNEL LIST
- Bottom sheet at 85% height with drag handle, search box, category chips (All, Sports, Bangladeshi, News, Movies, Kids, Favorites) and a virtualized list so all 1500 channels scroll smoothly. Row = number, logo (fallback: rounded gradient tile with initials), name, now playing, live dot, heart. Current channel row has a gold left bar. Shimmer skeleton while loading.
- If the app already has EPG data, add a grid toggle: time ruler on top, channel column on the left, programme cells, red 'now' line. If it has no EPG data, skip the grid.

REALISTIC GRAPHICS (pure CSS/SVG/canvas, no new image downloads)
- Glossy buttons (top-shine gradient), glass panels with inner shadow, a 3% SVG noise texture on panels, animated signal bars, pulsing LIVE dot, equalizer bars while audio plays, a gradient-stroke buffering ring, and a 600ms TV-static canvas flash on channel switch for a real zapping feel.
- Channel logos come from the playlist (tvg-logo) only; use the generated tile as fallback. Do not add third-party brand logos.
- Transitions 180-240ms ease-out. Respect prefers-reduced-motion.

INSTRUCTIONS INSIDE THE APP (add to the existing system)
Rule for all help text: read the current code and describe how each feature ACTUALLY works. Do not invent features.
a) First-launch coach marks, shown once (save a flag in localStorage key 'mrs_onboarding_v2'): 5 steps highlighting swipe up/down to change channel, tap the screen for controls, TV Guide, Line/AUTO switch, and the More menu. Buttons: Next and Skip. Progress dots.
b) A 'Help & Instructions' entry in the More menu that opens a full-screen sheet with these sections: Getting started; Changing channels (swipe, CH+/CH-, typing a number); Sources and AUTO line (what Line 1/2 mean, when AUTO switches, what Camellia Stream Doctor does); Favorites and Lock; 1h VIP (how it starts, what happens when it ends, how to renew); TV mode and remote keys; Aspect ratio and volume; Troubleshooting (buffering, black screen, stuck on 'Connecting live stream' -> switch line, refresh playlist, check internet, clear cache); Support/contact. Include a shortcuts table (arrow keys navigate, OK selects, Back, number keys jump to a channel, Channel Up/Down keys, Menu key).
c) Contextual tips: if a stream fails to start within 10s, show a non-blocking toast with 'Try next line' and 'Run Stream Doctor'. The first time 1h VIP expires, show how to renew it.

NUMERIC CHANNEL INPUT
Typing digits on a keyboard/remote or an on-screen number pad shows a 'CH 0__' overlay. After 2s of no input, or on OK, jump to that channel.

ACCESSIBILITY AND PERFORMANCE
Visible 2px gold focus ring for TV mode, aria-labels on every icon button, contrast at least 4.5:1, no layout shift, lazy-loaded logos, muted-start fallback with an unmute button if autoplay is blocked.

DELIVERABLE
Apply the changes directly in the existing project files. Then list what changed in at most 8 bullets and confirm these still work: m3u8 playback, Line switch + AUTO, Stream Doctor, favorites, lock, 1h VIP, TV Guide search across 1500 channels, swipe next/prev, volume, aspect ratio, TV mode keys, Monetag tag intact, portrait and landscape layouts.
```

## Patch prompts if something breaks

Send one of these as a follow-up in AI Studio; each is short and fixes one problem.

| Symptom | Prompt to send |
| --- | --- |
| Playback or Line switching stopped working | The redesign broke playback. Restore the original stream logic (m3u8 loading, Camellia Stream Doctor, Line switching, AUTO) exactly as it was, and re-apply only the visual changes on top of it. |
| Buttons overlap or are cut off on a small phone | On a 360px-wide phone, check the top bar, OSD banner, info card and bottom dock for overlapping or cut-off elements and fix them without removing any control. |
| TV Guide is slow with 1500 channels | Virtualize the channel list so only visible rows render, debounce search by 200ms, and lazy-load logos. |
| Help text says something the app does not do | Re-read the code and correct the Help & Instructions text so every statement matches real behavior; delete anything the app does not do. |
| Too much gold or glow | Reduce glow and gold. Use gold only for the active or focused item and keep other borders at 1px white 8%. |
| Landscape layout looks wrong | In landscape, make the video fill the height, move the channel list to a right-side panel, and keep the dock as a slim overlay that auto-hides. |
