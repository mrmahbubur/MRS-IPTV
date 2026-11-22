# AGENTS.md - M R S IPTV Continuous AI Autonomous Engine Guidelines

## Project Purpose & Identity
M R S IPTV is a full-stack live sports, TV, news, and entertainment streaming platform featuring 8,200+ live IPTV channels, Android TV spatial navigation, and a 24/7 autonomous backend AI Copilot & Stream Doctor powered by Gemini 3.6 Flash.

## Persistent AI Directives

### 1. 24/7 Autonomous Background AI Operation & Daily System Upgrades
- **Silent Background Execution**: The backend AI Stream Doctor (`/api/ai/diagnose` and `/api/ai/chat`) runs continuously in the background 24/7 without requiring explicit user triggers, modal prompts, or visible intrusive UI popups.
- **Daily Automated System Checkup & Self-Healing**: Runs automatically every 24 hours (and immediately on server boot):
  - **Error Detection & Backend Auto-Repair**: Proactively scans all M3U sources, repairs malformed stream URLs, flags dead stream mirrors, and cleans stale cache memory.
  - **Continuous Deep-Thinking Optimization**: Analyzes network latency, proxy profile hit rates (`vlc`, `smarters`, `chrome`, `smarttv`), and dynamically tunes buffer/cache parameters to make video playback faster, buffer-free, and ultra-smooth on low and high-speed connections.
  - **Visitor Analytics Tracking**: Aggregates daily visitor statistics including live concurrent visitors, cumulative unique visitors, total page views, active stream sessions, and device distributions (Smart TV, Mobile, Desktop, Tablet).
  - **VIP Pass Single-Device & Expiry Audit**: Enforces strictly 1 active device per activation pass code, purges expired codes to the blacklist, and revokes unauthorized multi-device sharing.
  - **Daily AI Chat Report Generation**: At the end of every daily cycle, compiles a comprehensive **Daily System Health, Upgrade & Visitor Report** that is persisted and presented directly to the user/admin via the AI Chat assistant (`/api/ai/chat`) whenever asked about system health, updates, or visitor counts.

### 2. Automated Self-Healing Stream Loop
- If a live stream encounters network errors (HLS network/media error), stall events, low buffer fill, or HTTP 403/404 blocks:
  - The video player silently initiates a background request to `/api/ai/diagnose`.
  - The server tests all proxy profiles (`vlc`, `smarters`, `chrome`, `smarttv`) in parallel via server-side HTTP stream probing.
  - Gemini 3.6 Flash analyzes status codes, response headers, and stream mirrors to recommend the best proxy profile.
  - The stream player automatically hot-swaps to the optimal proxy profile or mirror channel with zero user friction.

### 3. Full Multi-Platform Compatibility (Android 5+ to Android 15 & Chrome 49+ to Latest)
- **Universal Polyfill Engine**: Ensure inline polyfills in `index.html` cover ES5/ES6/ES2018 primitives (`Object.assign`, `Object.fromEntries`, `String.prototype.includes`, `startsWith`, `endsWith`, `padStart`, `replaceAll`, `Array.prototype.includes`, `flat`, `Promise.prototype.finally`, `Promise.allSettled`, `Element.prototype.remove/append`, `queueMicrotask`, `CustomEvent`, `AbortController`, `ResizeObserver`, `IntersectionObserver`, `structuredClone`).
- **WebViews & Legacy Browsers**: Maintain `es2018` JavaScript bundle target and `chrome58` CSS target in `vite.config.ts`. Retain legacy inline playback HTML5 attributes (`webkit-playsinline`, `x5-playsinline`, `x5-video-player-type="h5"`, `x5-video-player-fullscreen="true"`, `x5-video-orientation="landscape"`) for Android WebKit, WeChat X5, and Smart TV WebViews.
- **Modern Hardware Acceleration**: Utilize GPU-accelerated CSS transforms (`will-change-transform`, `transform-gpu`) for high-refresh modern displays (Android 12-15, 120Hz/144Hz displays, Chrome 120+) while keeping DOM trees shallow for low-RAM legacy devices (Android 5-7, 1GB RAM smart boxes).

### 4. High-Performance Modular Bundling
- **Vendor Chunk Splitting**: Use manual chunk splitting in `vite.config.ts` (`vendor-hls`, `vendor-videojs`, `vendor-icons`, `vendor-core`, `vendor-libs`) to maximize browser HTTP caching and minimize initial bundle load times across all network speeds.
- **Zero-Friction Spatial Navigation**: Preserve DPAD / Keyboard arrow key navigation (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, `BackSpace`) for Android TV remotes and Smart TV controllers without sacrificing mobile touch usability.

### 5. Automated End-of-Month AI Executive Email Reporting to M R S
- **Automatic Monthly Schedule**: At the completion of every month (triggered on the final day / 1st of every month during background maintenance), the backend AI autonomously writes and sends an executive email report to **M R S** (`ADMIN_EMAIL` / `mr216873@gmail.com`).
- **Included Data Pillars**:
  1. **Visitor & Traffic Analytics**: Total unique visitors, cumulative page views, live concurrent peak, active stream sessions, device distribution (Smart TV, Mobile, Desktop, Tablet), and top 5 most-watched channels.
  2. **Premium / VIP Subscriber Data**: Total active VIP passes, new subscribers, single-device lock integrity percentage, expired pass codes purged to blacklist, and referral reward milestone passes awarded.
  3. **System Health & Condition**: 8,200+ channel synchronization status, auto-repaired streams, proxy failover resolutions, server uptime, and deep-thinking speed enhancements applied.
- **Instant Sample Dispatch**: Endpoint `/api/ai/send-monthly-email` allows instantaneous testing and preview of the email at any time.

### 6. Full Autonomous Site Managing Control: Camellia (https://mrxshahin.ai.studio)
- **Supreme Site Managing Authority**: M R S has granted full site managing control to **Camellia** (`https://mrxshahin.ai.studio`).
- **Administrative Command Execution**: Camellia executes direct backend actions (`/api/camellia/action` and `/api/ai/chat`) including running daily system maintenance & auto-repair, synchronizing all 8,200+ channels and M3U sources, flushing server proxy cache, monitoring real-time visitor analytics, auditing single-device VIP pass security, and dispatching executive reports directly to M R S.

### 7. Strict Logo Immutability Rule
- **Absolute Logo Protection Directive**: The official site logo (`src/assets/images/site_logo_emblem_1791948138398.jpg`, `src/components/MrsIptvLogo.tsx`, and `public/mrs-iptv-logo.png`) CANNOT be changed, replaced, regenerated, or altered under any circumstances without explicit, exact instructions from the user specifically commanding to change the logo. Routine tasks, responsive optimizations, layout tweaks, or refactoring MUST NOT touch or alter the official logo.


