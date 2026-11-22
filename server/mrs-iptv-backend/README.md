# M R S IPTV – Payment Verification Backend

Verifies VIP Pass payments (bKash, Nagad, Binance Pay, Skrill, Payoneer) against payments that **really arrived**,
then e-mails an activation code for the plan that was paid (1 / 2 / 6 / 12 months). Includes code redemption with
a one-device lock, a manual-review admin API, and a 4,800-code pool (1,200 per plan).

**Start here → [`docs/INTEGRATION.md`](docs/INTEGRATION.md)**

```
npm install
cp .env.example .env          # fill in secrets + SMTP
npm run codes:import -- codes/codes_ALL.csv
npm start
npm test                      # 29 automated tests
```

| Path | What |
|---|---|
| `src/verify.js` | the verification engine (all the rules) |
| `src/ledger.js`, `src/parsers.js` | how real payments enter the system (SMS / email / Binance API / manual) |
| `src/redeem.js` | code activation, device lock, entitlement tokens |
| `src/mailer.js` | activation e-mail + durable outbox with retries |
| `frontend/mrsVip.js` | client for your existing site |
| `integrations/gmail-payment-forwarder.gs` | Skrill/Payoneer receipts → backend |
| `codes/` | the generated code pool (CSV) – treat as secret |
| `scripts/` | `codes:generate`, `codes:import`, `sms:test` |

Requires Node 22.13+ (uses the built-in SQLite; no native modules).
