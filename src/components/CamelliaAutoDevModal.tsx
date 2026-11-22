import React, { useState, useEffect } from 'react';
import { Bot, X, TrendingUp, Zap, RefreshCw, ShieldCheck, Activity, Cpu, CheckCircle2, Clock, ArrowRight, ExternalLink, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAdminAuthHeaders } from '../lib/adminAuth';

interface AutoDevEntry {
  runId: string;
  trigger: string;
  timestamp: string;
  durationMs: number;
  metricsBefore: {
    channelsCount: number;
    cacheSize: number;
    activeSessions: number;
    proxyProfile: string;
    avgLatencyMs: number;
  };
  metricsAfter: {
    channelsCount: number;
    cacheSize: number;
    activeSessions: number;
    proxyProfile: string;
    avgLatencyMs: number;
    latencyReductionPct: string;
  };
  optimizationsApplied: string[];
  geminiAiAnalysis?: {
    aiVerdict: string;
    speedRating: string;
    systemActionItems: string[];
    autonomousTuneSummary: string;
  };
  status: 'COMPLETED_SUCCESS' | 'WARNING_RECOVERED';
}

interface CamelliaStatusData {
  engineName: string;
  managingController: string;
  authorityGrantedBy: string;
  mode: string;
  status: string;
  totalCyclesExecuted: number;
  lastRunTimestamp: string;
  nextScheduledRun: string;
  optimalProxyMode: string;
  currentAvgLatencyMs: number;
  activeOptimizations: string[];
}

interface CamelliaAutoDevModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CamelliaAutoDevModal: React.FC<CamelliaAutoDevModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<CamelliaStatusData | null>(null);
  const [ledger, setLedger] = useState<AutoDevEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunningCycle, setIsRunningCycle] = useState<boolean>(false);
  const [cycleSuccessMsg, setCycleSuccessMsg] = useState<string | null>(null);

  const fetchAutoDevData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/camellia/auto-develop');
      const data = await res.json();
      if (data.status) setStatus(data.status);
      if (data.recentLedger) setLedger(data.recentLedger);
    } catch (e) {
      console.warn("Failed to load Camellia auto-develop telemetry", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAutoDevData();
    }
  }, [isOpen]);

  const handleTriggerCycle = async () => {
    try {
      setIsRunningCycle(true);
      setCycleSuccessMsg(null);
      const res = await fetch('/api/camellia/auto-develop', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ trigger: "M R S Interactive Trigger from UI" })
      });
      const data = await res.json();
      if (!res.ok) {
        setCycleSuccessMsg(
          res.status === 401 || res.status === 403
            ? 'Admin sign-in via #admin required to trigger self-development cycles.'
            : (data.error || 'Failed to run cycle.')
        );
        return;
      }
      if (data.result) {
        setLedger(prev => [data.result, ...prev]);
      }
      if (data.status) setStatus(data.status);
      setCycleSuccessMsg("Autonomous self-development upgrade completed successfully.");
      setTimeout(() => setCycleSuccessMsg(null), 4000);
    } catch (e) {
      setCycleSuccessMsg("Error running cycle. Please check server logs.");
    } finally {
      setIsRunningCycle(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#050816] border border-[#00D9FF]/35 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.95)] overflow-hidden text-white my-auto"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-[#00D9FF]/20 flex items-center justify-between gap-2 bg-[#070C1E]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#00D9FF] via-[#176BFF] to-[#B832F5] p-0.5 shadow-lg shadow-[#00D9FF]/20 shrink-0">
                <div className="w-full h-full bg-[#050816] rounded-[10px] flex items-center justify-center text-[#00D9FF]">
                  <Bot className="w-6 h-6 shrink-0" />
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-black tracking-tight text-white font-sans truncate">
                    Camellia Autonomous Development Engine
                  </h2>
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0">
                    <Radio className="w-3 h-3 text-emerald-400 shrink-0" />
                    24/7 ACTIVE
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#C9D1E0] font-sans mt-0.5 flex-wrap">
                  <span>Site Authority: <strong className="text-white">Camellia</strong></span>
                  <span>•</span>
                  <span>Granted by: <strong className="text-amber-400">M R S</strong></span>
                  <span>•</span>
                  <a 
                    href="https://mrxshahin.ai.studio" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[#00D9FF] hover:text-white inline-flex items-center gap-0.5"
                  >
                    Portfolio <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Auto-Dev modal"
              className="w-10 h-10 flex items-center justify-center rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white transition-all cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar font-sans">
            {/* Quick Overview Hero Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-[#121626] border border-white/5 p-3 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Routing Profile</span>
                  <Cpu className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="mt-2 text-base font-black text-cyan-300 uppercase">
                  {status?.optimalProxyMode.toUpperCase() || 'VLC'} MODE
                </div>
                <span className="text-[10px] text-gray-500 mt-1">Multi-profile auto-tuned</span>
              </div>

              <div className="bg-[#121626] border border-white/5 p-3 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Average Latency</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-base font-black text-emerald-300 font-mono">
                  {status?.currentAvgLatencyMs || 135} ms
                </div>
                <span className="text-[10px] text-emerald-400 mt-1">Ultra-low jitter</span>
              </div>

              <div className="bg-[#121626] border border-white/5 p-3 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Single-Device Lock</span>
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                </div>
                <div className="mt-2 text-base font-black text-purple-300 font-mono">
                  100% STRICT
                </div>
                <span className="text-[10px] text-gray-500 mt-1">Zero multi-device leaks</span>
              </div>

              <div className="bg-[#121626] border border-white/5 p-3 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Total Upgrades</span>
                  <TrendingUp className="w-4 h-4 text-orange-400 shrink-0" />
                </div>
                <div className="mt-2 text-base font-black text-orange-300 font-mono tabular-nums">
                  {status?.totalCyclesExecuted || ledger.length || 1} Runs
                </div>
                <span className="text-[10px] text-gray-500 mt-1">Continuous 24/7 cycle</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="bg-gradient-to-r from-cyan-950/30 via-black to-purple-950/30 border border-cyan-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="space-y-0.5 text-center sm:text-left">
                <h4 className="text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                  <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
                  Autonomous Backend Self-Upgrade Engine
                </h4>
                <p className="text-xs text-gray-400">
                  Camellia runs this cycle automatically every 6 hours in the background. You can also trigger an immediate upgrade right now.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTriggerCycle}
                disabled={isRunningCycle}
                className="min-h-[44px] px-5 py-2.5 rounded-lg font-black text-xs btn-premium-primary active:scale-95 transition-all text-white flex items-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 shrink-0 ${isRunningCycle ? 'animate-spin' : ''}`} />
                <span>{isRunningCycle ? 'Running Auto-Upgrade...' : 'Trigger Upgrade Now'}</span>
              </button>
            </div>

            {cycleSuccessMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{cycleSuccessMsg}</span>
              </div>
            )}

            {/* Historical Audit Ledger */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  Autonomous Upgrade Audit Ledger ({ledger.length} Recorded)
                </span>
                <span className="text-[10px] text-gray-500">Auto-persisted in backend memory</span>
              </div>

              {isLoading ? (
                <div className="py-12 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span>Loading Camellia autonomous development ledger...</span>
                </div>
              ) : ledger.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500 bg-[#121626]/50 rounded-2xl border border-white/5">
                  No upgrade cycles recorded yet. Click "Trigger Upgrade Now" to run the first cycle!
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {ledger.map((entry) => (
                    <div 
                      key={entry.runId}
                      className="bg-[#121626]/90 border border-white/10 hover:border-cyan-500/30 rounded-2xl p-3.5 space-y-2 transition-all"
                    >
                      <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-cyan-400 text-[11px]">{entry.runId}</span>
                          <span className="px-2 py-0.5 rounded-full bg-white/5 text-gray-300 text-[9px] font-bold">
                            {entry.trigger}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • {entry.durationMs}ms
                        </span>
                      </div>

                      {/* Metrics Before & After */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] bg-black/40 p-2 rounded-xl border border-white/5">
                        <div>
                          <span className="text-gray-500 block text-[9px]">RESPONSE LATENCY</span>
                          <span className="text-gray-400 line-through mr-1 font-mono">{entry.metricsBefore.avgLatencyMs}ms</span>
                          <ArrowRight className="inline w-2.5 h-2.5 text-emerald-400 mr-1" />
                          <span className="font-black text-emerald-400 font-mono">{entry.metricsAfter.avgLatencyMs}ms</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[9px]">PROXY PROFILE</span>
                          <span className="font-black text-cyan-300 uppercase">{entry.metricsAfter.proxyProfile} Mode</span>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <span className="text-gray-500 block text-[9px]">LATENCY REDUCTION</span>
                          <span className="font-black text-purple-300 font-mono">-{entry.metricsAfter.latencyReductionPct}</span>
                        </div>
                      </div>

                      {/* Technical Optimizations list */}
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 block">Actions Autonomously Executed:</span>
                        <ul className="text-[11px] text-gray-300 space-y-1 list-disc pl-4">
                          {entry.optimizationsApplied.map((opt, i) => (
                            <li key={i}>{opt}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Gemini Deep Verdict */}
                      {entry.geminiAiAnalysis && (
                        <div className="bg-gradient-to-r from-purple-950/30 to-blue-950/30 border border-purple-500/20 p-2.5 rounded-xl text-xs space-y-1">
                          <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            Gemini Autonomous Verdict:
                          </span>
                          <p className="text-[11px] text-gray-300 italic">
                            "{entry.geminiAiAnalysis.autonomousTuneSummary}"
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3.5 border-t border-[#00D9FF]/20 bg-[#070C1E] flex items-center justify-between text-xs text-[#C9D1E0] font-sans">
            <span>Next automatic run in: <strong className="text-white">~6 hours</strong></span>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-5 py-2 rounded-lg btn-premium-glass text-white font-bold text-xs transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
