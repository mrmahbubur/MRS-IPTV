import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { getConfiguredGeminiKey, warmupGeminiDnsIpv4 } from './ai.js';
import { beginAiPriorityWindow, endAiPriorityWindow } from './livecheck/pipeline.js';

const AI_VERIFIER_MODEL = 'gemini-4-hydrogen';

let cachedClient: GoogleGenAI | null = null;
let cachedKey = '';

function getPaymentAiClient(): GoogleGenAI | null {
  const apiKey = getConfiguredGeminiKey();
  if (!apiKey) {
    cachedClient = null;
    cachedKey = '';
    return null;
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
        timeout: 30000,
      },
    });
    cachedKey = apiKey;
  }
  return cachedClient;
}

export interface AiPaymentVerificationContext {
  order: {
    id: number;
    public_id: string;
    plan: string;
    region: string;
    channel: string;
    currency: string;
    expected_minor: number;
    customer_name?: string | null;
    email: string;
    phone: string;
    trx_id?: string | null;
    trx_kind?: string | null;
    screenshot_flags?: string | null;
    created_at: string;
  };
  fileBuffer?: Buffer | null;
  fileMime?: string | null;
  fileName?: string | null;
  channelConfig: {
    id: string;
    label: string;
    currency: string;
    regions: string[];
  };
  planConfig: {
    id: string;
    months: number;
    durationDays: number;
    label: string;
    prices: Record<string, number>;
  };
  receivingAccount: Record<string, any>;
}

export interface AiPaymentVerificationResult {
  deferred?: boolean;
  deferredReason?: string;
  model: string;
  hasDocument: boolean;
  isPaymentDocument: boolean;
  detectedChannel: string;
  channelMatchesSelected: boolean;
  extractedTrxId: string;
  trxIdMatchesInput: boolean;
  trxIdLooksReal: boolean;
  trxIdSimilarityScore: number;
  extractedAmount: number;
  extractedCurrency: string;
  extractedRecipient: string;
  recipientMatchesAccount: boolean;
  extractedTimestamp: string;
  timestampLooksRecent: boolean;
  paymentStatusSuccessful: boolean;
  appearsAuthenticAndUnedited: boolean;
  overallSimilarityScore: number;
  verdict: 'verify' | 'reject' | 'needs_review';
  reasonCode: string;
  summary: string;
}

const CHANNEL_GUIDES: Record<string, string> = {
  bkash:
    'bKash Personal (Bangladesh): Expect a Send Money / Payment mobile screenshot, SMS receipt, or PDF/statement showing bKash branding, amount in BDT/TK/৳, status Successful/Completed, and an 8-10 character uppercase alphanumeric TrxID (e.g. BL84K9M2PQ, 9G7H2K4L1M). Recipient number if visible is usually 01810853282.',
  nagad:
    'Nagad Personal (Bangladesh): Expect a Nagad Send Money mobile screenshot, SMS receipt, or PDF confirmation showing Nagad branding, amount in BDT/TK/৳, status Successful, and an 8-10 character uppercase alphanumeric TxnID/TrxID. Recipient number if visible is usually +8801792322734 or 01792322734.',
  binance:
    'Binance Pay / Crypto: Expect a Binance Pay / C2C / Transfer confirmation screenshot or PDF/email receipt showing USDT/USDC/FDUSD/BUSD/USD amount, Completed/Success status, and a 12-24 digit Binance Order ID (or M_P_... Pay ID) or Binance sender nickname. Recipient UID if visible is 38927942 or Pay ID mrxshahin.',
  skrill:
    'Skrill: Expect a Skrill transfer confirmation screenshot, email receipt, or PDF statement showing USD/$ amount, Processed/Completed/Sent status, and an 8-12 digit Skrill Transaction ID. Recipient Customer ID if visible is 407108385.',
  payoneer:
    'Payoneer: Expect a Payoneer Make a Payment confirmation screenshot, email receipt, or PDF statement showing USD/$ amount, Completed/Pending-Processing/Approved payment status, and a 6-40 character alphanumeric/hyphen Payment ID. Recipient Customer ID if visible is 108003450.',
};

const PAYMENT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isPaymentDocument: {
      type: Type.BOOLEAN,
      description: 'True if an attached image/PDF is genuinely a payment receipt, screenshot, SMS, or financial transfer document (false if unrelated photo or no document).',
    },
    detectedChannel: {
      type: Type.STRING,
      description: 'Detected payment provider from the proof: bkash, nagad, binance, skrill, payoneer, other, or unknown.',
    },
    channelMatchesSelected: {
      type: Type.BOOLEAN,
      description: 'True if the proof and/or Transaction ID format looks consistent with and matches the user selected payment option.',
    },
    extractedTrxId: {
      type: Type.STRING,
      description: 'Exact Transaction ID / Order ID / Payment ID read from the document or validated from input (uppercase, trimmed, empty string if none).',
    },
    trxIdMatchesInput: {
      type: Type.BOOLEAN,
      description: 'True if user did not enter a typed TrxID, OR if typed TrxID matches/closely aligns with the Transaction ID in the document.',
    },
    trxIdLooksReal: {
      type: Type.BOOLEAN,
      description: 'True if the Transaction ID pattern, character entropy, length, and structure look like a real payment reference for the selected payment option rather than a fake/test/sequential string.',
    },
    trxIdSimilarityScore: {
      type: Type.INTEGER,
      description: '0 to 100 similarity & authenticity score for the Transaction ID against real transactions of the selected payment option and document text.',
    },
    extractedAmount: {
      type: Type.NUMBER,
      description: 'Numeric payment amount shown in the document (in major units like 110 or 1 or 12.20), or 0 if no document was attached or amount is not shown.',
    },
    extractedCurrency: {
      type: Type.STRING,
      description: 'Currency shown in the document such as BDT, TK, USD, USDT, or empty string if unknown.',
    },
    extractedRecipient: {
      type: Type.STRING,
      description: 'Recipient number/UID/PayID/email shown on the receipt if visible, otherwise empty string.',
    },
    recipientMatchesAccount: {
      type: Type.BOOLEAN,
      description: 'True if recipient shown on the receipt matches our configured receiving account (or recipient is hidden/masked or TrxID-only); false ONLY if receipt explicitly shows a different person/account.',
    },
    extractedTimestamp: {
      type: Type.STRING,
      description: 'Transaction date and time text visible on the receipt, or empty string if not shown.',
    },
    timestampLooksRecent: {
      type: Type.BOOLEAN,
      description: 'True if the receipt date/time looks recent relative to the order creation timestamp (within ~72 hours) or if no date is visible; false if clearly stale/old or tampered.',
    },
    paymentStatusSuccessful: {
      type: Type.BOOLEAN,
      description: 'True if the payment status appears completed/successful (or no failed/cancelled status exists when TrxID-only is checked).',
    },
    appearsAuthenticAndUnedited: {
      type: Type.BOOLEAN,
      description: 'True if the submission appears realistic, genuine, and free of obvious tampering, mockup templates, or fake placeholder text.',
    },
    overallSimilarityScore: {
      type: Type.INTEGER,
      description: '0 to 100 overall confidence score combining document visual/structural similarity, Transaction ID realism, channel match, and amount consistency.',
    },
    verdict: {
      type: Type.STRING,
      description: 'Must be exactly one of: verify, reject, needs_review.',
    },
    reasonCode: {
      type: Type.STRING,
      description: 'Short snake_case code such as ai_verified, ai_channel_mismatch, ai_trx_mismatch, ai_recipient_mismatch, payment_too_old, underpaid, ai_fake_proof, ai_unverified_document, or ai_needs_review.',
    },
    summary: {
      type: Type.STRING,
      description: 'Clear 1-2 sentence customer-friendly explanation for the payment verification outcome without mentioning AI, bots, prompts, or automated models.',
    },
  },
  required: [
    'isPaymentDocument',
    'detectedChannel',
    'channelMatchesSelected',
    'extractedTrxId',
    'trxIdMatchesInput',
    'trxIdLooksReal',
    'trxIdSimilarityScore',
    'extractedAmount',
    'extractedCurrency',
    'extractedRecipient',
    'recipientMatchesAccount',
    'extractedTimestamp',
    'timestampLooksRecent',
    'paymentStatusSuccessful',
    'appearsAuthenticAndUnedited',
    'overallSimilarityScore',
    'verdict',
    'reasonCode',
    'summary',
  ],
};

function isQuotaOrRateLimitError(err: any): boolean {
  const status = err?.status || err?.code || err?.error?.code;
  const msg = String(err?.message || err?.error?.message || '').toLowerCase();
  return (
    status === 429 ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate-limit') ||
    msg.includes('rate limit')
  );
}

function isTransientNetworkError(err: any): boolean {
  const status = err?.status || err?.code || err?.error?.code;
  const causeCode = String(err?.cause?.code || '').toUpperCase();
  const msg = String(err?.message || err?.cause?.message || '').toLowerCase();
  return (
    status === 408 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('socket') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('unavailable') ||
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET'].includes(causeCode)
  );
}

export async function verifyPaymentWithAi(ctx: AiPaymentVerificationContext): Promise<AiPaymentVerificationResult> {
  const hasDocument = Boolean(ctx.fileBuffer && ctx.fileBuffer.length > 0 && ctx.fileMime);
  const client = getPaymentAiClient();

  if (!client) {
    return {
      deferred: true,
      deferredReason: 'ai_key_missing',
      model: AI_VERIFIER_MODEL,
      hasDocument,
      isPaymentDocument: false,
      detectedChannel: 'unknown',
      channelMatchesSelected: false,
      extractedTrxId: String(ctx.order.trx_id || ''),
      trxIdMatchesInput: false,
      trxIdLooksReal: false,
      trxIdSimilarityScore: 0,
      extractedAmount: 0,
      extractedCurrency: '',
      extractedRecipient: '',
      recipientMatchesAccount: true,
      extractedTimestamp: '',
      timestampLooksRecent: true,
      paymentStatusSuccessful: false,
      appearsAuthenticAndUnedited: false,
      overallSimilarityScore: 0,
      verdict: 'needs_review',
      reasonCode: 'ai_temporarily_unavailable',
      summary: 'Payment verification is queued for review.',
    };
  }

  const expectedMajor = Number((ctx.order.expected_minor / 100).toFixed(2));
  const channelGuide = CHANNEL_GUIDES[ctx.order.channel] || `${ctx.channelConfig.label} payment proof.`;

  const prompt = [
    `You are the automated Backend AI Payment Verification Officer for M R S IPTV (TV NETWORK).`,
    `Because merchant APIs are unavailable, you evaluate customer payment submissions based on structural similarity, visual/document authenticity, and Transaction ID realism for the selected payment option.`,
    ``,
    `ORDER DETAILS TO VERIFY:`,
    `- Order Ref: ${ctx.order.public_id}`,
    `- Selected Plan: ${ctx.planConfig.label} (${ctx.planConfig.months} month(s) / ${ctx.planConfig.durationDays} days)`,
    `- Expected Payment Amount: ${expectedMajor} ${ctx.order.currency}`,
    `- Selected Payment Option: ${ctx.channelConfig.label} (channel id: ${ctx.order.channel})`,
    `- Official Receiving Account Info: ${JSON.stringify(ctx.receivingAccount)}`,
    `- Submitted Sender Number / Account: ${ctx.order.phone}`,
    `- Order Created At (UTC): ${ctx.order.created_at}`,
    `- Customer Email: ${ctx.order.email}`,
    `- Submitted Transaction ID (${ctx.order.trx_kind || 'none'}): ${ctx.order.trx_id || '(not typed — check document if attached)'}`,
    `- Attached Document Provided: ${hasDocument ? `Yes (${ctx.fileMime}, ${ctx.fileBuffer!.length} bytes)` : 'No document attached (evaluate typed Transaction ID only)'}`,
    ``,
    `PAYMENT OPTION SPECIFICATION:`,
    `${channelGuide}`,
    ``,
    `VERIFICATION RULES:`,
    `1. If a payment document (screenshot image or PDF receipt) IS attached:`,
    `   - Check whether it is genuinely a payment confirmation / receipt / bank or wallet slip that looks real and matches "${ctx.channelConfig.label}" (set isPaymentDocument and channelMatchesSelected).`,
    `   - Read any Transaction ID / Reference / Order ID from the document (put into extractedTrxId).`,
    `   - Check receiver number / UID / PayID / Customer ID on the receipt (extractedRecipient). Set recipientMatchesAccount=false ONLY if it explicitly shows payment sent to a different account than ${JSON.stringify(ctx.receivingAccount)}; set true if matching or not shown.`,
    `   - Check visible transaction date/time (extractedTimestamp). Set timestampLooksRecent=false if the receipt clearly shows an old transaction (>72 hours prior to ${ctx.order.created_at}) or wrong year; otherwise set true.`,
    `   - If the customer also typed a Transaction ID (${ctx.order.trx_id || 'none'}), check whether it matches or closely aligns with the document (trxIdMatchesInput).`,
    `   - Check whether the amount & currency in the document covers >= ${expectedMajor} ${ctx.order.currency}.`,
    `   - Check whether status shows Completed / Successful / Sent / Confirmed (not Failed, Cancelled, Pending, or Mockup/Template).`,
    `   - Reject obvious non-payment photos, fake generators, placeholder text ("TEST", "FAKE", "SAMPLE", "DEMO"), or tampered receipts.`,
    `2. If NO document is attached (Transaction ID only):`,
    `   - Set isPaymentDocument=false, extractedAmount=0, recipientMatchesAccount=true, timestampLooksRecent=true.`,
    `   - Evaluate whether the typed Transaction ID "${ctx.order.trx_id || ''}" has realistic format, character entropy, length, and pattern similarity matching real ${ctx.channelConfig.label} transactions.`,
    `   - Set trxIdLooksReal=true and verdict='verify' ONLY if the Transaction ID genuinely matches real ${ctx.channelConfig.label} syntax & realistic entropy (not sequential like 123456789, repeated digits, or placeholder words).`,
    `3. Scoring & Verdict:`,
    `   - overallSimilarityScore >= 75 and trxIdSimilarityScore >= 70 with genuine-looking proof -> verdict='verify', reasonCode='ai_verified'.`,
    `   - Obvious fake/edited/underpaid/non-payment -> verdict='reject' with clear reasonCode.`,
    `   - Ambiguous or mismatched channel/TrxID needing a closer check -> verdict='needs_review'.`,
  ].join('\n');

  const contents: any = hasDocument
    ? [
        {
          parts: [
            {
              inlineData: {
                mimeType: ctx.fileMime!,
                data: ctx.fileBuffer!.toString('base64'),
              },
            },
            { text: prompt },
          ],
        },
      ]
    : prompt;

  beginAiPriorityWindow(35000);
  try {
    await warmupGeminiDnsIpv4();
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const resp = await client.models.generateContent({
          model: AI_VERIFIER_MODEL,
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: PAYMENT_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            maxOutputTokens: 1024,
          },
        });
        const rawText = (resp?.text || '').trim();
        if (!rawText) {
          throw new Error('Empty AI verification response');
        }
        const parsed = JSON.parse(rawText);
        const verdict =
          parsed.verdict === 'verify' || parsed.verdict === 'reject' || parsed.verdict === 'needs_review'
            ? parsed.verdict
            : 'needs_review';
        return {
          deferred: false,
          model: AI_VERIFIER_MODEL,
          hasDocument,
          isPaymentDocument: Boolean(parsed.isPaymentDocument),
          detectedChannel: String(parsed.detectedChannel || 'unknown').toLowerCase(),
          channelMatchesSelected: Boolean(parsed.channelMatchesSelected),
          extractedTrxId: String(parsed.extractedTrxId || '').trim().toUpperCase(),
          trxIdMatchesInput: Boolean(parsed.trxIdMatchesInput),
          trxIdLooksReal: Boolean(parsed.trxIdLooksReal),
          trxIdSimilarityScore: Math.max(0, Math.min(100, Number(parsed.trxIdSimilarityScore) || 0)),
          extractedAmount: Math.max(0, Number(parsed.extractedAmount) || 0),
          extractedCurrency: String(parsed.extractedCurrency || '').trim().toUpperCase(),
          extractedRecipient: String(parsed.extractedRecipient || '').trim(),
          recipientMatchesAccount: parsed.recipientMatchesAccount !== false,
          extractedTimestamp: String(parsed.extractedTimestamp || '').trim(),
          timestampLooksRecent: parsed.timestampLooksRecent !== false,
          paymentStatusSuccessful: Boolean(parsed.paymentStatusSuccessful),
          appearsAuthenticAndUnedited: Boolean(parsed.appearsAuthenticAndUnedited),
          overallSimilarityScore: Math.max(0, Math.min(100, Number(parsed.overallSimilarityScore) || 0)),
          verdict,
          reasonCode: String(parsed.reasonCode || 'ai_needs_review').trim(),
          summary: String(parsed.summary || '').trim().slice(0, 320),
        };
      } catch (err: any) {
        if (isQuotaOrRateLimitError(err)) {
          console.warn('[AI Payment Verifier] Gemini quota/rate limit reached; deferring order for retry.');
          return {
            deferred: true,
            deferredReason: 'ai_quota_limit',
            model: AI_VERIFIER_MODEL,
            hasDocument,
            isPaymentDocument: false,
            detectedChannel: 'unknown',
            channelMatchesSelected: false,
            extractedTrxId: String(ctx.order.trx_id || ''),
            trxIdMatchesInput: false,
            trxIdLooksReal: false,
            trxIdSimilarityScore: 0,
            extractedAmount: 0,
            extractedCurrency: '',
            extractedRecipient: '',
            recipientMatchesAccount: true,
            extractedTimestamp: '',
            timestampLooksRecent: true,
            paymentStatusSuccessful: false,
            appearsAuthenticAndUnedited: false,
            overallSimilarityScore: 0,
            verdict: 'needs_review',
            reasonCode: 'ai_quota_limit',
            summary: 'Your payment verification is queued and will be processed shortly.',
          };
        }
        if (isTransientNetworkError(err) && attempt < 2) {
          const delay = 1200 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        console.warn('[AI Payment Verifier] Model verification unavailable:', err?.message || err);
        return {
          deferred: true,
          deferredReason: isTransientNetworkError(err) ? 'ai_network_timeout' : 'ai_error',
          model: AI_VERIFIER_MODEL,
          hasDocument,
          isPaymentDocument: false,
          detectedChannel: 'unknown',
          channelMatchesSelected: false,
          extractedTrxId: String(ctx.order.trx_id || ''),
          trxIdMatchesInput: false,
          trxIdLooksReal: false,
          trxIdSimilarityScore: 0,
          extractedAmount: 0,
          extractedCurrency: '',
          extractedRecipient: '',
          recipientMatchesAccount: true,
          extractedTimestamp: '',
          timestampLooksRecent: true,
          paymentStatusSuccessful: false,
          appearsAuthenticAndUnedited: false,
          overallSimilarityScore: 0,
          verdict: 'needs_review',
          reasonCode: 'ai_temporarily_unavailable',
          summary: 'Your payment verification is queued for review and will be processed shortly.',
        };
      }
    }
    return {
      deferred: true,
      deferredReason: 'ai_retry_exhausted',
      model: AI_VERIFIER_MODEL,
      hasDocument,
      isPaymentDocument: false,
      detectedChannel: 'unknown',
      channelMatchesSelected: false,
      extractedTrxId: String(ctx.order.trx_id || ''),
      trxIdMatchesInput: false,
      trxIdLooksReal: false,
      trxIdSimilarityScore: 0,
      extractedAmount: 0,
      extractedCurrency: '',
      extractedRecipient: '',
      recipientMatchesAccount: true,
      extractedTimestamp: '',
      timestampLooksRecent: true,
      paymentStatusSuccessful: false,
      appearsAuthenticAndUnedited: false,
      overallSimilarityScore: 0,
      verdict: 'needs_review',
      reasonCode: 'ai_temporarily_unavailable',
      summary: 'Your payment verification is queued and will be processed shortly.',
    };
  } finally {
    endAiPriorityWindow();
  }
}
