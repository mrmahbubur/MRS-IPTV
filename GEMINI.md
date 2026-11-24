# GEMINI.md - M R S IPTV Autonomous AI Copilot & Stream Engine

## Gemini 3.6 Flash Integration
- **SDK**: `@google/genai` TypeScript SDK using `gemini-3.6-flash`.
- **Server API Endpoints**:
  - `/api/ai/diagnose`: Real-time backend server-side probe that analyzes live IPTV stream health (probes HTTP status codes, CORS headers, User-Agent proxy profiles) and instructs the frontend player to auto-switch proxy profiles for instant self-healing.
  - `/api/ai/chat`: Context-aware streaming assistant capable of guiding users through 8,200+ live channels, sports match schedules (Cricket, Football, F1, IPL), Bangladeshi/Indian/Global TV categories, and playback optimization.
  - `/api/ai/daily-report`: Automated daily system inspection, error repair, deep thinking performance upgrades, and visitor analytics report.
  - `/api/ai/send-monthly-email`: Automated monthly executive email dispatch containing visitor analytics, premium subscriber data, and system condition metrics directly to M R S.
  - `/api/camellia/status`: Live site manager status and capabilities of Camellia (https://mrxshahin.ai.studio).
  - `/api/camellia/action`: Administrative command dispatcher allowing Camellia to run maintenance, flush cache, sync M3U channels, fetch visitor analytics, and dispatch reports.
- **Camellia Autonomous Site Managing Authority**:
  - Full site managing control is granted to **Camellia** (`https://mrxshahin.ai.studio`).
  - Camellia can autonomously or upon interactive request execute platform maintenance, repair broken streams, manage M3U sources, purge proxy cache, and compile executive reports for M R S.
- **24/7 Background Execution Loop**:
  - Runs silently in the backend background without blocking the UI or opening popups.
  - Monitors player buffer health, automatically detects playback stalls/errors on old and new Android/Chrome devices, and dynamically reconfigures player proxy profiles (`vlc`, `smarters`, `chrome`, `smarttv`) to guarantee maximum playback stability.
  - **Daily Automated System Checkup & Upgrades**: Periodically checks and repairs channels, optimizes stream latency for faster and smoother watching, cleans expired activation codes, verifies single-device locks, and records visitor traffic.
  - **Daily Deep-Thinking AI Report**: Uses deep reasoning to formulate system speed/stability improvements and formats a complete daily report accessible in chat and via API.
  - **Live-Only Checker Endpoints**: `/api/checker/status` and `/api/admin/checker/*` continuously probe every configured M3U playlist and stream URL, keeping only verified live channels (`alive`) in the public catalog.
  - **VIP Payment & Activation Endpoints**: `/api/payments/submit`, `/api/activate`, `/api/plans`, `/api/payment-methods`, and `/api/internal/*` (scoped Bearer API keys + HMAC-SHA256 webhooks) power single-use code issuance, verification, and entitlement enforcement.
  - **Cloudinary Media Utility**: `scripts/cloudinary.mjs` (`npm run cloudinary`) manages signed uploads, collection/folder queries, and `data/cloudinary-assets.json` sync via `.env` credentials without touching the official site logo.
  - **Render Production Deployment & Health Telemetry**: Pinned to Node.js `>=22.13.0` (`.node-version` `22.14.0`, `package.json` `engines`, `render.yaml`), automatically enables Express `trust proxy` and `RENDER_EXTERNAL_URL` CORS allowance on Render, and reports platform, Node version, and service readiness via `/api/health`.
- **Strict Logo Immutability Rule**:
  - The official site logo (`src/assets/images/site_logo_emblem_1791948138398.jpg`, `src/components/MrsIptvLogo.tsx`, and `public/mrs-iptv-logo.png`) CANNOT be changed, replaced, or regenerated without explicit, exact instructions from the user specifically commanding to change the logo.

