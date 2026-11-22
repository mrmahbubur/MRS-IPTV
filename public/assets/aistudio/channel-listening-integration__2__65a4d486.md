# Add a channel-listening panel to Shahin IPTV

## What this adds

A channel guide that can be opened while a channel is playing. Opening the guide **does not pause or mute playback**. Selecting a channel switches the existing player to that channel, updates the “now playing” details, and keeps the audio state where possible. The guide also supports search, categories, favorites, and clear loading/error feedback.

## What is already on the page

The live page currently shows a video player, “Tap to Unmute Live Audio,” a current-channel card (for example, CH 001 / ESPN S2 HD), signal/status information, and swipe-up/down channel switching. Keep those controls. Add the guide as another way to find and switch channels; do not create a second player.

> I can’t change or deploy the hosted site from its URL alone. These are integration instructions for the site’s existing codebase. The exact player and framework cannot be identified from the rendered page, so connect the adapter below to the player already used by the site. Use the real stream URLs and channel data from your authorized backend; the examples intentionally do not invent stream URLs.

---

## 1. Define the channel data contract

Have the existing API or configuration provide one record per channel. Keep stream URLs server-managed and use the same authorization/token rules as the current player.

```js
// Example shape only — replace with the real API response.
{
  id: "channel-001",
  number: 1,
  name: "ESPN S2 HD",
  category: "Sports",
  logo: "/assets/channel-logos/espn-s2.png",
  streamUrl: "<authorized stream URL from your backend>",
  streamType: "hls", // e.g. hls, dash, or whatever the current player supports
  isLive: true,
  audioLanguage: "Original",
  favorite: false
}
```

Do not put private stream credentials in client-side source code or expose an unrestricted playlist endpoint. Validate channel IDs and permissions on the server.

## 1A. Prioritize regional channels using network location

Use **coarse IP geolocation on the server or trusted edge**, not browser GPS. IP location is approximate (VPNs, mobile carriers, and corporate gateways can place a user in the wrong area), so make the region visible and let the user change it. Never block the full channel catalog just because location is unknown.

### Add normalized region tags to channel metadata

Use your own stable region identifiers, not display names or raw geocoder text. For example:

```js
{
  id: "channel-001",
  name: "Example Regional Channel",
  countries: ["BD"],
  regions: ["BD-DHAKA"], // optional narrower match; use your own normalized IDs
  regionalOrder: 10,      // lower number appears first within its match group
  global: false
}
```

A regional channel can have both `countries: ["BD"]` and `regions: ["BD-DHAKA"]`; country-level viewers in Bangladesh still see it if no narrower region is known. Keep this metadata server-side with the channel catalog. Only show channels the user is authorized to watch and that are available to their account/territory.

### Resolve location and sort on the server

Create or extend the existing channel-list endpoint, for example `GET /api/channels`. Resolve the request IP using the hosting platform’s trusted geolocation facility or a maintained IP-geolocation database. If using a CDN header, accept it **only when requests are guaranteed to arrive through that trusted CDN and the origin cannot be reached with a forged header**. Do not trust arbitrary `X-Forwarded-For`, country, or region headers from the public internet. Do not call a random IP-location API from the browser.

Return the ordered channels and only the coarse location needed by the UI. Never return the client IP or raw geolocation-provider response.

```js
// Framework-neutral server-side ordering function.
// location.region is your normalized code (e.g. "BD-DHAKA"); country is ISO 3166-1 alpha-2.
function prioritizeRegionalChannels(allAuthorizedChannels, location) {
  const region = location?.region || null;
  const country = location?.country || null;

  function matchGroup(channel) {
    if (region && channel.regions?.includes(region)) return 0; // exact region first
    if (country && channel.countries?.includes(country)) return 1; // then country-wide
    if (channel.global) return 2; // then global channels
    return 3; // other regional channels remain browseable afterwards
  }

  return [...allAuthorizedChannels].sort((a, b) =>
    matchGroup(a) - matchGroup(b) ||
    (a.regionalOrder ?? 9999) - (b.regionalOrder ?? 9999) ||
    a.number - b.number
  );
}
```

Endpoint behavior should be equivalent to:

```js
// Pseudocode: connect these functions to your actual auth, catalog, and trusted geo provider.
app.get("/api/channels", async (req, res) => {
  const user = await authenticate(req);
  const location = await trustedGeoLookup(req); // { country: "BD", region: "BD-DHAKA" } or null
  const authorized = await getChannelsUserMayWatch(user);
  const channels = prioritizeRegionalChannels(authorized, location);
  res.set("Cache-Control", "private, no-store"); // or a carefully varied private cache
  res.json({
    location: location ? { country: location.country, region: location.region ?? null } : null,
    locationSource: location ? "network-estimate" : "unavailable",
    channels
  });
});
```

Do not cache a personalized ordering in a shared CDN cache unless the cache key safely varies by the trusted resolved region and account authorization. If regional order is computed client-side instead, still have the server return a validated, coarse location result; never accept a client-supplied region as proof of location or access permission.

### User override and fallback

- Put the resolved area in a small label such as **“Channels near Dhaka · Change”**. Add a region/country selector so a user can correct an inaccurate IP estimate or browse another area.
- An explicit user choice should override the IP estimate for ordering. Store it in the account profile if signed in; otherwise store only the chosen normalized region in local storage. It changes display order, **not authorization**.
- If location lookup fails, show the normal curated/global order and a **Choose region** option. Do not delay playback while geolocation runs; load the existing/current channel immediately and fetch/reorder the guide in parallel.
- Use region order only for the guide/“next channel” recommendations. Never silently switch the playing channel when the user’s network/location changes.
- Apply search over the full authorized catalog while retaining the same regional-first ordering among matching results. Favorites may be pinned above regional results if product policy says so; document the precedence.

### Privacy and reliability

IP-derived location is approximate personal data. Disclose its use in the privacy notice, use only country/region-level precision, avoid collecting GPS, and do not persist raw IP/location lookup responses for this feature. Keep routine security logs subject to the site’s existing retention policy. Test VPNs, mobile networks, unknown regions, forged forwarding headers, and users who select a different region. A region choice must never bypass licensing, subscription, or territorial restrictions.

## 2. Add the guide UI beside the existing player

Place a **Channels** button next to the current channel title / player controls. It opens a side panel or bottom sheet. The panel must be a sibling/overlay of the current player—not a replacement for it—so opening the guide does not unmount the video element or destroy the player instance.

```html
<button id="channels-open" type="button" aria-controls="channel-guide" aria-expanded="false">
  Channels
</button>

<section id="channel-guide" role="dialog" aria-modal="true"
         aria-labelledby="channel-guide-title" hidden>
  <header>
    <h2 id="channel-guide-title">Channels</h2>
    <button id="channels-close" type="button" aria-label="Close channels">Close</button>
  </header>
  <label>
    Search channels
    <input id="channel-search" type="search" autocomplete="off" />
  </label>
  <div id="channel-categories" aria-label="Channel categories"></div>
  <p id="channel-guide-status" role="status" aria-live="polite"></p>
  <ul id="channel-list" aria-label="Available channels"></ul>
</section>
```

Each list row should display channel number, logo, name, category, and a **Playing** indicator for the active channel. Use a real `<button>` within each list item so it works with touch, keyboard, and screen readers. Keep the guide scrollable on small screens, provide a visible close button, and return focus to the Channels button when it closes.

## 3. Connect channel changes to the existing player

Use one adapter around the existing player. Do not create a new `<video>` element or initialize a second HLS/DASH player for the guide. Implement the adapter using the player library already in the project.

```js
// Implement this with the site's current player instance.
// Contract: setSource(channel) changes the source on the existing player;
// play() resumes playback if permitted; getState() returns current state.
const playerAdapter = {
  async setSource(channel) {
    // Examples of where to connect:
    // - hls.js: existingHls.loadSource(channel.streamUrl)
    // - native HLS: existingVideo.src = channel.streamUrl
    // - another player: call its existing source/load API
    // Preserve DRM, headers, authorization, and error handling already in use.
    throw new Error("Connect playerAdapter.setSource to the existing player");
  },
  async play() {
    // Call the existing player's play method / existing video.play().
    // Handle autoplay rejection; never force-mute to work around it.
    throw new Error("Connect playerAdapter.play to the existing player");
  },
  getState() {
    // Return at least { muted: boolean, volume: number } from the existing player.
    return { muted: false, volume: 1 };
  }
};
```

If the site uses an existing `<video>` element and **native/HLS.js only**, the adapter might look like this (use only the branch that matches the project; do not add a second HLS instance):

```js
function makeHlsAdapter(video, existingHls) {
  return {
    async setSource(channel) {
      if (existingHls) {
        existingHls.loadSource(channel.streamUrl);
      } else {
        // Native HLS / formats already supported by the site's player.
        video.src = channel.streamUrl;
        video.load();
      }
    },
    async play() {
      // Browsers may reject this until the user has interacted with the page.
      await video.play();
    },
    getState() {
      return { muted: video.muted, volume: video.volume };
    }
  };
}
```

## 4. Add channel selection, search, and “keep listening” behavior

Use the existing channel store/API rather than hard-coding a second channel list. `renderChannels()` below is intentionally small; adapt its styling to the site’s existing components.

```js
const guide = document.querySelector("#channel-guide");
const openButton = document.querySelector("#channels-open");
const closeButton = document.querySelector("#channels-close");
const searchInput = document.querySelector("#channel-search");
const list = document.querySelector("#channel-list");
const status = document.querySelector("#channel-guide-status");

let channels = [];             // Fill from the existing authorized API/store.
let currentChannelId = null;   // Initialize from the current player state.
let switching = false;

function openGuide() {
  guide.hidden = false;
  openButton.setAttribute("aria-expanded", "true");
  searchInput.focus();
  // Important: do not pause, mute, replace, or unmount the existing player here.
}
function closeGuide() {
  guide.hidden = true;
  openButton.setAttribute("aria-expanded", "false");
  openButton.focus();
}
openButton.addEventListener("click", openGuide);
closeButton.addEventListener("click", closeGuide);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !guide.hidden) closeGuide();
});

function renderChannels(query = "") {
  const q = query.trim().toLocaleLowerCase();
  const matches = channels.filter((channel) =>
    `${channel.number} ${channel.name} ${channel.category || ""}`
      .toLocaleLowerCase().includes(q)
  );
  list.replaceChildren();
  for (const channel of matches) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.channelId = channel.id;
    button.setAttribute("aria-current", String(channel.id === currentChannelId));
    button.textContent = `CH ${String(channel.number).padStart(3, "0")} · ${channel.name}`;
    if (channel.id === currentChannelId) button.textContent += " · Playing";
    button.addEventListener("click", () => selectChannel(channel));
    li.append(button);
    list.append(li);
  }
  if (!matches.length) status.textContent = "No matching channels.";
  else if (!switching) status.textContent = `${matches.length} channel${matches.length === 1 ? "" : "s"}`;
}
searchInput.addEventListener("input", () => renderChannels(searchInput.value));

async function selectChannel(channel) {
  if (switching || channel.id === currentChannelId) return;
  switching = true;
  status.textContent = `Connecting to ${channel.name}…`;
  renderChannels(searchInput.value);
  try {
    await playerAdapter.setSource(channel);
    try {
      await playerAdapter.play();
    } catch (error) {
      // The source can still be selected. Browsers sometimes require a fresh
      // user gesture; leave the existing unmute/play control available.
      status.textContent = `Selected ${channel.name}. Tap Play to start audio.`;
    }
    currentChannelId = channel.id;
    updateNowPlaying(channel); // Update the existing channel card and guide state.
    status.textContent = `Now playing ${channel.name}.`;
  } catch (error) {
    status.textContent = `Could not play ${channel.name}. Try again or choose another channel.`;
    reportPlaybackError(error, channel); // Use the site's existing logging/telemetry.
  } finally {
    switching = false;
    renderChannels(searchInput.value);
  }
}

function updateNowPlaying(channel) {
  // Update the existing CH number, channel name, logo, category and LIVE label.
  // Keep this function connected to the site's current UI/store.
}
function reportPlaybackError(error, channel) {
  // Connect to existing diagnostics; avoid logging signed stream URLs/tokens.
}
```

### Important production adjustment

The sample sets `currentChannelId` after the adapter accepts the new source. In production, prefer the existing player’s `playing` / `loadedmetadata` / error events to decide when to update the “Playing” badge. A source assignment is not proof that a stream is actually playing. Keep the previous channel visible until the player reports success, and show a retry message if it errors or times out.

## 5. Preserve audio and existing gestures

- Opening/closing the guide must not pause playback or change `muted` / `volume`.
- Selecting another channel should retain the player’s current volume and mute state unless the user explicitly changes it.
- Keep the existing “Tap to Unmute Live Audio” button. Browsers block audible autoplay until a user gesture; do not try to bypass that rule. If `play()` is rejected, show a clear “Tap to play/unmute” action.
- Keep swipe-up/down channel switching. Route swipes and guide selections through the same `selectChannel()` function so loading, errors, active-channel state, and analytics behave consistently.
- Do not promise background or lock-screen playback unless the current browser, OS, stream, and product requirements have been tested for it. Opening an in-page guide is different from background audio.

## 6. Loading, error, accessibility, and safety requirements

1. Show a loading state during channel changes and prevent repeated taps until the player settles.
2. On failure, leave a usable retry path and do not mark the failed channel as playing.
3. Avoid exposing signed URLs in visible UI, logs, analytics, or error messages.
4. Support keyboard navigation, focus return, contrast, screen-reader status announcements, and reduced-motion preferences.
5. Test portrait/landscape mobile layouts, slow networks, empty search results, unavailable channels, expired authorization, and browser autoplay rejection.
6. Use the site’s current CDN/CSP/DRM settings and player dependency. Do not add a remote script or replace the existing playback stack without reviewing the project configuration.

## 7. Suggested implementation order

1. Find the current video/player initialization and channel source code in the project.
2. Add the channel-guide button and panel without moving or recreating the player.
3. Load channel metadata from the same source/API as the current channel.
4. Implement `playerAdapter` against the existing player and verify one channel switch first.
5. Connect `selectChannel()` to the guide and to the existing swipe gestures.
6. Update the existing now-playing card from player events; test audio, mute state, errors, and mobile behavior.
7. Deploy to staging, verify authorized streams on supported browsers, then release.

### Acceptance checks

- Opening the channel panel leaves the current video and audio running.
- Selecting an available channel changes the existing player and updates its channel number/name.
- Muted/unmuted state and volume are not unexpectedly reset.
- Swipe switching and panel selection produce consistent results.
- A rejected autoplay or failed stream shows a useful message and does not falsely show “Playing.”
- Search, keyboard controls, touch targets, and close/focus behavior work on mobile and desktop.
