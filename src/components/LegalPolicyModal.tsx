import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, X, FileText, Lock, Globe, Scale, Mail, ExternalLink, RefreshCw, ShieldAlert, CheckCircle2, Cpu } from 'lucide-react';

interface LegalPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'terms' | 'dmca' | 'vip' | 'refund' | 'privacy' | 'security' | 'about';
}

interface PolicyPayload {
  platform: string;
  copyrightNotice: string;
  currentYear: number;
  annualRenewalStatus: string;
  lastSystemAudit: string;
  nextAnnualRenewalDate: string;
  policyVersion: string;
  fairUseDisclaimer: string;
  dmcaCompliance: {
    statement: string;
    designatedAgentEmail: string;
    supportChannel: string;
    responseTime: string;
  };
  singleDeviceVipPolicy: {
    enforcement: string;
    description: string;
    revocationClause: string;
  };
  privacyTerms: string;
  automatedBackendRenewal: string;
}

export const LegalPolicyModal: React.FC<LegalPolicyModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'terms'
}) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'dmca' | 'vip' | 'refund' | 'privacy' | 'security' | 'about'>(initialTab);
  const [policyData, setPolicyData] = useState<PolicyPayload | null>(null);
  const [securityData, setSecurityData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchPolicyAndSecurity = async () => {
      try {
        setIsLoading(true);
        const [policyRes, securityRes] = await Promise.allSettled([
          fetch('/api/policy'),
          fetch('/api/security/status')
        ]);
        
        if (policyRes.status === 'fulfilled' && policyRes.value.ok) {
          const data = await policyRes.value.json();
          if (isMounted) setPolicyData(data);
        }

        if (securityRes.status === 'fulfilled' && securityRes.value.ok) {
          const sData = await securityRes.value.json();
          if (isMounted && sData?.security) setSecurityData(sData.security);
        }
      } catch (err) {
        console.warn('Could not fetch backend policy or security data', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchPolicyAndSecurity();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentYear = policyData?.currentYear || new Date().getFullYear();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-3xl rounded-2xl bg-[var(--theme-bg,#080B11)] border border-[var(--theme-border,rgba(56,189,248,0.3))] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-[var(--theme-surface,#0E131F)] border-b border-[var(--theme-border,rgba(56,189,248,0.2))] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--theme-accent,#38BDF8)]/15 border border-[var(--theme-accent,#38BDF8)]/40 flex items-center justify-center text-[var(--theme-accent,#38BDF8)] shrink-0">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2 flex-wrap">
                  <span>M R S IPTV Policy & Legal Terms</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--theme-accent,#38BDF8)]/20 text-[var(--theme-accent,#38BDF8)] border border-[var(--theme-accent,#38BDF8)]/40 tabular-nums">
                    Auto-Renewed {currentYear}
                  </span>
                </h3>
                <p className="text-[11px] text-[#C9D1E0]">
                  Automated annual legal compliance & copyright architecture
                </p>
              </div>
            </div>

            <button
              type="button"
              aria-label="Close legal policy modal"
              onClick={onClose}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[#C9D1E0] hover:text-white border border-white/10 hover:border-[var(--theme-accent,#38BDF8)]/40 transition-colors cursor-pointer shrink-0"
              title="Close modal"
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center border-b border-white/10 bg-[var(--theme-surface,#0E131F)] overflow-x-auto custom-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('terms')}
              className={`min-h-[42px] px-4 py-2.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'terms'
                  ? 'border-[var(--theme-accent,#38BDF8)] text-[var(--theme-accent,#38BDF8)] bg-[var(--theme-accent,#38BDF8)]/10'
                  : 'border-transparent text-[#C9D1E0] hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Terms & Fair Use</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dmca')}
              className={`min-h-[42px] px-4 py-2.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'dmca'
                  ? 'border-[var(--theme-accent,#38BDF8)] text-[var(--theme-accent,#38BDF8)] bg-[var(--theme-accent,#38BDF8)]/10'
                  : 'border-transparent text-[#C9D1E0] hover:text-white'
              }`}
            >
              <Scale className="w-3.5 h-3.5 shrink-0" />
              <span>DMCA Copyright Notice</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('vip')}
              className={`min-h-[42px] px-4 py-2.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'vip'
                  ? 'border-[var(--theme-accent,#38BDF8)] text-[var(--theme-accent,#38BDF8)] bg-[var(--theme-accent,#38BDF8)]/10'
                  : 'border-transparent text-[#C9D1E0] hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>Single-Device VIP Pass</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('refund')}
              className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'refund'
                  ? 'border-[var(--theme-accent,#38BDF8)] text-[var(--theme-accent,#38BDF8)] bg-[var(--theme-accent,#38BDF8)]/10'
                  : 'border-transparent text-[#C9D1E0] hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Refund Policy</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('privacy')}
              className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'privacy'
                  ? 'border-[var(--theme-accent,#38BDF8)] text-[var(--theme-accent,#38BDF8)] bg-[var(--theme-accent,#38BDF8)]/10'
                  : 'border-transparent text-[#C9D1E0] hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>Privacy Policy</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'security'
                  ? 'border-[var(--theme-accent,#38BDF8)] text-[var(--theme-accent,#38BDF8)] bg-[var(--theme-accent,#38BDF8)]/10'
                  : 'border-transparent text-[#C9D1E0] hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Security &amp; Firewall</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('about')}
              className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'about'
                  ? 'border-[var(--theme-accent,#38BDF8)] text-[var(--theme-accent,#38BDF8)] bg-[var(--theme-accent,#38BDF8)]/10'
                  : 'border-transparent text-[#C9D1E0] hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>About M R S TV</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs sm:text-sm text-[#C9D1E0] custom-scrollbar">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-[var(--theme-accent,#38BDF8)] animate-spin" />
              </div>
            ) : (
              <>
                {activeTab === 'terms' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-[var(--theme-accent,#38BDF8)]/10 border border-[var(--theme-accent,#38BDF8)]/30">
                      <p className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                        <span>Platform Disclaimer & Indexing Architecture</span>
                      </p>
                      <p className="mt-1 text-xs text-[#C9D1E0] leading-relaxed">
                        {policyData?.fairUseDisclaimer || 
                          "M R S IPTV does not host, store, broadcast, or transmit any copyrighted media or video files on its servers. The platform functions strictly as an autonomous web indexing directory, player client, and real-time proxy optimizer aggregating publicly accessible streaming links (HLS/M3U8). All channel names, brand trademarks, logos, and broadcast streams remain the sole property of their respective broadcast network owners."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-extrabold text-white text-xs uppercase tracking-wider text-[var(--theme-accent,#38BDF8)]">
                        1. Automated Annual Renewal
                      </h4>
                      <p className="leading-relaxed">
                        All platform policies and compliance terms are autonomously computed and renewed by the backend every year on January 1st (Current Active Term: <span className="font-mono text-white font-bold tabular-nums">{currentYear}</span>, Next Renewal Epoch: <span className="font-mono text-white font-bold tabular-nums">{policyData?.nextAnnualRenewalDate ? new Date(policyData.nextAnnualRenewalDate).toLocaleDateString() : `${currentYear + 1}-01-01`}</span>).
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-extrabold text-white text-xs uppercase tracking-wider text-[var(--theme-accent,#38BDF8)]">
                        2. Permitted Use & Fair-Use Optimization
                      </h4>
                      <p className="leading-relaxed">
                        M R S IPTV provides user accessibility through custom multi-profile stream proxies (VLC, Smarters, Smart TV, Chrome) to bypass browser CORS headers and codec limitations for personal, non-commercial entertainment.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'dmca' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <h4 className="font-bold text-amber-300 text-xs sm:text-sm flex items-center gap-1.5">
                        <Scale className="w-4 h-4 shrink-0" />
                        <span>DMCA Takedown Procedure & Compliance</span>
                      </h4>
                      <p className="mt-1 text-xs text-[#C9D1E0] leading-relaxed">
                        {policyData?.dmcaCompliance?.statement ||
                          "M R S IPTV complies fully with the Digital Millennium Copyright Act (DMCA) and international copyright directives. If you are a copyright owner or legal representative and believe indexed public links infringe upon your rights, our compliance administrator will promptly review and delist the affected stream entry."}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[var(--theme-surface,#0E131F)] border border-white/10 space-y-2">
                      <p className="text-xs text-white font-bold">Designated Copyright Compliance Officer:</p>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center text-xs">
                        <span className="flex items-center gap-1 text-[var(--theme-accent,#38BDF8)] font-mono">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span>{policyData?.dmcaCompliance?.designatedAgentEmail || 'mr216873@gmail.com'}</span>
                        </span>
                        <span className="hidden sm:inline text-white/30">·</span>
                        <a
                          href={policyData?.dmcaCompliance?.supportChannel || 'https://wa.me/8801810853282'}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-emerald-400 hover:underline"
                        >
                          <span>Official WhatsApp Compliance Line</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                      <p className="text-[11px] text-[#C9D1E0]/70">
                        Typical response and stream delisting turn-around time: 24 to 48 business hours.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'vip' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                      <h4 className="font-bold text-emerald-300 text-xs sm:text-sm flex items-center gap-1.5">
                        <Lock className="w-4 h-4 shrink-0" />
                        <span>Strict Single-Device Access Policy</span>
                      </h4>
                      <p className="mt-1 text-xs text-[#C9D1E0] leading-relaxed">
                        {policyData?.singleDeviceVipPolicy?.description ||
                          "Each VIP Pass activation code is cryptographically tied to strictly 1 active device session at a time to prevent unauthorized multi-device sharing and safeguard streaming bandwidth."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-extrabold text-white text-xs uppercase tracking-wider text-emerald-400">
                        Revocation & Multi-Device Auditing
                      </h4>
                      <p className="leading-relaxed">
                        {policyData?.singleDeviceVipPolicy?.revocationClause ||
                          "Attempts to broadcast simultaneously on multiple devices using the same pass code will trigger an automated lock and revoke the pass to the security blacklist."}
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'privacy' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-[var(--theme-surface,#0E131F)] border border-[var(--theme-border,rgba(56,189,248,0.3))]">
                      <h4 className="font-bold text-[var(--theme-accent,#38BDF8)] text-xs sm:text-sm flex items-center gap-1.5">
                        <Globe className="w-4 h-4 shrink-0" />
                        <span>Zero-Log Privacy Architecture</span>
                      </h4>
                      <p className="mt-1 text-xs text-[#C9D1E0] leading-relaxed">
                        {policyData?.privacyTerms ||
                          "M R S IPTV operates under a privacy-first architecture: no personal activity logs, browsing history, or playback records are sold or transferred to third parties. Streaming preferences and favorites are stored locally on the user's device."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-extrabold text-white text-xs uppercase tracking-wider text-[var(--theme-accent,#38BDF8)]">
                        Cookies & Local Storage
                      </h4>
                      <p className="leading-relaxed">
                        The platform only uses browser local storage for essential features (user volume, channel favorites, aspect ratio preferences, manual region preference, and VIP Pass token validation). No tracking or profiling cookies are utilized.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-extrabold text-white text-xs uppercase tracking-wider text-[var(--theme-accent,#38BDF8)]">
                        Coarse Network Region Lookup
                      </h4>
                      <p className="leading-relaxed">
                        Your connection may be resolved server-side via local IP geolocation lookup solely into a coarse country and region label (such as Bangladesh or Dhaka) to prioritize local channels first in the guide. Raw IP addresses are never returned to the browser for channel ordering or persisted alongside your channel preferences, and you may override the region display order at any time inside the Channels panel.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'security' && (
                  <div className="space-y-4">
                    {/* Top Security Banner */}
                    <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0" />
                          <h4 className="font-bold text-white text-xs sm:text-sm">
                            Autonomous Enterprise Backend Security Engine
                          </h4>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            {securityData?.status || 'ACTIVE_SHIELDED'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#C9D1E0] leading-relaxed">
                          Multi-layered zero-trust protection defending the proxy pipelines, VIP database, user tokens, and streaming infrastructure 24/7.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-300 bg-cyan-900/30 px-2.5 py-1.5 rounded-lg border border-cyan-500/20 whitespace-nowrap shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>System Guard: Operational</span>
                      </div>
                    </div>

                    {/* Threat & Firewall Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-3 rounded-xl bg-[var(--theme-surface,#0E131F)] border border-cyan-500/20">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[#C9D1E0]/70">Threats Neutralized</span>
                        <p className="text-lg font-mono font-black text-cyan-400 mt-0.5 tabular-nums">
                          {securityData?.threatsBlockedTotal ?? 0}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-[var(--theme-surface,#0E131F)] border border-cyan-500/20">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[#C9D1E0]/70">WAF Filters</span>
                        <p className="text-lg font-mono font-black text-emerald-400 mt-0.5 tabular-nums">
                          {securityData?.threatBreakdown?.waf_block ?? 0}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-[var(--theme-surface,#0E131F)] border border-cyan-500/20">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[#C9D1E0]/70">Anti-SSRF Blocks</span>
                        <p className="text-lg font-mono font-black text-purple-400 mt-0.5 tabular-nums">
                          {securityData?.threatBreakdown?.ssrf_attempt ?? 0}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-[var(--theme-surface,#0E131F)] border border-cyan-500/20">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[#C9D1E0]/70">Brute-Force Stops</span>
                        <p className="text-lg font-mono font-black text-amber-400 mt-0.5 tabular-nums">
                          {securityData?.threatBreakdown?.brute_force_block ?? 0}
                        </p>
                      </div>
                    </div>

                    {/* Active Defense Pillars */}
                    <div className="space-y-2.5">
                      <h4 className="font-extrabold text-white text-xs uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 shrink-0" />
                        <span>Active Defense Architecture</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                          <p className="font-bold text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full shrink-0"></span>
                            <span>Anti-SSRF Stream Guard</span>
                          </p>
                          <p className="text-[11px] text-[#C9D1E0]/80 leading-relaxed">
                            Hard blocks against loopback (127.0.0.1, localhost), cloud metadata (169.254.169.254, AWS/GCP), and private RFC-1918 subnets across all proxy pipelines.
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                          <p className="font-bold text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0"></span>
                            <span>Deep WAF Payload Filtering</span>
                          </p>
                          <p className="text-[11px] text-[#C9D1E0]/80 leading-relaxed">
                            Continuous real-time payload inspection blocking SQLi, XSS, directory traversal, shell execution, and malicious protocol injections.
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                          <p className="font-bold text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full shrink-0"></span>
                            <span>Sliding Window Rate Limiters</span>
                          </p>
                          <p className="text-[11px] text-[#C9D1E0]/80 leading-relaxed">
                            Strict bucket rate limiting across global APIs (350 req/min) and Camellia endpoints (25 req/min) to prevent DDoS, scrapers, and quota drainage.
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                          <p className="font-bold text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0"></span>
                            <span>HMAC-SHA256 VIP Device Signing</span>
                          </p>
                          <p className="text-[11px] text-[#C9D1E0]/80 leading-relaxed">
                            Cryptographic device fingerprinting and HMAC signatures enforce strict 1-device lock and automatically ban code stuffing.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Hardened Headers & Security Info */}
                    <div className="p-3.5 rounded-xl bg-[var(--theme-surface,#0E131F)] border border-white/10 text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] gap-2">
                        <span className="text-[#C9D1E0]">HTTP Defense Headers:</span>
                        <span className="font-mono text-emerald-400 text-right">Strict CSP, HSTS, X-Content-Type-Options, SAMEORIGIN</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#C9D1E0]">Active Blacklisted Malicious IPs:</span>
                        <span className="font-mono text-cyan-300 tabular-nums">{securityData?.activeBlacklistedIps ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#C9D1E0]">Autonomously Monitored By:</span>
                        <span className="font-mono text-amber-300">M R S Stream Security Engine</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'refund' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-[#F5B301]/10 border border-[#F5B301]/35">
                      <h4 className="font-bold text-[#F5B301] text-xs sm:text-sm flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Digital VIP Pass Refund &amp; Dispute Policy</span>
                      </h4>
                      <p className="mt-1 text-xs text-[#C9D1E0] leading-relaxed">
                        Because VIP activation codes grant immediate digital entitlement once issued, redeemed passes cannot generally be refunded. However, if a payment was verified incorrectly, duplicated, or rejected due to underpayment, contact support with your Order Reference and TrxID within 7 days for full resolution or refund.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-xs uppercase tracking-wider text-[var(--theme-accent,#38BDF8)]">
                        Duplicate Charges &amp; Unmatched Proofs
                      </h4>
                      <p className="leading-relaxed">
                        If a payment order expires after 48 hours or is accidentally sent twice for the same TrxID, reach out to <span className="font-mono text-white">mr216873@gmail.com</span> or WhatsApp <span className="font-mono text-white">+8801810853282</span> to either manually match your credit or reverse duplicate funds.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'about' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-[var(--theme-surface,#0E131F)] border border-[var(--theme-border,rgba(56,189,248,0.3))]">
                      <h4 className="font-bold text-white text-xs sm:text-sm">About M R S IPTV · TV NETWORK</h4>
                      <p className="mt-1 text-xs text-[#C9D1E0] leading-relaxed">
                        M R S IPTV is a multi-platform live television, sports, news, and entertainment streaming hub engineered for smooth HLS playback across Smart TVs, Android Mobile, and modern browsers. Powered by automated payment verification, real-time EPG schedules, and multi-device VIP entitlements.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                        <div className="font-bold text-white">Support Desk</div>
                        <div className="text-[#94A3B8] mt-1 font-mono">mr216873@gmail.com</div>
                        <div className="text-emerald-400 font-mono">+8801810853282 (WhatsApp)</div>
                      </div>
                      <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                        <div className="font-bold text-white">Official Apps</div>
                        <div className="text-[#94A3B8] mt-1">M R S IPTV TV (Android TV)</div>
                        <div className="text-[#38BDF8]">M R S IPTV Android Mobile</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-5 py-3.5 bg-[var(--theme-surface,#0E131F)] border-t border-[var(--theme-border,rgba(56,189,248,0.2))] flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-[#C9D1E0] text-center sm:text-left font-mono">
              {policyData?.copyrightNotice || `Copyright © 2024–${currentYear} M R S IPTV. All rights reserved.`}
            </p>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg btn-premium-primary text-xs font-bold text-white cursor-pointer"
            >
              Acknowledge & Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
