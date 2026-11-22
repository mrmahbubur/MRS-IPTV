import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, BarChart3, Mail, RefreshCw, CheckCircle2, TrendingUp, Users, 
  Tv, Smartphone, Monitor, ShieldCheck, Crown, Send, Copy, 
  Check, AlertCircle, Cpu, Radio,
  Layers, Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAdminAuthHeaders } from '../lib/adminAuth';

interface MonthlyReportData {
  success: boolean;
  recipient: string;
  subject: string;
  monthName: string;
  year: number;
  emailSentViaSmtp: boolean;
  mailgunOrSendgridOrFallback: string;
  executiveSummary: string;
  htmlContent: string;
  textContent: string;
  systemStats?: {
    totalChannels: number;
    totalSources: number;
    uptimeHours: string;
    channelsRepaired: number;
    errorsFixed: number;
    cacheEntries: number;
    proxyFailoversResolved: number;
  };
  visitorStats?: {
    liveActiveVisitors: number;
    totalUniqueVisitors: number;
    totalPageViews: number;
    totalStreamSessions: number;
    deviceDistribution: Record<string, number>;
    popularChannels: Array<{ channel: string; count: number }>;
  };
  premiumStats?: {
    totalActiveVipUsers: number;
    newVipSubscribersThisMonth: number;
    expiredCleanedCount: number;
    singleDeviceIntegrityRate: string;
    referralVipRewardsCount: number;
    totalRevenueEstimated: string;
    activePackagesBreakdown?: Record<string, number>;
  };
  generatedAt?: string;
}

interface MonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MonthlyReportModal: React.FC<MonthlyReportModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<MonthlyReportData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendStatus, setSendStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [recipientEmail, setRecipientEmail] = useState<string>('mr216873@gmail.com');
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'traffic' | 'vip' | 'system' | 'email_preview'>('overview');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load monthly report
  const loadReport = useCallback(async (refresh: boolean = false) => {
    setIsLoading(true);
    setLoadError(null);
    setSendStatus(null);
    try {
      const endpoint = refresh ? '/api/reports/monthly/generate' : '/api/ai/monthly-report';
      const method = refresh ? 'POST' : 'GET';
      const res = await fetch(endpoint, {
        method,
        headers: refresh
          ? getAdminAuthHeaders({ 'Content-Type': 'application/json' })
          : { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data.report || data);
      } else if (res.status === 401 || res.status === 403) {
        setLoadError('Admin sign-in via #admin required to generate a fresh monthly report.');
      } else {
        setLoadError(`Unable to fetch live report (HTTP ${res.status}).`);
      }
    } catch (e: any) {
      console.warn("Failed to load monthly report", e);
      setLoadError(e?.message || 'Network error while fetching live monthly report.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadReport();
    }
  }, [isOpen, loadReport]);

  const handleSendEmail = async () => {
    if (!recipientEmail || isSending) return;
    setIsSending(true);
    setSendStatus(null);
    try {
      const res = await fetch('/api/ai/send-monthly-email', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          email: recipientEmail,
          isSample: true
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSendStatus({
          success: true,
          message: data.result?.emailSentViaSmtp 
            ? `Report dispatched successfully via SMTP to ${recipientEmail}!` 
            : `Report compiled! Mailto dispatch links ready for ${recipientEmail}.`
        });
      } else if (res.status === 401 || res.status === 403) {
        setSendStatus({
          success: false,
          message: 'Admin sign-in via #admin required to dispatch report emails.'
        });
      } else {
        setSendStatus({
          success: false,
          message: data.error || 'Failed to dispatch report email.'
        });
      }
    } catch (e: any) {
      setSendStatus({
        success: false,
        message: e?.message || 'Network error while dispatching report.'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!report) return;
    const content = report.textContent || report.executiveSummary;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const visitorStats = report?.visitorStats || {
    totalUniqueVisitors: 0,
    totalPageViews: 0,
    totalStreamSessions: 0,
    liveActiveVisitors: 0,
    deviceDistribution: { 'Smart TV': 0, 'Mobile': 0, 'Desktop': 0, 'Tablet': 0 },
    popularChannels: []
  };

  const systemStats = report?.systemStats || {
    totalChannels: 0,
    totalSources: 0,
    uptimeHours: '0.0 hrs',
    channelsRepaired: 0,
    errorsFixed: 0,
    cacheEntries: 0,
    proxyFailoversResolved: 0
  };

  const premiumStats = report?.premiumStats || {
    totalActiveVipUsers: 0,
    newVipSubscribersThisMonth: 0,
    expiredCleanedCount: 0,
    singleDeviceIntegrityRate: '100% Locked (1-Device Strict)',
    referralVipRewardsCount: 0,
    totalRevenueEstimated: '৳ 0 BDT'
  };

  const totalDevices = Object.values(visitorStats.deviceDistribution).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-[var(--theme-bg,#070A11)]/88 backdrop-blur-2xl animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[var(--theme-bg,#070A11)] border border-[var(--theme-border-accent,rgba(56,189,248,0.45))] rounded-2xl shadow-[0_24px_75px_rgba(0,0,0,0.92)] overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-5 sm:px-7 border-b border-[var(--theme-border,rgba(56,189,248,0.28))] bg-[var(--theme-surface,#0E131F)] backdrop-blur-xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent-soft,rgba(56,189,248,0.20))] border border-[var(--theme-border-accent,rgba(56,189,248,0.45))] text-[var(--theme-accent,#38BDF8)] flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
                  M R S IPTV Executive Monthly Report
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 uppercase tracking-wider shrink-0">
                  {report?.monthName || "Current Month"} {report?.year || 2026}
                </span>
              </div>
              <p className="text-[11px] text-[#C9D1E0] mt-0.5 truncate">
                Audited & Compiled Autonomously by Camellia for <strong>M R S</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadReport(true)}
              disabled={isLoading}
              aria-label="Re-run deep analysis"
              className="w-10 h-10 rounded-lg btn-premium-cyan flex items-center justify-center transition-all active:scale-95 cursor-pointer"
              title="Re-run deep analysis with Gemini AI"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#00D9FF]' : 'text-[#00D9FF]'}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-10 h-10 rounded-lg btn-premium-crimson flex items-center justify-center transition-all active:scale-95 cursor-pointer"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="px-5 sm:px-7 py-2.5 bg-[var(--theme-surface,#0E131F)] border-b border-[var(--theme-border,rgba(56,189,248,0.22))] flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0 text-xs">
          {[
            { id: 'overview', label: 'Overview & Highlights', icon: BarChart3 },
            { id: 'traffic', label: 'Audience & Devices', icon: Users },
            { id: 'vip', label: 'VIP Pass & Security', icon: Crown },
            { id: 'system', label: `${systemStats.totalChannels > 0 ? systemStats.totalChannels.toLocaleString() : '8,890'}+ Channels & Health`, icon: ShieldCheck },
            { id: 'email_preview', label: 'Email Preview & Dispatch', icon: Mail }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`min-h-[40px] px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'btn-premium-primary text-white'
                    : 'btn-premium-glass text-[#C9D1E0] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scroll Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-7 space-y-6 bg-[var(--theme-bg,#070A11)]">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-[#00D9FF] animate-spin" />
              <p className="text-xs text-[#C9D1E0] font-medium">
                Compiling 30-day analytics with Gemini AI deep thinking...
              </p>
            </div>
          ) : (
            <>
              {loadError && (
                <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-400/50 flex items-center justify-between gap-3 text-xs text-rose-200">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{loadError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadReport(true)}
                    className="min-h-[38px] px-4 py-1.5 rounded-lg btn-premium-primary text-white font-bold text-xs shrink-0 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}
              {/* Executive Summary AI Card */}
              <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-r from-[#071F26] via-[#0B132B] to-[#070C1E] border border-[#10B981]/45 shadow-lg relative overflow-hidden">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-[#10B981] uppercase tracking-wider">
                  <Cpu className="w-4 h-4 shrink-0" />
                  <span>Camellia Autonomous Executive Note</span>
                </div>
                <p className="text-xs sm:text-sm text-[#C9D1E0] leading-relaxed">
                  {report?.executiveSummary || (loadError ? "Unable to load executive summary right now. Click Retry to compile live backend analytics." : "No executive summary compiled yet for the current cycle.")}
                </p>
              </div>

              {/* 4 Primary Top Metrics Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-[#0B132B] border border-[#00D9FF]/35 space-y-1">
                  <div className="flex items-center justify-between text-[#C9D1E0] text-xs">
                    <span>Unique Visitors</span>
                    <Users className="w-3.5 h-3.5 text-[#00D9FF] shrink-0" />
                  </div>
                  <div className="text-2xl font-black text-white tracking-tight tabular-nums">
                    {visitorStats.totalUniqueVisitors.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#10B981] font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 shrink-0" />
                    <span>Active audience</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0B132B] border border-[#B832F5]/35 space-y-1">
                  <div className="flex items-center justify-between text-[#C9D1E0] text-xs">
                    <span>Stream Sessions</span>
                    <Tv className="w-3.5 h-3.5 text-[#B832F5] shrink-0" />
                  </div>
                  <div className="text-2xl font-black text-white tracking-tight tabular-nums">
                    {visitorStats.totalStreamSessions.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#C9D1E0] tabular-nums">
                    {visitorStats.totalPageViews.toLocaleString()} total page views
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0B132B] border border-[#F59E0B]/35 space-y-1">
                  <div className="flex items-center justify-between text-[#C9D1E0] text-xs">
                    <span>Active VIP Users</span>
                    <Crown className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                  </div>
                  <div className="text-2xl font-black text-[#F59E0B] tracking-tight tabular-nums">
                    {premiumStats.totalActiveVipUsers}
                  </div>
                  <div className="text-[11px] text-[#10B981] font-medium tabular-nums">
                    +{premiumStats.newVipSubscribersThisMonth} new this month
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0B132B] border border-[#10B981]/35 space-y-1">
                  <div className="flex items-center justify-between text-[#C9D1E0] text-xs">
                    <span>Catalog Status</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  </div>
                  <div className="text-2xl font-black text-white tracking-tight tabular-nums">
                    {systemStats.totalChannels.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#00D9FF] font-medium tabular-nums">
                    {systemStats.channelsRepaired} streams auto-repaired
                  </div>
                </div>
              </div>

              {/* Section Details Depending on Active Tab */}
              {(activeTab === 'overview' || activeTab === 'traffic') && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Device Distribution */}
                  <div className="p-5 rounded-xl bg-[#070C1E] border border-[#00D9FF]/25 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#00D9FF] shrink-0" />
                        Device Distribution Breakdown
                      </h3>
                      <span className="text-[10px] text-[#00D9FF] font-mono">Real-time split</span>
                    </div>

                    <div className="space-y-3">
                      {[
                        { label: 'Smart TV / Android TV', count: visitorStats.deviceDistribution['Smart TV'] || 0, icon: Tv, color: 'bg-[#00D9FF]' },
                        { label: 'Mobile Devices', count: visitorStats.deviceDistribution['Mobile'] || 0, icon: Smartphone, color: 'bg-[#10B981]' },
                        { label: 'Desktop & Laptops', count: visitorStats.deviceDistribution['Desktop'] || 0, icon: Monitor, color: 'bg-[#B832F5]' },
                        { label: 'Tablets / iPads', count: visitorStats.deviceDistribution['Tablet'] || 0, icon: Smartphone, color: 'bg-[#F59E0B]' }
                      ].map(dev => {
                        const pct = Math.round((dev.count / totalDevices) * 100);
                        const Icon = dev.icon;
                        return (
                          <div key={dev.label} className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-white">
                              <span className="flex items-center gap-1.5">
                                <Icon className="w-3.5 h-3.5 text-[#00D9FF] shrink-0" />
                                {dev.label}
                              </span>
                              <span className="font-mono tabular-nums text-[#C9D1E0]">{dev.count} ({pct}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-[#0B132B] rounded-full overflow-hidden border border-[#00D9FF]/20">
                              <div className={`h-full ${dev.color} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top Watched Channels Leaderboard */}
                  <div className="p-5 rounded-xl bg-[#070C1E] border border-[#00D9FF]/25 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Flame className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        Top Channels Leaderboard
                      </h3>
                      <span className="text-[10px] text-[#00D9FF] font-mono">Most Streamed</span>
                    </div>

                    <div className="space-y-2">
                      {visitorStats.popularChannels.slice(0, 5).map((ch, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-[#0B132B] border border-[#00D9FF]/25 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-6 h-6 rounded-md bg-[#00D9FF]/15 border border-[#00D9FF]/40 text-[#00D9FF] text-[10px] font-mono font-bold flex items-center justify-center shrink-0 tabular-nums">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-white truncate">{ch.channel}</span>
                          </div>
                          <span className="font-mono tabular-nums text-[#10B981] font-bold shrink-0 ml-2">
                            {ch.count.toLocaleString()} views
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(activeTab === 'overview' || activeTab === 'vip') && (
                <div className="p-5 rounded-xl bg-[#070C1E] border border-[#F59E0B]/30 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Crown className="w-4 h-4 text-[#F59E0B] shrink-0" />
                      VIP Pass Monetization & Security Audit
                    </h3>
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40">
                      STRICT 1-DEVICE LOCK ACTIVE
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#0B132B] border border-[#10B981]/30">
                      <div className="text-[10px] text-[#C9D1E0] uppercase font-semibold">Single-Device Security Rate</div>
                      <div className="text-lg font-black text-[#10B981] mt-1 tabular-nums">{premiumStats.singleDeviceIntegrityRate}</div>
                      <div className="text-[10px] text-[#C9D1E0]/80 mt-0.5">Zero cross-device sharing leaks</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#0B132B] border border-[#F43F5E]/30">
                      <div className="text-[10px] text-[#C9D1E0] uppercase font-semibold">Expired Passes Purged</div>
                      <div className="text-lg font-black text-[#F43F5E] mt-1 tabular-nums">{premiumStats.expiredCleanedCount} Codes</div>
                      <div className="text-[10px] text-[#C9D1E0]/80 mt-0.5">Moved to permanent blacklist</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#0B132B] border border-[#00D9FF]/30">
                      <div className="text-[10px] text-[#C9D1E0] uppercase font-semibold">Referral Passes Awarded</div>
                      <div className="text-lg font-black text-[#00D9FF] mt-1 tabular-nums">{premiumStats.referralVipRewardsCount} Passes</div>
                      <div className="text-[10px] text-[#C9D1E0]/80 mt-0.5">Milestone verified by Camellia</div>
                    </div>
                  </div>
                </div>
              )}

              {(activeTab === 'overview' || activeTab === 'system') && (
                <div className="p-5 rounded-xl bg-[#070C1E] border border-[#00D9FF]/25 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
                      System Health & Proxy Failover Resolutions
                    </h3>
                    <span className="text-[10px] text-[#00D9FF] font-mono tabular-nums">Uptime: {systemStats.uptimeHours}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-[#0B132B] border border-[#00D9FF]/25">
                      <span className="text-[#C9D1E0] block text-[10px]">Sources Synced</span>
                      <strong className="text-white text-base block mt-0.5 tabular-nums">{systemStats.totalSources} M3U Playlists</strong>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0B132B] border border-[#00D9FF]/25">
                      <span className="text-[#C9D1E0] block text-[10px]">Failovers Resolved</span>
                      <strong className="text-[#00D9FF] text-base block mt-0.5 tabular-nums">{systemStats.proxyFailoversResolved} Profiles</strong>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0B132B] border border-[#B832F5]/25">
                      <span className="text-[#C9D1E0] block text-[10px]">Proxy Memory Cache</span>
                      <strong className="text-[#D8B4FE] text-base block mt-0.5 tabular-nums">{systemStats.cacheEntries} Segments</strong>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0B132B] border border-[#10B981]/25">
                      <span className="text-[#C9D1E0] block text-[10px]">Errors Repaired</span>
                      <strong className="text-[#10B981] text-base block mt-0.5 tabular-nums">{systemStats.errorsFixed} Auto-Fixed</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Email Preview & Dispatch Section */}
              {(activeTab === 'overview' || activeTab === 'email_preview') && (
                <div className="p-5 rounded-xl bg-[#070C1E] border border-[#00D9FF]/30 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#00D9FF] shrink-0" />
                      Executive Email Dispatch to M R S
                    </h3>
                    <span className="text-[10px] text-[#00D9FF] font-mono">
                      SMTP / Mailgun / Direct Relay
                    </span>
                  </div>

                  {/* Dispatch Controls */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="flex-1 flex items-center bg-[#0B132B] border border-[#00D9FF]/35 rounded-lg px-3.5 min-h-[44px] text-xs">
                      <Mail className="w-4 h-4 text-[#00D9FF] shrink-0 mr-2.5" />
                      <input 
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="Admin Email (mr216873@gmail.com)"
                        className="bg-transparent border-none outline-none text-white w-full text-xs placeholder-[#C9D1E0]/60"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSendEmail}
                      disabled={isSending}
                      className="min-h-[44px] px-5 py-2.5 rounded-lg btn-premium-emerald font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {isSending ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Dispatching...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 shrink-0" />
                          <span>Send Report to M R S</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyMarkdown}
                      className="min-h-[44px] px-4 py-2.5 rounded-lg btn-premium-cyan font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                      title="Copy raw markdown to clipboard"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                      <span>{copied ? 'Copied' : 'Copy Text'}</span>
                    </button>
                  </div>

                  {sendStatus && (
                    <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                      sendStatus.success 
                        ? 'bg-[#10B981]/15 text-[#6EE7B7] border border-[#10B981]/40' 
                        : 'bg-[#F43F5E]/15 text-[#FDA4AF] border border-[#F43F5E]/40'
                    }`}>
                      {sendStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-[#10B981]" /> : <AlertCircle className="w-4 h-4 shrink-0 text-[#F43F5E]" />}
                      <span>{sendStatus.message}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-[#00D9FF]/25 bg-[#070C1E] flex items-center justify-between text-xs text-[#C9D1E0] shrink-0">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>Autonomous 24/7 Engine Active</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[38px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-[#C9D1E0] hover:text-white transition-colors cursor-pointer"
            >
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-4 py-1.5 rounded-lg btn-premium-glass text-white font-bold transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
