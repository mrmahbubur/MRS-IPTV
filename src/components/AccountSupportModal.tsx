import React, { useEffect, useState } from 'react';
import {
  X,
  UserCheck,
  Crown,
  Smartphone,
  Trash2,
  LogOut,
  MessageCircle,
  Send,
  Mail,
  HelpCircle,
  ChevronDown,
  Star,
  History,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { AdFreeState } from '../types';
import {
  clearVipSession,
  EntitlementData,
  getPaymentMethods,
  getVipStatus,
  removeDevice,
  submitSupportContact,
} from '../lib/mrsVip';

interface AccountSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'account' | 'support';
  adFreeState: AdFreeState;
  onStateChange: (state: AdFreeState) => void;
  onOpenPremiumModal: () => void;
  onOpenLegalModal: (tab?: 'terms' | 'dmca' | 'vip' | 'refund' | 'privacy' | 'security' | 'about') => void;
  favoritesCount: number;
  watchHistoryCount: number;
  onClearWatchHistory: () => void;
  onNavigateFavorites: () => void;
}

export const AccountSupportModal: React.FC<AccountSupportModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'account',
  adFreeState,
  onStateChange,
  onOpenPremiumModal,
  onOpenLegalModal,
  favoritesCount,
  watchHistoryCount,
  onClearWatchHistory,
  onNavigateFavorites,
}) => {
  const [activeTab, setActiveTab] = useState<'account' | 'support'>(initialTab);
  const [statusData, setStatusData] = useState<EntitlementData | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [removingHash, setRemovingHash] = useState<string | null>(null);
  const [deviceBanner, setDeviceBanner] = useState<string | null>(null);

  const [supportLinks, setSupportLinks] = useState<{
    whatsapp: string;
    telegram?: string;
    facebook?: string;
    email: string;
  }>({
    whatsapp: '+8801810853282',
    telegram: 'https://t.me/mrsiptv',
    facebook: 'https://facebook.com',
    email: 'mr216873@gmail.com',
  });

  // Contact form
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('Activation / Payment Inquiry');
  const [contactMessage, setContactMessage] = useState('');
  const [isSendingContact, setIsSendingContact] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadAccountStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const s = await getVipStatus();
      setStatusData(s);
    } catch {
      setStatusData(null);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadAccountStatus();
    getPaymentMethods()
      .then((res) => {
        if (res?.support) setSupportLinks(res.support);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const isVip = Boolean(statusData?.active || adFreeState.isActive || adFreeState.isAdFree);
  const expiryIso = statusData?.expiresAt || adFreeState.expiryDate;
  const daysRemaining =
    statusData?.daysRemaining ??
    (expiryIso ? Math.max(0, Math.ceil((Date.parse(expiryIso) - Date.now()) / 86400_000)) : 0);

  const handleRemoveDevice = async (deviceHash: string) => {
    setRemovingHash(deviceHash);
    setDeviceBanner(null);
    try {
      await removeDevice(deviceHash);
      setDeviceBanner('Device slot removed cleanly.');
      await loadAccountStatus();
    } catch (e: any) {
      setDeviceBanner(e?.message || 'Could not remove device.');
    } finally {
      setRemovingHash(null);
    }
  };

  const handleLogoutVip = () => {
    clearVipSession();
    onStateChange({
      isActive: false,
      code: '',
      deviceId: adFreeState.deviceId,
      activatedAt: '',
      expiryDate: '',
      durationMonths: 1,
    });
    setStatusData({ active: false });
    setDeviceBanner('VIP session cleared from this browser.');
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactFeedback(null);
    setIsSendingContact(true);
    try {
      const r = await submitSupportContact({
        name: contactName.trim(),
        email: contactEmail.trim(),
        subject: contactSubject.trim(),
        message: contactMessage.trim(),
      });
      setContactFeedback({
        ok: true,
        msg: r.message || `Ticket #${r.ticketId} received. We will respond via email shortly.`,
      });
      setContactMessage('');
    } catch (e: any) {
      setContactFeedback({ ok: false, msg: e?.message || 'Failed to send support message.' });
    } finally {
      setIsSendingContact(false);
    }
  };

  const waHref = `https://wa.me/${supportLinks.whatsapp.replace(/[^\d]/g, '') || '8801810853282'}`;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0B0D12] border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.95)] overflow-hidden my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#141821] border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#F5B301]/15 border border-[#F5B301]/40 text-[#F5B301] flex items-center justify-center shrink-0">
              {activeTab === 'account' ? <UserCheck className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white truncate">
                {activeTab === 'account' ? 'Account, Devices & Library' : 'Support Center & Contact'}
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                M R S IPTV · TV NETWORK Member Desk
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close Account and Support modal"
            onClick={onClose}
            className="w-11 h-11 rounded-lg bg-[#0B0D12] border border-white/10 hover:border-white/30 text-[#C9D1E0] hover:text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-[#141821] p-1.5 gap-1.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`flex-1 min-h-[44px] rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'account'
                ? 'bg-white/15 text-white border border-white/25 font-extrabold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Crown className="w-4 h-4 text-[#F5B301]" />
            <span>Account &amp; Devices</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('support')}
            className={`flex-1 min-h-[44px] rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'support'
                ? 'bg-white/15 text-white border border-white/25 font-extrabold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <MessageCircle className="w-4 h-4 text-[#38BDF8]" />
            <span>Support &amp; FAQ</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-5 flex-1">
          {activeTab === 'account' && (
            <>
              {/* Active Plan Card */}
              <div className={`p-4 rounded-xl border ${isVip ? 'bg-[#F5B301]/10 border-[#F5B301]/45' : 'bg-[#141821] border-white/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className={`text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                      isVip ? 'bg-[#F5B301] text-[#0B0D12]' : 'bg-white/10 text-[#C9D1E0]'
                    }`}>
                      {isVip ? 'VIP PASS ACTIVE' : 'FREE ACCESS'}
                    </span>
                    <h3 className="text-base font-black text-white mt-1.5">
                      {statusData?.planLabel || (isVip ? `${adFreeState.durationMonths} Month VIP Pass` : 'Standard Free-to-Air Plan')}
                    </h3>
                    {statusData?.email && (
                      <p className="text-xs font-mono text-[#C9D1E0] mt-0.5">{statusData.email}</p>
                    )}
                  </div>

                  <div className="text-right font-mono tabular-nums">
                    {isVip ? (
                      <>
                        <div className="text-2xl font-black text-[#F5B301]">{daysRemaining}d</div>
                        <div className="text-[11px] text-[#C9D1E0]">
                          {expiryIso ? `Expires ${new Date(expiryIso).toLocaleDateString()}` : 'Active Session'}
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenPremiumModal();
                        }}
                        className="min-h-[44px] px-4 rounded-xl bg-[#F5B301] text-[#0B0D12] font-black text-xs uppercase tracking-wider cursor-pointer"
                      >
                        Upgrade to VIP
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Library Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onNavigateFavorites();
                    onClose();
                  }}
                  className="p-4 rounded-xl bg-[#141821] border border-white/10 hover:border-amber-400/50 text-left flex items-center justify-between cursor-pointer min-h-[64px]"
                >
                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-xs font-bold text-white">Saved Favorites</div>
                      <div className="text-[11px] text-[#94A3B8]">Open channel bookmarks</div>
                    </div>
                  </div>
                  <span className="font-mono text-lg font-black text-amber-400 tabular-nums">{favoritesCount}</span>
                </button>

                <div className="p-4 rounded-xl bg-[#141821] border border-white/10 flex items-center justify-between min-h-[64px]">
                  <div className="flex items-center gap-3">
                    <History className="w-5 h-5 text-[#38BDF8]" />
                    <div>
                      <div className="text-xs font-bold text-white">Watch History</div>
                      <div className="text-[11px] text-[#94A3B8] font-mono tabular-nums">{watchHistoryCount} watched</div>
                    </div>
                  </div>
                  {watchHistoryCount > 0 && (
                    <button
                      type="button"
                      onClick={onClearWatchHistory}
                      className="min-h-[36px] px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Linked Devices Section */}
              <div className="p-4 rounded-xl bg-[#141821] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#38BDF8]" />
                    <span>Registered Devices ({statusData?.devices?.length ?? (isVip ? 1 : 0)} / {statusData?.deviceLimit ?? 2})</span>
                  </h4>
                  {isLoadingStatus && <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8]" />}
                </div>

                {deviceBanner && (
                  <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded-lg px-3 py-2">
                    {deviceBanner}
                  </p>
                )}

                {statusData?.devices && statusData.devices.length > 0 ? (
                  <div className="space-y-2">
                    {statusData.devices.map((d) => (
                      <div
                        key={d.deviceHash}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0B0D12] border border-white/10 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-white flex items-center gap-2">
                            <span className="truncate">{d.label}</span>
                            {d.isCurrent && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                                This Device
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#94A3B8] font-mono">
                            ID: {d.deviceHash.slice(0, 12)} · Seen {new Date(d.lastSeen).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={removingHash === d.deviceHash}
                          onClick={() => handleRemoveDevice(d.deviceHash)}
                          className="min-h-[38px] px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 font-bold flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#94A3B8]">
                    {isVip
                      ? 'Active on this device. Redeem with your email to manage multi-device slots.'
                      : 'No VIP entitlement linked to this browser yet.'}
                  </p>
                )}

                {isVip && (
                  <div className="pt-2 border-t border-white/10 flex justify-end">
                    <button
                      type="button"
                      onClick={handleLogoutVip}
                      className="min-h-[44px] px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-rose-200 text-xs font-bold flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out VIP Session</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Legal Links */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                {(['terms', 'refund', 'privacy', 'dmca', 'about'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenLegalModal(tab);
                    }}
                    className="min-h-[36px] px-3 rounded-lg bg-[#141821] hover:bg-white/10 border border-white/10 text-[#C9D1E0] hover:text-white font-semibold capitalize cursor-pointer"
                  >
                    {tab === 'dmca' ? 'DMCA' : tab === 'refund' ? 'Refund Policy' : tab}
                  </button>
                ))}
              </div>
            </>
          )}

          {activeTab === 'support' && (
            <>
              {/* Direct Channels */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-3 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>WhatsApp</span>
                </a>
                <a
                  href={supportLinks.telegram || 'https://t.me/mrsiptv'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-3 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-300 text-xs font-extrabold flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4 shrink-0" />
                  <span>Telegram</span>
                </a>
                <a
                  href={supportLinks.facebook || 'https://facebook.com'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-3 py-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/40 text-blue-300 text-xs font-extrabold flex items-center justify-center gap-2"
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span>Facebook</span>
                </a>
              </div>

              {/* Support Contact Form */}
              <form onSubmit={handleContactSubmit} className="p-4 rounded-xl bg-[#141821] border border-white/10 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#38BDF8]" />
                  <span>Send Support Message ({supportLinks.email})</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#0B0D12] border border-white/15 text-xs text-white focus:outline-none focus:border-[#38BDF8]"
                  />
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="Your Email"
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#0B0D12] border border-white/15 text-xs text-white focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>

                <input
                  type="text"
                  value={contactSubject}
                  onChange={(e) => setContactSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#0B0D12] border border-white/15 text-xs text-white focus:outline-none focus:border-[#38BDF8]"
                />

                <textarea
                  required
                  rows={3}
                  minLength={10}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="Describe your order ID, payment TrxID, or playback issue..."
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0B0D12] border border-white/15 text-xs text-white focus:outline-none focus:border-[#38BDF8]"
                />

                {contactFeedback && (
                  <div
                    className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
                      contactFeedback.ok
                        ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                        : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                    }`}
                  >
                    {contactFeedback.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{contactFeedback.msg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingContact}
                  className="w-full min-h-[44px] px-4 rounded-xl btn-premium-primary text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSendingContact ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{isSendingContact ? 'Sending...' : 'Submit Support Ticket'}</span>
                </button>
              </form>

              {/* FAQ Accordion */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#F5B301]" />
                  <span>Common Troubleshooting</span>
                </h4>
                {[
                  {
                    q: 'I paid via bKash/Nagad and have my Order Ref — where is my code?',
                    a: 'Once our SMS forwarder or admin ledger matches your exact TrxID and amount, your MRS activation code is sent directly to your email (check Inbox and Spam).'
                  },
                  {
                    q: 'Why does a code say DEVICE_LIMIT?',
                    a: 'Each entitlement allows up to 2 linked devices by default. Use the Account & Devices tab here to remove an old device before activating on a new TV or phone.'
                  },
                  {
                    q: 'A channel is buffering or fails to start.',
                    a: 'Use the Stream Doctor / Source Switch inside the player or select a backup regional server.'
                  }
                ].map((item, idx) => (
                  <div key={idx} className="rounded-xl bg-[#141821] border border-white/10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-xs font-bold text-white flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span>{item.q}</span>
                      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === idx ? 'rotate-180 text-[#F5B301]' : 'text-[#94A3B8]'}`} />
                    </button>
                    {openFaq === idx && (
                      <div className="px-3.5 pb-3 pt-2 border-t border-white/5 text-[11px] text-[#C9D1E0] leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
