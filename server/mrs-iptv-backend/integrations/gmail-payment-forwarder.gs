/**
 * Skrill + Payoneer receipts → your backend ledger.
 *
 * Skrill and Payoneer have no public API for personal receiving accounts, but both e-mail
 * you every time money arrives. This script runs inside the Gmail account that receives
 * those e-mails and forwards each one to  POST /api/ingest/email.
 *
 * Security: it only reports `dkimPass: true` when GOOGLE's own Authentication-Results header
 * says the message passed DKIM for skrill.com / payoneer.com. The backend ALSO re-checks the
 * sender domain. A forged "you received $12" e-mail therefore never enters the ledger.
 *
 * SETUP (5 minutes)
 *  1. Open https://script.google.com while signed in to the Gmail account that gets the receipts → New project.
 *  2. Paste this file. Fill ENDPOINT and INGEST_KEY below.
 *  3. Run `pollPayments` once and accept the permissions.
 *  4. Triggers (clock icon) → Add trigger → pollPayments → Time-driven → Minutes timer → Every minute.
 */
const ENDPOINT = 'https://YOUR-BACKEND-URL/api/ingest/email';
const INGEST_KEY = 'PASTE_THE_SAME_INGEST_KEY_AS_IN_YOUR_BACKEND_ENV';
const LABEL = 'mrs-processed';

function pollPayments() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search(`(from:skrill.com OR from:payoneer.com) newer_than:3d -label:${LABEL}`, 0, 25);

  threads.forEach((thread) => {
    let finished = true;
    thread.getMessages().forEach((msg) => {
      try {
        const raw = msg.getRawContent();
        const headerBlock = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' '); // unfold
        // Only trust the Authentication-Results added by Google (topmost, authserv-id mx.google.com).
        const auth = (headerBlock.match(/^Authentication-Results:\s*mx\.google\.com;(.*)$/im) || [, ''])[1];
        const dkimPass = /dkim=pass/i.test(auth) && /header\.(?:i|d)=@?(?:[\w.-]*\.)?(?:skrill|payoneer)\.com/i.test(auth);

        const res = UrlFetchApp.fetch(ENDPOINT, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ingest-key': INGEST_KEY },
          muteHttpExceptions: true,
          payload: JSON.stringify({
            from: msg.getFrom(),
            subject: msg.getSubject(),
            body: msg.getPlainBody().slice(0, 20000),
            receivedAt: msg.getDate().toISOString(),
            dkimPass,
          }),
        });
        // 2xx = stored, 4xx = permanently refused/unparsed (kept in ingest_log for you to review). Only 5xx retries.
        if (res.getResponseCode() >= 500) finished = false;
      } catch (e) {
        finished = false;
      }
    });
    if (finished) thread.addLabel(label);
  });
}
