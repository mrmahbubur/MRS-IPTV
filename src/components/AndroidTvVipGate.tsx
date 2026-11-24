import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Tv, Lock, ShieldCheck, Crown, Key, Radio,
  CheckCircle2, AlertCircle, ArrowRight, 
  Delete, RefreshCw, Send, Check, Copy, Mail, MessageCircle, Zap, X
} from 'lucide-react';
import { MrsIptvLogo } from './MrsIptvLogo';
import { activateAdFreeCode, getDeviceId } from '../lib/codes';
import {
  CheckoutChallenge,
  formatActivationCodeInput,
  getCheckoutChallenge,
  getPaymentMethods,
  PaymentMethodConfig,
  planFromMonths,
  submitOrder,
} from '../lib/mrsVip';
import { CaptchaChallengeWidget } from './CaptchaChallengeWidget';
import { AdFreeState } from '../types';

interface AndroidTvVipGateProps {
  onActivated: (newState: AdFreeState) => void;
}

export const AndroidTvVipGate: React.FC<AndroidTvVipGateProps> = ({ onActivated }) => {
  const [inputCode, setInputCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activePaymentTab, setActivePaymentTab] = useState<'bd' | 'intl'>('bd');
  const [selectedMethod, setSelectedMethod] = useState<'bkash' | 'nagad' | 'binance' | 'skrill' | 'payoneer'>('bkash');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Quick Payment Proof Submission on TV
  const [showProofModal, setShowProofModal] = useState(false);
  const [proofName, setProofName] = useState('');
  const [proofSender, setProofSender] = useState('');
  const [proofEmail, setProofEmail] = useState('');
  const [proofTxId, setProofTxId] = useState('');
  const [proofPackage, setProofPackage] = useState<'1' | '2' | '6' | '12'>('1');
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [proofError, setProofError] = useState('');
  const [proofWebsiteUrl, setProofWebsiteUrl] = useState('');
  const [proofCaptchaToken, setProofCaptchaToken] = useState('');
  const [proofChallenge, setProofChallenge] = useState<CheckoutChallenge | null>(null);
  const [proofCaptchaResetKey, setProofCaptchaResetKey] = useState(0);
  const [proofSuccess, setProofSuccess] = useState<{ orderId: string; status: string; message?: string } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [supportInfo, setSupportInfo] = useState<{ whatsapp: string; email: string }>({
    whatsapp: '+8801810853282',
    email: 'mr216873@gmail.com',
  });

  useEffect(() => {
    getPaymentMethods()
      .then((res) => {
        if (Array.isArray(res?.methods)) setPaymentMethods(res.methods);
        if (res?.support) setSupportInfo({ whatsapp: res.support.whatsapp, email: res.support.email });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (showProofModal) {
      setProofError('');
      setProofWebsiteUrl('');
      setProofCaptchaToken('');
      getCheckoutChallenge().then(setProofChallenge).catch(() => {});
    }
  }, [showProofModal]);

  // Spatial TV remote focus state
  const [focusedKeyIndex, setFocusedKeyIndex] = useState<number>(-1); // -1 = input, 0-11 keypad, 12 = activate button
  const inputRef = useRef<HTMLInputElement>(null);
  const tvDeviceId = useRef<string>(getDeviceId()).current;

  const handleCopy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {}
  };

  const handleKeypadPress = (val: string) => {
    setErrorMessage('');
    if (val === 'CLEAR') {
      setInputCode('');
    } else if (val === 'BACK') {
      setInputCode(prev => prev.slice(0, -1));
    } else {
      if (inputCode.length < 22) {
        setInputCode(prev => formatActivationCodeInput(prev + val));
      }
    }
  };

  const handleActivate = async (codeToUse?: string) => {
    const code = (codeToUse || inputCode).trim().toUpperCase();
    if (!code) {
      setErrorMessage('Please enter your VIP Pass Code (e.g. MRS-1M-XXXX-XXXX-XXXX).');
      return;
    }

    setIsActivating(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await activateAdFreeCode(code);
      if (res.success && res.state) {
        setSuccessMessage(res.message || 'VIP Access Unlocked Successfully!');
        setTimeout(() => {
          onActivated(res.state!);
        }, 1200);
      } else {
        setErrorMessage(res.message || 'Invalid VIP Pass code. Please verify your code and try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error verifying VIP pass code. Please try again.');
    } finally {
      setIsActivating(false);
    }
  };

  const handleProofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProofError('');
    if (!proofSender.trim() || !proofTxId.trim() || !proofEmail.trim()) {
      setProofError('Please provide your sender account/phone, email, and Transaction ID.');
      return;
    }

    if ((proofChallenge?.turnstileSiteKey || proofChallenge?.hcaptchaSiteKey) && !proofCaptchaToken) {
      setProofError('Please complete the security CAPTCHA check before submitting.');
      return;
    }

    setIsSubmittingProof(true);
    setErrorMessage('');
    try {
      const order = await submitOrder({
        plan: planFromMonths(proofPackage),
        region: activePaymentTab === 'bd' ? 'BD' : 'INTL',
        channel: selectedMethod,
        phone: proofSender.trim(),
        email: proofEmail.trim(),
        name: proofName.trim() || 'Android TV Viewer',
        trxId: proofTxId.trim(),
        website_url: proofWebsiteUrl,
        captchaToken: proofCaptchaToken || undefined,
        challenge: proofChallenge,
      });
      setProofSuccess({
        orderId: order.orderId || 'SUBMITTED',
        status: order.status || 'pending',
        message: order.aiSummary || order.message,
      });
      setProofCaptchaToken('');
      setProofCaptchaResetKey((k) => k + 1);
      getCheckoutChallenge().then(setProofChallenge).catch(() => {});
    } catch (err: any) {
      const msg = err?.message || `Submission failed. Please email ${supportInfo.email}.`;
      setProofError(msg);
      setErrorMessage(msg);
      setProofCaptchaToken('');
      setProofCaptchaResetKey((k) => k + 1);
      getCheckoutChallenge().then(setProofChallenge).catch(() => {});
    } finally {
      setIsSubmittingProof(false);
    }
  };

  // Android TV Remote Control Keyboard Navigation (D-Pad support)
  useEffect(() => {
    const handleTvKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing into an input
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
        if (e.key === 'Enter') {
          handleActivate();
        }
        return;
      }

      const KEYPAD_BUTTONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLEAR', '0', 'BACK', 'ACTIVATE'];

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setFocusedKeyIndex(prev => (prev + 1) % KEYPAD_BUTTONS.length);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedKeyIndex(prev => (prev - 1 + KEYPAD_BUTTONS.length) % KEYPAD_BUTTONS.length);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedKeyIndex(prev => {
            if (prev === -1) return 0;
            if (prev >= 9 && prev <= 11) return 12; // jump to activate
            if (prev === 12) return 0;
            return Math.min(prev + 3, KEYPAD_BUTTONS.length - 1);
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedKeyIndex(prev => {
            if (prev === 12) return 10;
            if (prev <= 2) return -1; // focus input
            return Math.max(prev - 3, 0);
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedKeyIndex === -1) {
            handleActivate();
          } else if (focusedKeyIndex >= 0 && focusedKeyIndex <= 11) {
            const btnVal = KEYPAD_BUTTONS[focusedKeyIndex];
            handleKeypadPress(btnVal);
          } else if (focusedKeyIndex === 12) {
            handleActivate();
          }
          break;
        case 'Backspace':
          e.preventDefault();
          handleKeypadPress('BACK');
          break;
        default:
          if (/^[0-9]$/.test(e.key)) {
            handleKeypadPress(e.key);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleTvKeyDown);
    return () => window.removeEventListener('keydown', handleTvKeyDown);
  }, [focusedKeyIndex, inputCode]);

  const KEYPAD = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['CLEAR', '0', 'BACK']
  ];

  return (
    <div className="fixed inset-0 z-[99999] bg-[#030712] text-white flex flex-col justify-between overflow-y-auto overflow-x-hidden font-sans select-none p-4 sm:p-8 lg:p-12">
      
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top TV Header with Official Logo */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between pb-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <MrsIptvLogo className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl shadow-2xl border border-amber-400/40" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500">
                M R S IPTV
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Android TV Edition
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">
              Camellia Autonomous Live Sports & TV Stream Engine
            </p>
          </div>
        </div>

        {/* TV Hardware Badge */}
        <div className="hidden sm:flex items-center gap-2.5 bg-red-950/40 border border-red-500/40 px-4 py-2 rounded-xl text-red-300 text-xs font-bold">
          <Tv className="w-4 h-4 text-red-400 shrink-0" />
          <span>Android TV Hardware Detected</span>
          <Radio className="w-3.5 h-3.5 text-red-400 shrink-0" />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-7xl mx-auto py-8 sm:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        
        {/* Left Column: Access Blocked Notice & Activation Input */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          
          {/* Lock Banner */}
          <div className="bg-gradient-to-r from-amber-500/15 via-red-500/10 to-amber-500/5 border-2 border-amber-400/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Crown className="w-32 h-32 text-amber-400" />
            </div>
            
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-300 shadow-lg">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                  Access Restricted • VIP Only
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Android TV Premium VIP Access Required
                </h2>
              </div>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed">
              M R S IPTV on Android TV and Smart TV devices is reserved strictly for <strong className="text-amber-300 font-bold">Premium VIP Pass</strong> holders. Enjoy 8,890+ high-bitrate live channels, 4K/FHD sports (Cricket, Football, F1, IPL), zero buffering, and 100% ad-free playback.
            </p>

            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Single-Device Lock Protection</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <Tv className="w-4 h-4 text-cyan-400" />
                <span>Device ID: <span className="font-mono text-cyan-300">{tvDeviceId.slice(0, 18)}...</span></span>
              </div>
            </div>
          </div>

          {/* Code Input & Keypad */}
          <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                Enter VIP Activation Code (MRS-1M-XXXX-XXXX-XXXX)
              </label>
              <span className="text-[11px] text-slate-400 font-medium">
                Remote D-Pad or Keyboard Supported
              </span>
            </div>

            {/* Input Display Field */}
            <div className="relative mb-4">
              <input
                ref={inputRef}
                type="text"
                value={inputCode}
                onChange={(e) => {
                  setErrorMessage('');
                  setInputCode(formatActivationCodeInput(e.target.value));
                }}
                placeholder="MRS-1M-XXXX-XXXX-XXXX"
                className={`w-full bg-black/60 border-2 ${
                  focusedKeyIndex === -1 ? 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.3)]' : 'border-white/20'
                } rounded-xl px-5 py-4 text-xl sm:text-2xl font-mono font-black text-center tracking-[0.14em] text-amber-300 placeholder-white/20 focus:outline-none transition-all uppercase`}
                autoFocus
              />
              {inputCode && (
                <button
                  type="button"
                  onClick={() => setInputCode('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-2"
                  title="Clear"
                >
                  <Delete className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Error & Success Feedback */}
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-500/50 rounded-xl text-red-200 text-xs sm:text-sm flex items-center gap-2 animate-shake">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs sm:text-sm flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* On-Screen Remote Virtual Keypad */}
            <div className="space-y-2 mb-4">
              {KEYPAD.map((row, rIdx) => (
                <div key={rIdx} className="grid grid-cols-3 gap-2">
                  {row.map((val, cIdx) => {
                    const btnIndex = rIdx * 3 + cIdx;
                    const isFocused = focusedKeyIndex === btnIndex;
                    const isAction = val === 'CLEAR' || val === 'BACK';

                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleKeypadPress(val)}
                        className={`h-12 sm:h-14 rounded-xl font-mono text-lg sm:text-xl font-bold flex items-center justify-center transition-all ${
                          isAction 
                            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 active:scale-95' 
                            : 'bg-black/50 text-white hover:bg-amber-500/20 active:scale-95 border border-white/10'
                        } ${
                          isFocused ? 'ring-4 ring-amber-400 bg-amber-500/30 text-amber-200 scale-[1.03] shadow-lg' : ''
                        }`}
                      >
                        {val === 'BACK' ? <Delete className="w-5 h-5" /> : val}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Big Action Activate Button */}
            <button
              type="button"
              onClick={() => handleActivate()}
              disabled={isActivating || !inputCode.trim()}
              className={`w-full py-4 rounded-xl font-black text-base sm:text-lg flex items-center justify-center gap-3 transition-all uppercase tracking-wider ${
                focusedKeyIndex === 12 ? 'ring-4 ring-white scale-[1.02]' : ''
              } ${
                isActivating || !inputCode.trim()
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/10'
                  : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-slate-950 shadow-[0_0_30px_rgba(245,158,11,0.5)] hover:brightness-110 active:scale-98'
              }`}
            >
              {isActivating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Verifying Single-Device VIP Pass...</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  <span>Activate VIP Access & Enter TV Mode</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Pricing & Payment Options */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          
          {/* VIP Pricing Packages Card */}
          <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  VIP Pass Packages
                </h3>
              </div>
              <div className="flex bg-black/50 p-1 rounded-lg border border-white/10 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActivePaymentTab('bd')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    activePaymentTab === 'bd' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  BDT (৳)
                </button>
                <button
                  type="button"
                  onClick={() => setActivePaymentTab('intl')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    activePaymentTab === 'intl' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  USD ($)
                </button>
              </div>
            </div>

            {/* Packages Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { months: '1 Month', bdt: '110 TK', usd: '$1', note: 'Standard' },
                { months: '2 Months', bdt: '210 TK', usd: '$2', note: 'Save 10 TK' },
                { months: '6 Months', bdt: '610 TK', usd: '$6', note: 'Save 50 TK' },
                { months: '12 Months', bdt: '1220 TK', usd: '$12', note: 'Best Value' },
              ].map((pkg, idx) => (
                <div 
                  key={idx}
                  className="bg-black/50 border border-white/10 rounded-xl p-3 flex flex-col justify-between hover:border-amber-400/50 transition-all"
                >
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                      {pkg.note}
                    </span>
                    <h4 className="text-xs font-bold text-slate-300">{pkg.months}</h4>
                  </div>
                  <div className="mt-2 text-base font-black text-white">
                    {activePaymentTab === 'bd' ? pkg.bdt : pkg.usd}
                  </div>
                </div>
              ))}
            </div>

            {/* Payment Method Selector */}
            <div className="mb-4">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                Select Payment Channel:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'bkash', label: 'bKash', color: 'text-pink-400' },
                  { id: 'nagad', label: 'Nagad', color: 'text-orange-400' },
                  { id: 'binance', label: 'Binance', color: 'text-amber-400' },
                  { id: 'skrill', label: 'Skrill', color: 'text-rose-400' },
                  { id: 'payoneer', label: 'Payoneer', color: 'text-amber-300' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMethod(m.id as any)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      selectedMethod === m.id
                        ? 'bg-white/15 border-amber-400 text-white shadow-md'
                        : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className={m.color}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Payment Credentials Card */}
            <div className="bg-black/70 border border-amber-500/30 rounded-xl p-4 space-y-3">
              {(() => {
                const dyn = paymentMethods.find((m) => m.id === selectedMethod);
                if (selectedMethod === 'bkash') {
                  const acct = dyn?.account || '01810853282';
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-pink-400">bKash Personal (Send Money)</span>
                        <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded border border-pink-500/30">Bangladesh</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-white/10 font-mono text-sm text-white">
                        <span className="font-bold">{acct}</span>
                        <button type="button" onClick={() => handleCopy(acct, 'bkash')} className="p-2 min-h-[36px] min-w-[36px] hover:text-amber-300 text-slate-400 transition" title="Copy">
                          {copiedKey === 'bkash' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </>
                  );
                }
                if (selectedMethod === 'nagad') {
                  const acct = dyn?.account || '+8801792322734';
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-orange-400">Nagad Personal (Send Money)</span>
                        <span className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded border border-orange-500/30">Bangladesh</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-white/10 font-mono text-sm text-white">
                        <span className="font-bold">{acct}</span>
                        <button type="button" onClick={() => handleCopy(acct, 'nagad')} className="p-2 min-h-[36px] min-w-[36px] hover:text-amber-300 text-slate-400 transition" title="Copy">
                          {copiedKey === 'nagad' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </>
                  );
                }
                if (selectedMethod === 'binance') {
                  const uid = dyn?.account || '38927942';
                  const payId = dyn?.secondaryAccount || 'mrxshahin';
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400">Binance Pay (Crypto Zero Fee)</span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">BD & Global</span>
                      </div>
                      <div className="space-y-1.5 font-mono text-xs">
                        <div className="flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-white/10">
                          <span className="text-slate-400">UID: <strong className="text-white">{uid}</strong></span>
                          <button type="button" onClick={() => handleCopy(uid, 'binance_uid')} className="p-1.5 text-slate-400 hover:text-white">
                            {copiedKey === 'binance_uid' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-white/10">
                          <span className="text-slate-400">ID: <strong className="text-white">{payId}</strong></span>
                          <button type="button" onClick={() => handleCopy(payId, 'binance_id')} className="p-1.5 text-slate-400 hover:text-white">
                            {copiedKey === 'binance_id' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </>
                  );
                }
                if (selectedMethod === 'skrill') {
                  const acct = dyn?.account || '407108385';
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-400">Skrill Money Transfer</span>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">International</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-white/10 font-mono text-sm text-white">
                        <span className="text-slate-400">Customer ID: <strong className="text-white">{acct}</strong></span>
                        <button type="button" onClick={() => handleCopy(acct, 'skrill')} className="p-2 min-h-[36px] min-w-[36px] text-slate-400 hover:text-white">
                          {copiedKey === 'skrill' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </>
                  );
                }
                const payoneerAcct = dyn?.account || '108003450';
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300">Payoneer Make a Payment</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">International</span>
                    </div>
                    <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-white/10 font-mono text-sm text-white">
                      <span className="text-slate-400">Customer ID: <strong className="text-white">{payoneerAcct}</strong></span>
                      <button type="button" onClick={() => handleCopy(payoneerAcct, 'payoneer')} className="p-2 min-h-[36px] min-w-[36px] text-slate-400 hover:text-white">
                        {copiedKey === 'payoneer' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                );
              })()}

              <p className="text-[11px] text-slate-400 leading-normal">
                After completing payment, submit your TrxID below. Once server verification completes, your activation code is sent directly to your email.
              </p>
            </div>

            {/* Quick Submit Proof Button */}
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowProofModal(true)}
                className="w-full min-h-[44px] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Submit Payment Confirmation / TxID</span>
              </button>
            </div>
          </div>

          {/* Direct Admin Contact */}
          <div className="bg-black/50 border border-white/10 rounded-2xl p-4 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              <span>Admin: <strong className="text-white">{supportInfo.email}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              <span>WhatsApp: <strong className="text-white">{supportInfo.whatsapp}</strong></span>
            </div>
          </div>

        </div>

      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-7xl mx-auto pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <div>
          M R S IPTV Autonomous Platform • Powered by Camellia Continuous Stream Engine
        </div>
        <div className="flex items-center gap-4 tabular-nums">
          <span>8,890+ Live Channels</span>
          <span>•</span>
          <span>Ultra-Low Latency HLS</span>
          <span>•</span>
          <span>Zero Buffering</span>
        </div>
      </footer>

      {/* Payment Proof Modal for TV */}
      {showProofModal && (
        <div className="fixed inset-0 z-[100000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-400/50 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowProofModal(false)}
              aria-label="Close payment modal"
              className="absolute top-3.5 right-3.5 w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-white flex items-center gap-2 mb-2">
              <Send className="w-5 h-5 text-amber-400" />
              Submit Payment Confirmation
            </h3>
            <p className="text-xs text-slate-300 mb-4">
              Send your payment details directly to M R S and Camellia. Your code will be dispatched immediately.
            </p>

            {proofSuccess ? (
              <div className="p-4 bg-emerald-950/80 border border-emerald-500 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">
                  {proofSuccess.status === 'verified'
                    ? `AI Verified (${proofSuccess.orderId})`
                    : `Order Submitted (${proofSuccess.orderId})`}
                </h4>
                <p className="text-xs text-emerald-200">
                  {proofSuccess.status === 'verified'
                    ? `Your ${proofPackage}-Month VIP activation code has been automatically verified and emailed to `
                    : 'Backend AI is verifying your payment details. Your exact-month VIP activation code will be emailed to '}
                  <strong>{proofEmail}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setProofSuccess(null);
                    setShowProofModal(false);
                  }}
                  className="mt-3 px-4 min-h-[44px] py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Return to Activation Screen
                </button>
              </div>
            ) : (
              <form onSubmit={handleProofSubmit} className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Full Name:
                  </label>
                  <input
                    type="text"
                    value={proofName}
                    onChange={(e) => setProofName(e.target.value)}
                    placeholder="e.g. Mahmudul Hasan"
                    className="w-full min-h-[44px] bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Your Mobile / Sender Number:
                  </label>
                  <input
                    type="text"
                    value={proofSender}
                    onChange={(e) => setProofSender(e.target.value)}
                    placeholder="e.g. +88017..."
                    className="w-full min-h-[44px] bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Email Address (For Activation Code Delivery):
                  </label>
                  <input
                    type="email"
                    value={proofEmail}
                    onChange={(e) => setProofEmail(e.target.value)}
                    placeholder="e.g. you@gmail.com"
                    className="w-full min-h-[44px] bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Transaction ID / Reference:
                  </label>
                  <input
                    type="text"
                    value={proofTxId}
                    onChange={(e) => setProofTxId(e.target.value)}
                    placeholder="e.g. 9J47K2L89A or Binance Order ID"
                    className="w-full bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    VIP Plan Duration:
                  </label>
                  <select
                    value={proofPackage}
                    onChange={(e) => setProofPackage(e.target.value as any)}
                    className="w-full bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="1">1 Month Pass (110 TK / $1)</option>
                    <option value="2">2 Months Pass (210 TK / $2)</option>
                    <option value="6">6 Months Pass (610 TK / $6)</option>
                    <option value="12">12 Months Pass (1220 TK / $12)</option>
                  </select>
                </div>

                {/* Anti-spam honeypot field (hidden from genuine users) */}
                <div className="fixed -left-[9999px] top-0 w-px h-px overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
                  <label htmlFor="tv_website_url">Website</label>
                  <input
                    id="tv_website_url"
                    name="website_url"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={proofWebsiteUrl}
                    onChange={(e) => setProofWebsiteUrl(e.target.value)}
                  />
                </div>

                <CaptchaChallengeWidget
                  turnstileSiteKey={proofChallenge?.turnstileSiteKey}
                  hcaptchaSiteKey={proofChallenge?.hcaptchaSiteKey}
                  resetKey={proofCaptchaResetKey}
                  onTokenChange={setProofCaptchaToken}
                />

                {proofError && (
                  <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-500/50 text-xs text-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{proofError}</span>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowProofModal(false)}
                    className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingProof}
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg"
                  >
                    {isSubmittingProof ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Submit Proof</span>
                  </button>
                </div>

                <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Protected by Anti-Spam Checkout Shield</span>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
