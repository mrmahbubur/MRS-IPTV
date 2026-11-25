import React, { useState, useEffect } from 'react';
import { 
  X, Crown, CheckCircle2, Copy, Smartphone, Tv,
  ArrowRight, Key, ShieldCheck, Zap, Check, ChevronDown,
  MessageCircle, ExternalLink, Coins, Wallet, CreditCard,
  Upload, Image as ImageIcon, FileText, Trash2, Loader2, AlertCircle, Clock, Radio
} from 'lucide-react';
import { activateAdFreeCode } from '../lib/codes';
import { 
  submitOrder, 
  waitForVerification, 
  planFromMonths, 
  regionFromTab, 
  claimAutoActivatedOrder,
  syncPendingOrderVip,
  getPaymentMethods,
  getCheckoutChallenge,
  formatActivationCodeInput,
  finalizeVipActivationReload,
  CheckoutChallenge,
  PaymentMethodConfig,
  OrderResponse 
} from '../lib/mrsVip';
import { AdFreeState } from '../types';
import { useRealtimeVipCountdown } from '../lib/adSystem';
import { CaptchaChallengeWidget } from './CaptchaChallengeWidget';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  adFreeState: AdFreeState;
  onStateChange: (newState: AdFreeState) => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ 
  isOpen, 
  onClose, 
  adFreeState, 
  onStateChange 
}) => {
  const [activeTab, setActiveTab] = useState<'packages' | 'redeem' | 'perks'>('packages');
  const [currencyTab, setCurrencyTab] = useState<'bd' | 'intl'>('bd');
  const [selectedMonths, setSelectedMonths] = useState<1 | 2 | 6 | 12>(1);
  const [paymentChannel, setPaymentChannel] = useState<'bkash' | 'nagad' | 'binance' | 'skrill' | 'payoneer' | 'email'>('bkash');

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [mobileOrWhatsapp, setMobileOrWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotImage, setScreenshotImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [screenshotFileName, setScreenshotFileName] = useState('');
  const [screenshotFileSize, setScreenshotFileSize] = useState('');
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [screenshotError, setScreenshotError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<OrderResponse | null>(null);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [supportMeta, setSupportMeta] = useState<{ whatsapp: string; email: string }>({
    whatsapp: '+8801810853282',
    email: 'mr216873@gmail.com',
  });
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [checkoutChallenge, setCheckoutChallenge] = useState<CheckoutChallenge | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  // Handle Payment Document / Screenshot Upload (JPG, PNG, WebP, or PDF)
  const handleImageFile = (file: File) => {
    setScreenshotError('');
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next.screenshot;
      return next;
    });
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isPdf) {
      setScreenshotError('Please upload a valid payment document (JPG, PNG, WebP, or PDF).');
      return;
    }
    if (isPdf) {
      if (file.size > 3 * 1024 * 1024) {
        setScreenshotError('PDF document is too large (max 3MB). Please choose a smaller file.');
        return;
      }
      setUploadedFile(file);
      setScreenshotImage('PDF_DOCUMENT');
      setScreenshotFileName(file.name);
      setScreenshotFileSize(`${Math.max(1, Math.round(file.size / 1024))} KB`);
      setIsCompressingImage(false);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setScreenshotError('Image file is too large (max 15MB). Please choose a smaller file.');
      return;
    }

    setUploadedFile(file);
    setIsCompressingImage(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1200;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setScreenshotImage(compressedDataUrl);
            setScreenshotFileName(file.name);
            const sizeInKb = Math.round((compressedDataUrl.length * 3 / 4) / 1024);
            setScreenshotFileSize(`${sizeInKb} KB`);
            if (file.size > 2.8 * 1024 * 1024) {
              canvas.toBlob((blob) => {
                if (blob) {
                  const baseName = file.name.replace(/\.[^.]+$/, '') || 'payment';
                  setUploadedFile(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
                }
              }, 'image/jpeg', 0.85);
            }
          } else {
            setScreenshotImage(e.target?.result as string);
            setScreenshotFileName(file.name);
            setScreenshotFileSize(`${Math.round(file.size / 1024)} KB`);
          }
        } catch (err) {
          setScreenshotImage(e.target?.result as string);
          setScreenshotFileName(file.name);
          setScreenshotFileSize(`${Math.round(file.size / 1024)} KB`);
        } finally {
          setIsCompressingImage(false);
        }
      };
      img.onerror = () => {
        setIsCompressingImage(false);
        setScreenshotError('Could not process image file.');
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      setIsCompressingImage(false);
      setScreenshotError('Error reading image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveScreenshot = () => {
    setScreenshotImage(null);
    setUploadedFile(null);
    setScreenshotFileName('');
    setScreenshotFileSize('');
    setScreenshotError('');
  };

  // Redeem Code State
  const [inputCode, setInputCode] = useState('');
  const [redeemEmail, setRedeemEmail] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ success: boolean; message: string } | null>(null);

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const vipCountdown = useRealtimeVipCountdown(adFreeState);
  const isVipActive = vipCountdown.isActive;

  useEffect(() => {
    if (isOpen) {
      setFormError('');
      setRedeemResult(null);
      setWebsiteUrl('');
      setCaptchaToken('');
      getCheckoutChallenge().then(setCheckoutChallenge).catch(() => {});
      getPaymentMethods()
        .then((res) => {
          if (Array.isArray(res?.methods)) setPaymentMethods(res.methods);
          if (res?.support) setSupportMeta({ whatsapp: res.support.whatsapp, email: res.support.email });
        })
        .catch(() => {});
      syncPendingOrderVip().then((res) => {
        if (res.claimed && res.entitlement) {
          onStateChange({
            isActive: true,
            isAdFree: true,
            activatedAt: res.order?.autoActivatedAt || new Date().toISOString(),
            expiryDate: res.entitlement.expiresAt,
            durationMonths: Number(String(res.order?.plan || '1m').replace('m', '')) || 1,
            code: 'VIP_PASS',
            deviceId: localStorage.getItem('mrs_device_id') || ''
          });
        }
      }).catch(() => {});
    }
  }, [isOpen, onStateChange]);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCurrencyChange = (newTab: 'bd' | 'intl') => {
    setCurrencyTab(newTab);
    if (newTab === 'bd') {
      if (paymentChannel !== 'binance' && paymentChannel !== 'nagad') {
        setPaymentChannel('bkash');
      }
    } else {
      if (paymentChannel !== 'skrill' && paymentChannel !== 'payoneer') {
        setPaymentChannel('binance');
      }
    }
  };

  const PACKAGES = [
    { months: 1 as const, bdPrice: '110 TK', usdPrice: '$1', label: '1 Month Pass', badge: 'Standard' },
    { months: 2 as const, bdPrice: '210 TK', usdPrice: '$2', label: '2 Months Pass', badge: 'Save 10 TK' },
    { months: 6 as const, bdPrice: '610 TK', usdPrice: '$6', label: '6 Months Pass', badge: 'Save 50 TK' },
    { months: 12 as const, bdPrice: '1220 TK', usdPrice: '$12', label: '12 Months (1 Year)', badge: 'Best Value' },
  ];

  const currentPkg = PACKAGES.find(p => p.months === selectedMonths)!;
  const displayPrice = currencyTab === 'bd' ? currentPkg.bdPrice : currentPkg.usdPrice;

  const getDynamicMethod = (id: string) => paymentMethods.find((m) => m.id === id);

  const getActivePaymentInfo = () => {
    const dyn = getDynamicMethod(paymentChannel);
    switch (paymentChannel) {
      case 'binance':
        return {
          id: 'binance',
          title: dyn?.name || 'Binance Pay / Crypto',
          badge: 'BD & International',
          badgeColor: 'bg-amber-400/20 text-amber-300 border-amber-400/50',
          instructionsEn: dyn?.instructionsEn || [
            `Send ${displayPrice} via Binance Pay to UID ${dyn?.account || '38927942'} or Pay ID ${dyn?.secondaryAccount || 'mrxshahin'}.`,
            'Enter your Binance Pay Order ID below.',
          ],
          instructionsBn: dyn?.instructionsBn || [
            `Binance Pay থেকে UID ${dyn?.account || '38927942'} অথবা ID ${dyn?.secondaryAccount || 'mrxshahin'}-এ ${displayPrice} পাঠান।`,
            'নিচে Binance Pay Order ID জমা দিন।',
          ],
          fields: [
            { label: 'Binance UID', value: dyn?.account || '38927942', key: 'b_uid' },
            { label: 'Binance ID', value: dyn?.secondaryAccount || 'mrxshahin', key: 'b_id' },
          ],
        };
      case 'skrill':
        return {
          id: 'skrill',
          title: dyn?.name || 'Skrill',
          badge: 'International Payment',
          badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
          instructionsEn: dyn?.instructionsEn || [`Send ${displayPrice} to Skrill Customer ID ${dyn?.account || '407108385'}.`],
          instructionsBn: dyn?.instructionsBn || [`Skrill-এ Customer ID ${dyn?.account || '407108385'}-এ ${displayPrice} পাঠান।`],
          fields: [
            { label: dyn?.accountLabel || 'Customer ID', value: dyn?.account || '407108385', key: 'skrill_id' },
          ],
        };
      case 'payoneer':
        return {
          id: 'payoneer',
          title: dyn?.name || 'Payoneer',
          badge: 'International Payment',
          badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
          instructionsEn: dyn?.instructionsEn || [`Transfer ${displayPrice} to Payoneer Customer ID ${dyn?.account || '108003450'}.`],
          instructionsBn: dyn?.instructionsBn || [`Payoneer Make a Payment থেকে Customer ID ${dyn?.account || '108003450'}-এ ${displayPrice} পাঠান।`],
          fields: [
            { label: dyn?.accountLabel || 'Customer ID', value: dyn?.account || '108003450', key: 'payoneer_id' },
          ],
        };
      case 'nagad':
        return {
          id: 'nagad',
          title: dyn?.name || 'Nagad Personal',
          badge: 'Send Money',
          badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/45',
          instructionsEn: dyn?.instructionsEn || [`Send ${displayPrice} via Nagad Personal Send Money to ${dyn?.account || '+8801792322734'}.`],
          instructionsBn: dyn?.instructionsBn || [`নগদ অ্যাপ থেকে "Send Money" করে ${dyn?.account || '+8801792322734'} নম্বরে ${displayPrice} পাঠান এবং TxnID জমা দিন।`],
          fields: [
            { label: dyn?.accountLabel || 'Personal Number', value: dyn?.account || '+8801792322734', key: 'nagad_num' },
          ],
        };
      case 'email':
        return {
          id: 'email',
          title: 'Direct Support',
          badge: 'Support Desk',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/45',
          instructionsEn: [`Contact Admin on Email (${supportMeta.email}) or WhatsApp (${supportMeta.whatsapp}).`],
          instructionsBn: [`সরাসরি সহায়তার জন্য WhatsApp (${supportMeta.whatsapp}) অথবা ইমেইলে যোগাযোগ করুন।`],
          fields: [
            { label: 'Admin Email', value: supportMeta.email, key: 'adm_email' },
            { label: 'WhatsApp', value: supportMeta.whatsapp, key: 'adm_wa' },
          ],
        };
      case 'bkash':
      default:
        return {
          id: 'bkash',
          title: dyn?.name || 'bKash Personal',
          badge: 'Send Money',
          badgeColor: 'bg-[#B832F5]/20 text-[#D875FF] border-[#B832F5]/45',
          instructionsEn: dyn?.instructionsEn || [`Send ${displayPrice} via bKash Personal Send Money to ${dyn?.account || '01810853282'}.`],
          instructionsBn: dyn?.instructionsBn || [`বিকাশ অ্যাপ থেকে "Send Money" করে ${dyn?.account || '01810853282'} নম্বরে ${displayPrice} পাঠান এবং TrxID জমা দিন।`],
          fields: [
            { label: dyn?.accountLabel || 'Personal Number', value: dyn?.account || '01810853282', key: 'bkash_num' },
          ],
        };
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});

    const phoneTrimmed = mobileOrWhatsapp.trim();
    const emailTrimmed = email.trim();
    const trxTrimmed = transactionId.trim();

    if (!phoneTrimmed || !emailTrimmed) {
      setFormError('Please enter both your WhatsApp / Mobile number and Email.');
      return;
    }

    if (!trxTrimmed && !uploadedFile && !screenshotImage) {
      setFormError('Please provide at least one payment proof: enter your Transaction ID (Option 1) or upload a payment screenshot (Option 2).');
      return;
    }

    if ((checkoutChallenge?.turnstileSiteKey || checkoutChallenge?.hcaptchaSiteKey) && !captchaToken) {
      setFormError('Please complete the security CAPTCHA check before submitting your order.');
      return;
    }

    setIsSubmitting(true);
    const activeInfo = getActivePaymentInfo();
    const formattedPaymentMethod = `${activeInfo.title} (${activeInfo.fields.map(f => `${f.label}: ${f.value}`).join(', ')})`;

    let mappedChannel: 'bkash' | 'nagad' | 'binance' | 'skrill' | 'payoneer' = 'bkash';
    if (paymentChannel === 'email') {
      mappedChannel = currencyTab === 'bd' ? 'bkash' : 'binance';
    } else {
      mappedChannel = paymentChannel;
    }

    try {
      const order = await submitOrder({
        plan: planFromMonths(selectedMonths),
        region: regionFromTab(currencyTab),
        channel: mappedChannel,
        phone: phoneTrimmed,
        email: emailTrimmed,
        name: customerName.trim() || undefined,
        trxId: trxTrimmed || undefined,
        screenshot: uploadedFile || undefined,
        website_url: websiteUrl,
        captchaToken: captchaToken || undefined,
        challenge: checkoutChallenge,
      });

      setIsSubmitting(false);
      setCaptchaToken('');
      setCaptchaResetKey((k) => k + 1);
      getCheckoutChallenge().then(setCheckoutChallenge).catch(() => {});

      const whatsappPhone = supportMeta.whatsapp.replace(/[^\d]/g, '') || '8801810853282';
      const whatsappText = `Hello Admin, I have submitted an order for ${selectedMonths} Month VIP Pass (${displayPrice}).\n👤 Name: ${customerName.trim() || 'Subscriber'}\n💳 Method: ${activeInfo.title}${trxTrimmed ? `\n🔗 TrxID / Ref: ${trxTrimmed}` : ''}${screenshotImage ? '\n📷 Proof: Payment Screenshot attached' : ''}\n📱 Mobile: ${phoneTrimmed}\n✉️ Email: ${emailTrimmed}\nOrder Ref: ${order.orderId}\n\nPlease verify payment and email my activation code.`;

      const successData = {
        requestId: order.orderId,
        orderId: order.orderId,
        status: order.status || 'pending',
        step: order.step || (order.status === 'verified' ? 3 : order.status === 'needs_review' ? 2 : 1),
        reason: order.reason || null,
        message: order.message,
        verificationMethod: order.verificationMethod || null,
        aiSummary: order.aiSummary || null,
        whatsappUrl: `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappText)}`,
        mobile: phoneTrimmed,
        email: emailTrimmed,
        packageMonths: selectedMonths,
        price: displayPrice,
        paymentMethod: formattedPaymentMethod,
        transactionId: trxTrimmed,
        screenshotImage: screenshotImage,
        screenshotFileName: screenshotFileName,
        channelTitle: activeInfo.title,
        copyEmailStatus: order.copyEmailStatus || 'queued',
      };

      setOrderSuccess(successData);
      setVerificationStatus(order);

      // Start live verification polling if still pending
      if (order.status === 'pending') {
        waitForVerification(order.orderId, {
          onUpdate: (latest) => {
            setVerificationStatus(latest);
            setOrderSuccess((prev: any) => prev ? {
              ...prev,
              status: latest.status,
              step: latest.step || (latest.status === 'verified' ? 3 : latest.status === 'needs_review' ? 2 : 1),
              reason: latest.reason || prev.reason,
              message: latest.message || prev.message,
              verificationMethod: latest.verificationMethod || prev.verificationMethod,
              aiSummary: latest.aiSummary || prev.aiSummary,
              copyEmailStatus: latest.copyEmailStatus ?? prev.copyEmailStatus,
              autoActivateAt: latest.autoActivateAt || prev.autoActivateAt,
              autoActivatedAt: latest.autoActivatedAt || prev.autoActivatedAt
            } : null);
            if (latest.status === 'verified' && latest.autoActivatedAt) {
              claimAutoActivatedOrder(order.orderId).then(async (ent) => {
                onStateChange({
                  isActive: true,
                  isAdFree: true,
                  activatedAt: ent.activatedAt,
                  expiryDate: ent.expiresAt,
                  durationMonths: ent.months,
                  code: 'VIP_PASS',
                  deviceId: localStorage.getItem('mrs_device_id') || ''
                });
                await finalizeVipActivationReload(ent.expiresAt);
              }).catch(() => {});
            }
          },
          intervalMs: 4000,
          timeoutMs: 10 * 60 * 1000,
        }).catch(() => {});
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setCaptchaToken('');
      setCaptchaResetKey((k) => k + 1);
      getCheckoutChallenge().then(setCheckoutChallenge).catch(() => {});
      if (err.fields) {
        setFieldErrors(err.fields);
      }
      setFormError(err.message || 'Failed to submit order. Please check the fields and try again.');
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;

    setIsRedeeming(true);
    setRedeemResult(null);

    try {
      const res = await activateAdFreeCode(inputCode.trim(), redeemEmail.trim() || undefined);
      setIsRedeeming(false);
      setRedeemResult({
        success: res.success,
        message: res.message
      });

      if (res.success && res.state) {
        onStateChange(res.state);
        await finalizeVipActivationReload(res.state.expiryDate);
      }
    } catch (err: any) {
      setIsRedeeming(false);
      setRedeemResult({
        success: false,
        message: err?.message || 'Failed to verify pass code. Please check code or contact admin.'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#050816]/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#050816] border border-[#00D9FF]/35 rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.95)] overflow-hidden my-auto flex flex-col">
        {/* Header */}
        <div className="relative p-5 sm:p-6 bg-[#080d21] border-b border-[#00D9FF]/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#00D9FF] via-[#176BFF] to-[#B832F5] flex items-center justify-center shadow-[0_0_20px_rgba(0,217,255,0.35)] shrink-0">
              <Crown className="w-5 h-5 text-white shrink-0" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">M R S IPTV VIP Pass</h2>
                {isVipActive && (
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-extrabold bg-[#00D9FF]/15 text-[#00D9FF] border border-[#00D9FF]/40 flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-[#00D9FF] shrink-0" />
                    <span>{vipCountdown.isTemporary ? vipCountdown.formattedClock : 'ACTIVE'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[#C9D1E0]">Zero Ads, 4K priority streams, 1-device VIP unlocked</p>
            </div>
          </div>
          <button 
            type="button"
            aria-label="Close VIP modal"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#050816] hover:bg-[#0c1433] text-[#C9D1E0] hover:text-white border border-[#00D9FF]/30 hover:border-[#00D9FF] transition-all cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#00D9FF]/20 bg-[#070C1E] p-1.5 gap-1.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('packages')}
            className={`flex-1 min-h-[42px] px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'packages'
                ? 'btn-premium-gold text-white font-extrabold'
                : 'btn-premium-glass text-[#C9D1E0] hover:text-white'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'packages' ? 'text-amber-400' : 'text-[#00D9FF]'}`} />
            <span>Get VIP Pass</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('redeem')}
            className={`flex-1 min-h-[42px] px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'redeem'
                ? 'btn-premium-primary text-white font-extrabold'
                : 'btn-premium-glass text-[#C9D1E0] hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-[#00D9FF] shrink-0" />
            <span>Redeem Code</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('perks')}
            className={`flex-1 min-h-[42px] px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'perks'
                ? 'btn-premium-purple text-white font-extrabold'
                : 'btn-premium-glass text-[#C9D1E0] hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#D875FF] shrink-0" />
            <span>VIP Perks</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto max-h-[72vh] custom-scrollbar">
          {/* TAB 1: PACKAGES & ORDER */}
          {activeTab === 'packages' && (
            <div className="space-y-5">
              {/* Currency Selector */}
              <div className="flex items-center justify-between bg-[#070C1E] p-1 rounded-xl border border-[#00D9FF]/25 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCurrencyChange('bd')}
                  className={`flex-1 min-h-[38px] px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    currencyTab === 'bd'
                      ? 'btn-premium-emerald text-white'
                      : 'btn-premium-glass text-[#C9D1E0] hover:text-white'
                  }`}
                >
                  🇧🇩 Bangladesh (bKash/Nagad/Binance)
                </button>
                <button
                  type="button"
                  onClick={() => handleCurrencyChange('intl')}
                  className={`flex-1 min-h-[38px] px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    currencyTab === 'intl'
                      ? 'btn-premium-cyan text-white'
                      : 'btn-premium-glass text-[#C9D1E0] hover:text-white'
                  }`}
                >
                  🌐 International (Binance / Skrill / Payoneer)
                </button>
              </div>

              {/* Package Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {PACKAGES.map((pkg) => {
                  const isSelected = selectedMonths === pkg.months;
                  const price = currencyTab === 'bd' ? pkg.bdPrice : pkg.usdPrice;
                  return (
                    <button
                      key={pkg.months}
                      type="button"
                      onClick={() => setSelectedMonths(pkg.months)}
                      className={`relative p-3 rounded-xl text-left transition-all flex flex-col justify-between cursor-pointer ${
                        isSelected 
                          ? 'btn-premium-gold' 
                          : 'premium-card hover:border-amber-400/60'
                      }`}
                    >
                      {pkg.badge && (
                        <span className={`text-[9px] font-black uppercase tracking-wider mb-1 ${
                          isSelected ? 'text-amber-300' : 'text-[#00D9FF]'
                        }`}>
                          {pkg.badge}
                        </span>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-[#C9D1E0]">{pkg.months} Month{pkg.months > 1 ? 's' : ''}</p>
                        <p className="text-base sm:text-lg font-black text-white mt-0.5 font-mono tabular-nums">{price}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-md bg-amber-400 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-[#050816] stroke-[3] shrink-0" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Payment Details & Method Selector Box */}
              <div className="premium-card rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-[#00D9FF] shrink-0" />
                    <span>Select Payment Option:</span>
                  </p>
                  <span className="text-[10px] text-[#00D9FF] font-mono font-bold uppercase tracking-wider">
                    {currencyTab === 'bd' ? 'Local & Crypto' : 'International & Crypto'}
                  </span>
                </div>

                {/* Payment Option Selector Pills */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs font-bold">
                  {currencyTab === 'bd' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPaymentChannel('bkash')}
                        className={`p-2.5 rounded-lg transition-all flex items-center gap-2 cursor-pointer border text-left ${
                          paymentChannel === 'bkash'
                            ? 'bg-[#B832F5]/25 border-[#D875FF] text-white shadow-[0_0_12px_rgba(184,50,245,0.35)]'
                            : 'bg-[#050816] border-[#00D9FF]/20 text-[#C9D1E0] hover:text-white hover:border-[#00D9FF]/50'
                        }`}
                      >
                        <Smartphone className="w-4 h-4 text-[#D875FF] shrink-0" />
                        <div className="min-w-0">
                          <span className="block text-[11px] font-extrabold truncate">bKash Personal</span>
                          <span className="block text-[9px] text-[#C9D1E0]/70 font-mono tabular-nums">01810853282</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentChannel('nagad')}
                        className={`p-2.5 rounded-lg transition-all flex items-center gap-2 cursor-pointer border text-left ${
                          paymentChannel === 'nagad'
                            ? 'bg-orange-500/25 border-orange-400 text-white shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                            : 'bg-[#050816] border-[#00D9FF]/20 text-[#C9D1E0] hover:text-white hover:border-[#00D9FF]/50'
                        }`}
                      >
                        <Smartphone className="w-4 h-4 text-orange-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="block text-[11px] font-extrabold truncate">Nagad Personal</span>
                          <span className="block text-[9px] text-[#C9D1E0]/70 font-mono tabular-nums">+8801792322734</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentChannel('binance')}
                        className={`p-2.5 rounded-lg transition-all flex items-center gap-2 cursor-pointer border text-left col-span-2 sm:col-span-1 ${
                          paymentChannel === 'binance'
                            ? 'bg-amber-400/25 border-amber-400 text-white shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                            : 'bg-[#050816] border-[#00D9FF]/20 text-[#C9D1E0] hover:text-white hover:border-[#00D9FF]/50'
                        }`}
                      >
                        <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="block text-[11px] font-extrabold truncate">Binance Pay</span>
                          <span className="block text-[9px] text-amber-300 font-mono">Both BD & Global</span>
                        </div>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setPaymentChannel('binance')}
                        className={`p-2.5 rounded-lg transition-all flex items-center gap-2 cursor-pointer border text-left ${
                          paymentChannel === 'binance'
                            ? 'bg-amber-400/25 border-amber-400 text-white shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                            : 'bg-[#050816] border-[#00D9FF]/20 text-[#C9D1E0] hover:text-white hover:border-[#00D9FF]/50'
                        }`}
                      >
                        <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="block text-[11px] font-extrabold truncate">Binance Pay</span>
                          <span className="block text-[9px] text-amber-300 font-mono tabular-nums">UID: 38927942</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentChannel('skrill')}
                        className={`p-2.5 rounded-lg transition-all flex items-center gap-2 cursor-pointer border text-left ${
                          paymentChannel === 'skrill'
                            ? 'bg-rose-500/25 border-rose-400 text-white shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                            : 'bg-[#050816] border-[#00D9FF]/20 text-[#C9D1E0] hover:text-white hover:border-[#00D9FF]/50'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 text-rose-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="block text-[11px] font-extrabold truncate">Skrill</span>
                          <span className="block text-[9px] text-rose-300 font-mono tabular-nums">ID: 407108385</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentChannel('payoneer')}
                        className={`p-2.5 rounded-lg transition-all flex items-center gap-2 cursor-pointer border text-left col-span-2 sm:col-span-1 ${
                          paymentChannel === 'payoneer'
                            ? 'bg-orange-500/25 border-orange-400 text-white shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                            : 'bg-[#050816] border-[#00D9FF]/20 text-[#C9D1E0] hover:text-white hover:border-[#00D9FF]/50'
                        }`}
                      >
                        <Wallet className="w-4 h-4 text-orange-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="block text-[11px] font-extrabold truncate">Payoneer</span>
                          <span className="block text-[9px] text-orange-300 font-mono tabular-nums">ID: 108003450</span>
                        </div>
                      </button>
                    </>
                  )}
                </div>

                {/* Active Payment Channel Credential Box */}
                {(() => {
                  const info = getActivePaymentInfo();
                  return (
                    <div className="bg-[#050816] p-3.5 rounded-xl border border-[#00D9FF]/30 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2 gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-white">{info.title}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold border ${info.badgeColor}`}>
                            {info.badge}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-amber-400 tabular-nums shrink-0">
                          {displayPrice}
                        </span>
                      </div>

                      {/* Fields with copy buttons */}
                      <div className="space-y-1.5">
                        {info.fields.map((f) => (
                          <div key={f.key} className="flex items-center justify-between bg-[#080d21] px-3 py-2 rounded-lg border border-white/5 gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-[#C9D1E0]/70 uppercase tracking-wider block font-bold">{f.label}</span>
                              <span className="text-xs font-mono font-black text-white tracking-wider block truncate">{f.value}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(f.value, f.key)}
                              className="min-h-[34px] px-3 rounded-lg btn-premium-cyan text-[11px] font-bold text-[#00D9FF] flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                            >
                              {copiedKey === f.key ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                              <span>{copiedKey === f.key ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Instructions (English + Bangla) */}
                      <div className="space-y-1.5 pt-1 text-[11px] leading-relaxed">
                        <div className="space-y-0.5 text-[#C9D1E0]">
                          {info.instructionsEn.map((step, idx) => (
                            <p key={idx}>• {step}</p>
                          ))}
                        </div>
                        <div className="space-y-0.5 text-[#F5B301]/90 font-medium border-t border-white/10 pt-1.5">
                          {info.instructionsBn.map((step, idx) => (
                            <p key={idx}>• {step}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Order Form */}
              {!orderSuccess ? (
                <form onSubmit={handleOrderSubmit} className="space-y-3">
                  <div className="p-2.5 rounded-lg bg-[#070C1E] border border-[#00D9FF]/20 flex items-center justify-between text-xs gap-2">
                    <span className="text-[#C9D1E0]">Payment Channel:</span>
                    <span className="font-bold text-white font-mono flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{getActivePaymentInfo().title}</span>
                      <span className="text-amber-400 font-mono font-bold tabular-nums">({displayPrice})</span>
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#C9D1E0] block mb-1">
                      Full Name <span className="text-[#C9D1E0]/50">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Rahim Uddin"
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#070C1E] border border-[#00D9FF]/30 focus:border-[#00D9FF] rounded-lg text-xs text-white placeholder-[#C9D1E0]/45 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#C9D1E0] block mb-1">
                        Sender Number / Account <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={mobileOrWhatsapp}
                        onChange={(e) => {
                          setMobileOrWhatsapp(e.target.value);
                          if (fieldErrors.phone) {
                            setFieldErrors(prev => {
                              const next = { ...prev };
                              delete next.phone;
                              return next;
                            });
                          }
                        }}
                        placeholder="e.g. +8801810853282 or Sender Email"
                        className={`w-full min-h-[44px] px-3.5 py-2.5 bg-[#070C1E] border rounded-lg text-xs text-white placeholder-[#C9D1E0]/45 focus:outline-none ${
                          fieldErrors.phone ? 'border-rose-500' : 'border-[#00D9FF]/30 focus:border-[#00D9FF]'
                        }`}
                      />
                      {fieldErrors.phone && (
                        <p className="text-[11px] text-rose-400 mt-1 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>{fieldErrors.phone}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#C9D1E0] block mb-1">
                        Email Address (For Code Delivery) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) {
                            setFieldErrors(prev => {
                              const next = { ...prev };
                              delete next.email;
                              return next;
                            });
                          }
                        }}
                        placeholder="e.g. you@gmail.com"
                        className={`w-full min-h-[42px] px-3.5 py-2.5 bg-[#070C1E] border rounded-lg text-xs text-white placeholder-[#C9D1E0]/45 focus:outline-none ${
                          fieldErrors.email ? 'border-rose-500' : 'border-[#00D9FF]/30 focus:border-[#00D9FF]'
                        }`}
                      />
                      {fieldErrors.email && (
                        <p className="text-[11px] text-rose-400 mt-1 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>{fieldErrors.email}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* TWO PAYMENT CONFIRMATION OPTIONS */}
                  <div className="bg-[#050816] p-3.5 rounded-xl border border-[#00D9FF]/35 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2 gap-2">
                      <div>
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Payment Confirmation &amp; Verification</span>
                        </span>
                        <p className="text-[10px] text-[#C9D1E0]">
                          Enter your Transaction ID and/or upload your payment receipt (Screenshot or PDF). Once verified against your selected payment method, your VIP code will be emailed to you:
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-[#00D9FF]/15 text-[#00D9FF] border border-[#00D9FF]/30 shrink-0">
                        Verified
                      </span>
                    </div>

                    {/* Option 1: Transaction ID / Sender Account / Ref */}
                    <div className="bg-[#080d21] p-3 rounded-lg border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-white flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-[#00D9FF]/20 text-[#00D9FF] border border-[#00D9FF]/40 flex items-center justify-center text-[10px] font-mono font-bold">1</span>
                          <span>Option 1: Transaction ID / Payment Ref</span>
                        </label>
                        <span className="text-[9px] text-[#00D9FF] font-mono">Text TrxID</span>
                      </div>
                      <input
                        type="text"
                        value={transactionId}
                        onChange={(e) => {
                          setTransactionId(e.target.value);
                          if (fieldErrors.trxId) {
                            setFieldErrors(prev => {
                              const next = { ...prev };
                              delete next.trxId;
                              return next;
                            });
                          }
                        }}
                        placeholder={
                          paymentChannel === 'binance' 
                            ? 'e.g. Binance Pay Order ID / TxID or Binance Nickname'
                            : paymentChannel === 'skrill'
                              ? 'e.g. Skrill Transaction ID (8-12 digits)'
                              : paymentChannel === 'payoneer'
                                ? 'e.g. Payoneer Payment ID'
                                : 'e.g. bKash / Nagad TrxID (8-10 characters)'
                        }
                        className={`w-full min-h-[42px] px-3.5 py-2.5 bg-[#050816] border rounded-lg text-xs text-white placeholder-[#C9D1E0]/45 focus:outline-none ${
                          fieldErrors.trxId ? 'border-rose-500' : 'border-[#00D9FF]/30 focus:border-[#00D9FF]'
                        }`}
                      />
                      {fieldErrors.trxId && (
                        <p className="text-[11px] text-rose-400 mt-1 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>{fieldErrors.trxId}</span>
                        </p>
                      )}
                      <p className="text-[10px] text-[#C9D1E0]/70">
                        Paste the real Transaction ID / Ref matching your selected payment option.
                      </p>
                    </div>

                    {/* Option 2: Payment Document / Screenshot / PDF Upload */}
                    <div className="bg-[#080d21] p-3 rounded-lg border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-white flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-[10px] font-mono font-bold">2</span>
                          <span>Option 2: Upload Payment Document / Receipt</span>
                        </label>
                        <span className="text-[9px] text-emerald-400 font-mono font-bold">Image / PDF</span>
                      </div>

                      {!screenshotImage ? (
                        <div>
                          <label
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                handleImageFile(e.dataTransfer.files[0]);
                              }
                            }}
                            className="relative rounded-xl flex flex-col items-center justify-center p-4 border border-dashed border-[#00D9FF]/40 hover:border-[#00D9FF] bg-[#050816]/70 hover:bg-[#070C1E] transition-all cursor-pointer group"
                          >
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleImageFile(e.target.files[0]);
                                }
                              }}
                            />
                            <div className="w-9 h-9 rounded-lg bg-[#00D9FF]/15 border border-[#00D9FF]/30 flex items-center justify-center text-[#00D9FF] group-hover:scale-105 transition-transform mb-1.5">
                              {isCompressingImage ? (
                                <span className="w-4 h-4 border-2 border-[#00D9FF] border-t-transparent animate-spin rounded-full" />
                              ) : (
                                <Upload className="w-4 h-4 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs font-bold text-white text-center">
                              {isCompressingImage ? 'Processing & Optimizing Document...' : 'Click to Upload or Drag & Drop Receipt'}
                            </p>
                            <p className="text-[10px] text-[#C9D1E0]/70 mt-0.5 font-mono text-center">
                              Upload any payment receipt / confirmation (JPG, PNG, WebP, or PDF)
                            </p>
                          </label>
                          {screenshotError && (
                            <p className="text-[11px] text-rose-400 mt-1 font-semibold">{screenshotError}</p>
                          )}
                          {fieldErrors.screenshot && (
                            <p className="text-[11px] text-rose-400 mt-1 font-semibold flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{fieldErrors.screenshot}</span>
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#050816] border border-emerald-400/40">
                          <div className="w-14 h-14 rounded-lg bg-black border border-emerald-400/50 shrink-0 overflow-hidden relative flex items-center justify-center">
                            {screenshotImage === 'PDF_DOCUMENT' ? (
                              <FileText className="w-7 h-7 text-emerald-400" />
                            ) : (
                              <img
                                src={screenshotImage}
                                alt="Payment Document Preview"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-white truncate">
                              {screenshotImage === 'PDF_DOCUMENT' ? (
                                <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              <span className="truncate">{screenshotFileName || 'payment_proof'}</span>
                            </div>
                            <p className="text-[10px] font-mono text-emerald-400 mt-0.5 tabular-nums">
                              ✓ Document ready for verification ({screenshotFileSize})
                            </p>
                            <p className="text-[9px] text-[#C9D1E0]/70">
                              Matched with your selected payment method upon submission
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Remove Document"
                            onClick={handleRemoveScreenshot}
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-rose-400 hover:text-white hover:bg-rose-500/20 transition-all border border-rose-500/30 cursor-pointer shrink-0"
                            title="Remove Document"
                          >
                            <Trash2 className="w-4 h-4 shrink-0" />
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Dynamic 3-Point Payment Verification Checklist */}
                    {(() => {
                      const info = getActivePaymentInfo();
                      const receiverTarget = info.fields.map((f) => f.value).join(' / ');
                      return (
                        <div className="bg-[#070C1E] p-3 rounded-lg border border-emerald-400/25 space-y-1.5">
                          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>3-Point Payment Verification Checklist</span>
                          </p>
                          <div className="grid grid-cols-1 gap-1 text-[10px] text-[#C9D1E0]">
                            <div className="flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Receiver Account / ID matches <strong className="text-white font-mono">{receiverTarget}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Exact Plan Amount visible: <strong className="text-amber-300 font-mono">{displayPrice}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Recent Payment Date/Time &amp; Transaction ID clearly visible</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Anti-spam honeypot field (hidden from genuine users) */}
                  <div className="fixed -left-[9999px] top-0 w-px h-px overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
                    <label htmlFor="mrs_website_url">Website</label>
                    <input
                      id="mrs_website_url"
                      name="website_url"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                    />
                  </div>

                  <CaptchaChallengeWidget
                    turnstileSiteKey={checkoutChallenge?.turnstileSiteKey}
                    hcaptchaSiteKey={checkoutChallenge?.hcaptchaSiteKey}
                    resetKey={captchaResetKey}
                    onTokenChange={setCaptchaToken}
                  />

                  {formError && (
                    <p className="text-xs font-semibold text-white bg-[#F43F5E]/20 border border-[#F43F5E]/50 p-3 rounded-lg">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[46px] px-4 rounded-xl btn-premium-primary disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer shadow-[0_0_20px_rgba(0,217,255,0.25)]"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Submitting Order & Verifying...</span>
                      </span>
                    ) : (
                      <>
                        <span>Submit Order ({selectedMonths} Mo • {displayPrice}) via {getActivePaymentInfo().title}</span>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#94A3B8]">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Protected by Anti-Spam Checkout Shield (Single-Use Proof-of-Work)</span>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* LIVE 3-STEP TRACKER (Pending -> Verified -> Code Sent to Email) */}
                  <div className="bg-[#050816] border border-white/10 rounded-xl p-3 flex items-center justify-between text-[11px] font-bold">
                    {[
                      { num: 1, label: 'Pending' },
                      { num: 2, label: 'Verified' },
                      { num: 3, label: 'Code Emailed' },
                    ].map((st) => {
                      const reached =
                        orderSuccess.status === 'verified'
                          ? true
                          : orderSuccess.status === 'needs_review'
                            ? st.num <= 1
                            : st.num === 1;
                      return (
                        <div key={st.num} className="flex items-center gap-1.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] border ${
                              reached
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                                : 'bg-white/5 text-white/40 border-white/15'
                            }`}
                          >
                            {st.num}
                          </span>
                          <span className={reached ? 'text-white' : 'text-white/45'}>{st.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* LIVE STATUS CARD */}
                  {orderSuccess.status === 'verified' ? (
                    <div className="premium-card rounded-xl p-5 text-center space-y-3 border-2 border-emerald-400 bg-emerald-950/30">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/50 flex items-center justify-center mx-auto shadow-[0_0_24px_rgba(52,211,153,0.35)]">
                        <CheckCircle2 className="w-7 h-7 shrink-0" />
                      </div>
                      <div>
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/50">
                          Payment Verified
                        </span>
                        <h4 className="text-base font-black text-white mt-1.5">
                          {orderSuccess.packageMonths}-Month Activation Code Sent via Email!
                        </h4>
                        <p className="text-xs text-[#C9D1E0] mt-1 max-w-md mx-auto">
                          Your payment has been verified. Your unique{' '}
                          <strong className="text-white">MRS-{orderSuccess.packageMonths}M-XXXX-XXXX-XXXX</strong> activation code has been sent to{' '}
                          <span className="font-mono text-emerald-400 font-bold">{orderSuccess.email}</span>.
                        </p>
                      </div>

                      <div className="pt-2 flex justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setRedeemEmail(orderSuccess.email || '');
                            setActiveTab('redeem');
                          }}
                          className="min-h-[44px] px-6 rounded-xl btn-premium-primary text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[0_0_16px_rgba(0,217,255,0.35)]"
                        >
                          <Key className="w-4 h-4 text-[#00D9FF] shrink-0" />
                          <span>Enter Code from Email</span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      </div>
                    </div>
                  ) : orderSuccess.status === 'needs_review' ? (
                    <div className="premium-card rounded-xl p-5 text-center space-y-3 border-2 border-amber-400/80 bg-amber-950/30">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/50 flex items-center justify-center mx-auto">
                        <Clock className="w-7 h-7 shrink-0" />
                      </div>
                      <div>
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/50">
                          Under Review
                        </span>
                        <h4 className="text-base font-black text-white mt-1.5">Payment Verification in Progress</h4>
                        <p className="text-xs text-[#C9D1E0] mt-1 max-w-md mx-auto">
                          {orderSuccess.message || 'Our team is reviewing your submitted payment details.'} Your {orderSuccess.packageMonths}-Month VIP code will be emailed to{' '}
                          <span className="font-mono text-amber-300">{orderSuccess.email}</span> once confirmed.
                        </p>
                      </div>
                      <div className="pt-2 flex justify-center">
                        <a
                          href={orderSuccess.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 rounded-xl btn-premium-emerald text-white font-black text-xs uppercase tracking-wider"
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Speed Up on WhatsApp</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </div>
                  ) : orderSuccess.status === 'rejected' || orderSuccess.status === 'expired' ? (
                    <div className="premium-card rounded-xl p-5 text-center space-y-3 border-2 border-rose-500/80 bg-rose-950/30">
                      <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-400/50 flex items-center justify-center mx-auto">
                        <AlertCircle className="w-7 h-7 shrink-0" />
                      </div>
                      <div>
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-400/50">
                          {orderSuccess.status === 'rejected' ? 'Verification Rejected' : 'Order Expired'}
                        </span>
                        <h4 className="text-base font-black text-white mt-1.5">
                          {orderSuccess.message || orderSuccess.reason || 'Payment could not be verified'}
                        </h4>
                        <p className="text-xs text-[#C9D1E0] mt-1 max-w-md mx-auto">
                          Please make sure your Transaction ID and uploaded payment document match your selected payment option and plan amount, or contact Admin on WhatsApp.
                        </p>
                      </div>
                      <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                        <a
                          href={orderSuccess.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 rounded-xl btn-premium-emerald text-white font-black text-xs uppercase tracking-wider"
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Contact WhatsApp Support</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setOrderSuccess(null);
                            setVerificationStatus(null);
                          }}
                          className="min-h-[42px] px-4 rounded-xl btn-premium-glass text-xs font-bold text-[#C9D1E0] hover:text-white cursor-pointer"
                        >
                          Try Submitting Again
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* PENDING STATUS */
                    <div className="premium-card rounded-xl p-5 text-center space-y-3 border-2 border-[#00D9FF]/60 bg-[#080d21]">
                      <div className="w-12 h-12 rounded-xl bg-[#00D9FF]/15 text-[#00D9FF] border border-[#00D9FF]/40 flex items-center justify-center mx-auto">
                        <Loader2 className="w-7 h-7 animate-spin shrink-0" />
                      </div>
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider bg-[#00D9FF]/15 text-[#00D9FF] border border-[#00D9FF]/30">
                          <Radio className="w-3 h-3 text-[#00D9FF] shrink-0" />
                          <span>Verification In Progress</span>
                        </div>
                        <h4 className="text-base font-black text-white mt-2">Checking Your Payment Details...</h4>
                        <p className="text-xs text-[#C9D1E0] mt-1 max-w-md mx-auto">
                          We are verifying your Transaction ID and payment receipt for your selected payment method. Once confirmed, your {orderSuccess.packageMonths}-Month VIP code will be emailed to{' '}
                          <span className="text-white font-bold">{orderSuccess.email}</span>.
                        </p>
                      </div>

                      <div className="pt-2 flex justify-center">
                        <a
                          href={orderSuccess.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 rounded-xl btn-premium-emerald text-white font-black text-xs uppercase tracking-wider"
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Send Receipt via WhatsApp Support</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>

                      <p className="text-[11px] text-[#C9D1E0]/70 font-mono">
                        You can leave this page safely — your VIP pass code is automatically emailed to <span className="text-white font-bold">{orderSuccess.email}</span>, with automatic VIP activation after 12 hours if not manually redeemed.
                      </p>
                    </div>
                  )}

                  {/* ORDER SUMMARY CARD */}
                  <div className="bg-[#050816] rounded-xl p-4 text-left border border-white/10 space-y-2 text-xs">
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                      <span className="text-[#C9D1E0]">Order ID:</span>
                      <span className="font-mono text-[#00D9FF] font-black">{orderSuccess.requestId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#C9D1E0]">Package:</span>
                      <span className="text-white font-bold tabular-nums">{orderSuccess.packageMonths} Month(s) ({orderSuccess.price})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#C9D1E0]">Payment Channel:</span>
                      <span className="text-[#00D9FF] font-bold">{orderSuccess.channelTitle}</span>
                    </div>
                    {orderSuccess.transactionId && (
                      <div className="flex justify-between">
                        <span className="text-[#C9D1E0]">TrxID / Ref:</span>
                        <span className="font-mono text-amber-400 font-bold">{orderSuccess.transactionId}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#C9D1E0]">Delivery Email:</span>
                      <span className="text-white font-mono">{orderSuccess.email}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[#C9D1E0]">Details Copy Emailed:</span>
                      <span className={`font-bold text-right ${orderSuccess.copyEmailStatus === 'failed' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {orderSuccess.copyEmailStatus === 'failed'
                          ? `Saved in order records (${orderSuccess.email})`
                          : orderSuccess.copyEmailStatus === 'queued'
                            ? `Queued for ${orderSuccess.email} & Admin`
                            : `✓ Sent to ${orderSuccess.email} & Admin (for records)`}
                      </span>
                    </div>
                    {orderSuccess.screenshotImage && (
                      <div className="pt-2 border-t border-white/10 flex items-center gap-2.5">
                        <div className="w-11 h-11 rounded-lg bg-black border border-emerald-400/50 shrink-0 overflow-hidden">
                          <img
                            src={orderSuccess.screenshotImage}
                            alt="Receipt Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold text-white block">Payment Screenshot Attached</span>
                          <span className="text-[10px] text-emerald-400 font-mono block">
                            ✓ Uploaded & registered with order
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* QUICK ACTIONS */}
                  <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
                    <a
                      href={orderSuccess.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 rounded-xl btn-premium-emerald text-white font-black text-xs uppercase tracking-wider transition-all"
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Open Admin WhatsApp</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSuccess(null);
                        setVerificationStatus(null);
                      }}
                      className="min-h-[42px] px-4 rounded-xl btn-premium-glass text-xs font-bold text-[#C9D1E0] hover:text-white cursor-pointer"
                    >
                      Submit Another Order
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REDEEM CODE */}
          {activeTab === 'redeem' && (
            <div className="space-y-4">
              <div className="premium-card rounded-xl p-4 space-y-2">
                <p className="text-xs text-white">
                  Paste or enter the activation code sent to your email (<span className="font-mono text-[#F5B301]">MRS-1M-XXXX-XXXX-XXXX</span>).
                </p>
                <div className="flex items-center gap-2 text-[11px] text-[#C9D1E0]">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Same-email active passes automatically extend from your current expiry date (up to 2 devices).</span>
                </div>
              </div>

              <form onSubmit={handleRedeem} className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-[#C9D1E0] block mb-1">
                    Pass Activation Code <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={inputCode}
                    onChange={(e) => setInputCode(formatActivationCodeInput(e.target.value))}
                    placeholder="MRS-1M-XXXX-XXXX-XXXX"
                    className="w-full min-h-[44px] px-3.5 py-3 bg-[#070C1E] border border-[#00D9FF]/35 rounded-lg text-sm font-mono uppercase tracking-wider text-white placeholder-[#C9D1E0]/45 focus:outline-none focus:border-[#00D9FF]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#C9D1E0] block mb-1">
                    Account Email <span className="text-[#C9D1E0]/50">(Optional — links &amp; extends existing plan)</span>
                  </label>
                  <input
                    type="email"
                    value={redeemEmail}
                    onChange={(e) => setRedeemEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#070C1E] border border-[#00D9FF]/25 rounded-lg text-xs text-white placeholder-[#C9D1E0]/45 focus:outline-none focus:border-[#00D9FF]"
                  />
                </div>

                {redeemResult && (
                  <div className={`p-3 rounded-lg text-xs font-semibold border ${
                    redeemResult.success 
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300' 
                      : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
                  }`}>
                    {redeemResult.message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isRedeeming}
                  className="w-full min-h-[46px] px-4 rounded-xl btn-premium-primary disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
                >
                  {isRedeeming ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Key className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isRedeeming ? 'Verifying Code...' : 'Activate Pass Now'}</span>
                </button>
              </form>

              {/* Current Active Status Card */}
              {isVipActive && (
                <div className="premium-card border-emerald-400/50 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-400/45 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 shrink-0" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">VIP Mode Active</p>
                      <p className="text-[11px] font-mono tabular-nums text-emerald-400 font-bold mt-0.5">
                        {vipCountdown.isTemporary
                          ? `Real-Time Remaining: ${vipCountdown.formattedClock}`
                          : adFreeState.expiryDate
                            ? `Expires: ${new Date(adFreeState.expiryDate).toLocaleDateString()}`
                            : 'Active'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono tabular-nums font-extrabold px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/45 shrink-0">
                    {vipCountdown.isTemporary ? vipCountdown.formattedClock : 'PROTECTED'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VIP PERKS, COMPARISON TABLE & FAQ */}
          {activeTab === 'perks' && (
            <div className="space-y-4">
              <div className="space-y-2.5">
                {[
                  {
                    title: '100% Ad-Free Streaming',
                    desc: 'Completely removes banner overlays and sponsored gateways across all 8,890+ live channels.',
                    icon: Zap,
                    color: 'text-amber-400',
                    border: 'border-amber-400/40'
                  },
                  {
                    title: 'Priority 4K & Android TV Access',
                    desc: 'Instant zapping with Adaptive HLS, Picture-in-Picture, and Android TV DPAD remote navigation.',
                    icon: Tv,
                    color: 'text-rose-400',
                    border: 'border-rose-400/40'
                  },
                  {
                    title: 'Up to 2 Devices Linked per Account',
                    desc: 'Manage active devices in Account settings and remove old hardware whenever you upgrade.',
                    icon: ShieldCheck,
                    color: 'text-emerald-400',
                    border: 'border-emerald-400/40'
                  }
                ].map((perk, i) => {
                  const Icon = perk.icon;
                  return (
                    <div key={i} className="flex items-start gap-3.5 premium-card rounded-xl p-3">
                      <div className={`w-9 h-9 rounded-lg bg-[#050816] border ${perk.border} ${perk.color} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4 shrink-0" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-white">{perk.title}</h4>
                        <p className="text-[11px] text-[#C9D1E0] mt-0.5 leading-relaxed">{perk.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Free vs VIP Comparison Table */}
              <div className="rounded-xl border border-white/10 overflow-hidden bg-[#050816]">
                <div className="px-3.5 py-2.5 bg-[#080d21] border-b border-white/10 text-xs font-black text-white">
                  Free vs VIP Pass Comparison
                </div>
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-white/[0.02] text-[#94A3B8] font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Feature</th>
                      <th className="p-2.5">Free</th>
                      <th className="p-2.5 text-[#F5B301]">VIP Pass</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[#C9D1E0]">
                    <tr><td className="p-2.5">Free-to-Air Live Channels</td><td className="p-2.5">Included</td><td className="p-2.5 text-emerald-400 font-bold">Included + Priority</td></tr>
                    <tr><td className="p-2.5">Sponsored Interstitials</td><td className="p-2.5">Periodic</td><td className="p-2.5 text-emerald-400 font-bold">0 Ads (100% Ad-Free)</td></tr>
                    <tr><td className="p-2.5">Android TV Full Gate Unlock</td><td className="p-2.5">Locked</td><td className="p-2.5 text-emerald-400 font-bold">Full DPAD TV Access</td></tr>
                    <tr><td className="p-2.5">High-Bitrate VIP Channels</td><td className="p-2.5">Standard</td><td className="p-2.5 text-emerald-400 font-bold">Full FHD / 4K Priority</td></tr>
                    <tr><td className="p-2.5">Active Device Limit</td><td className="p-2.5">1 Browser</td><td className="p-2.5 text-emerald-400 font-bold">Up to 2 Linked Devices</td></tr>
                  </tbody>
                </table>
              </div>

              {/* FAQ Accordion */}
              <div className="space-y-1.5">
                <p className="text-xs font-black text-white px-0.5">Frequently Asked Questions</p>
                {[
                  {
                    q: 'How soon do I receive my activation code after paying?',
                    a: 'Once your payment submission is confirmed, your activation code is sent directly to your email (usually within minutes).'
                  },
                  {
                    q: 'Can I extend an active VIP Pass with another code?',
                    a: 'Yes! Enter the same email when redeeming a new code of the same plan duration and the backend extends your expiry date without losing remaining days.'
                  },
                  {
                    q: 'What if I change my phone or TV?',
                    a: 'Open Account & Devices from the navigation menu to remove an old device slot anytime.'
                  }
                ].map((faq, idx) => {
                  const open = openFaqIndex === idx;
                  return (
                    <div key={idx} className="rounded-xl border border-white/10 bg-[#050816] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(open ? null : idx)}
                        className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-xs font-bold text-white flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span>{faq.q}</span>
                        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180 text-[#F5B301]' : 'text-[#94A3B8]'}`} />
                      </button>
                      {open && (
                        <div className="px-3.5 pb-3 text-[11px] text-[#C9D1E0] leading-relaxed border-t border-white/5 pt-2">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Support Notice */}
        <div className="p-3 bg-[#070C1E] border-t border-[#00D9FF]/20 flex items-center justify-between text-[11px] text-[#C9D1E0]">
          <span>Need help? WhatsApp: <strong className="text-white font-mono">+8801810853282</strong></span>
          <span className="text-[#00D9FF] font-bold">M R S IPTV VIP</span>
        </div>
      </div>
    </div>
  );
};
