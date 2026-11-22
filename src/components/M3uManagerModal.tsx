import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Globe, 
  Radio, 
  ShieldCheck, 
  Cpu, 
  X, 
  Tv, 
  Sliders, 
  Layers,
  Zap,
  ExternalLink,
  Lock,
  Key,
  Bot,
  Users,
  Eye,
  Smartphone,
  Monitor,
  Activity,
  Search,
  FileText,
  Check,
  Play
} from 'lucide-react';
import { getAdminAuthHeaders } from '../lib/adminAuth';

interface M3uSource {
  name: string;
  url: string;
  prefix: string;
}

interface M3uManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshChannels: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const M3uManagerModal: React.FC<M3uManagerModalProps> = ({
  isOpen,
  onClose,
  onRefreshChannels,
  showToast
}) => {
  const [sources, setSources] = useState<M3uSource[]>([]);
  const [totalChannels, setTotalChannels] = useState<number>(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [maintenanceData, setMaintenanceData] = useState<any>(null);
  const [isRunningMaintenance, setIsRunningMaintenance] = useState<boolean>(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState<boolean>(false);
  const [doctorStatus, setDoctorStatus] = useState<any>(null);
  const [confirmDeletePrefix, setConfirmDeletePrefix] = useState<string | null>(null);
  const [doctorReport, setDoctorReport] = useState<any>(null);
  const [isRunningDoctor, setIsRunningDoctor] = useState<boolean>(false);
  const [revivingUrl, setRevivingUrl] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setIsFetchingAnalytics(true);
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: getAdminAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (e) {
      console.warn("Failed to load visitor analytics:", e);
    } finally {
      setIsFetchingAnalytics(false);
    }
  };

  // New source form & inspection state
  const [newSourceName, setNewSourceName] = useState<string>('');
  const [newSourceUrl, setNewSourceUrl] = useState<string>('');
  const [inputMode, setInputMode] = useState<'url' | 'raw'>('url');
  const [rawM3uText, setRawM3uText] = useState<string>('');
  const [isInspecting, setIsInspecting] = useState<boolean>(false);
  const [inspectionResult, setInspectionResult] = useState<{
    batchId: string;
    sourceName: string;
    sourceUrl?: string;
    totalFound: number;
    playingCount: number;
    notPlayingCount: number;
    playingChannels: any[];
    notPlayingChannels: any[];
  } | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'playing' | 'dead'>('playing');
  const [isCommittingBatch, setIsCommittingBatch] = useState<boolean>(false);
  const [isTestingUrl, setIsTestingUrl] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    valid?: boolean;
    channelCount?: number;
    message?: string;
    sampleNames?: string[];
  } | null>(null);

  // Proxy settings
  const [proxyMode, setProxyMode] = useState<string>(() => {
    return localStorage.getItem('shahintv_proxy_mode') || 'auto';
  });

  const fetchSources = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/m3u/sources');
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
        setTotalChannels(data.totalChannels || 0);
        setLastFetchedAt(data.lastFetchedAt || null);
      }
    } catch (e) {
      console.warn("Failed to load M3U sources:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMaintenanceStatus = async () => {
    try {
      const res = await fetch('/api/admin/maintenance/status', {
        headers: getAdminAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceData(data);
      }
    } catch (e) {
      console.warn("Failed to load maintenance status:", e);
    }
  };

  const handleRunMaintenance = async () => {
    setIsRunningMaintenance(true);
    try {
      const res = await fetch('/api/admin/maintenance/run', { 
        method: 'POST',
        headers: getAdminAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast("Daily Camellia Maintenance & 1-Device Code Check completed!", "success");
        await fetchMaintenanceStatus();
        await fetchSources();
        onRefreshChannels();
      } else if (res.status === 401 || res.status === 403) {
        if (showToast) showToast("Admin sign-in via #admin required to run maintenance.", "error");
      } else {
        if (showToast) showToast(data.error || "Maintenance execution error", "error");
      }
    } catch (e) {
      if (showToast) showToast("Maintenance execution error", "error");
    } finally {
      setIsRunningMaintenance(false);
    }
  };

  const fetchDoctorHealth = async () => {
    try {
      const [statusRes, reportRes] = await Promise.all([
        fetch('/api/m3u-doctor/status'),
        fetch('/api/m3u-doctor/report.json')
      ]);
      if (statusRes.ok) {
        setDoctorStatus(await statusRes.json());
      }
      if (reportRes.ok) {
        setDoctorReport(await reportRes.json());
      }
    } catch (e) {
      console.warn('Failed to load M3U Doctor health status:', e);
    }
  };

  const handleRunDoctorScan = async () => {
    setIsRunningDoctor(true);
    try {
      const res = await fetch('/api/m3u-doctor/run', {
        method: 'POST',
        headers: getAdminAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast(data.message || 'M3U Doctor 5-stage scan started!', 'success');
        await fetchDoctorHealth();
        onRefreshChannels();
      } else if (res.status === 401 || res.status === 403) {
        if (showToast) showToast('Admin sign-in via #admin required to run M3U Doctor scans.', 'error');
      } else {
        if (showToast) showToast(data.error?.message || data.error || 'Failed to start M3U Doctor scan', 'error');
      }
    } catch (e) {
      if (showToast) showToast('Error starting M3U Doctor scan', 'error');
    } finally {
      setIsRunningDoctor(false);
    }
  };

  const handleReviveStream = async (url: string) => {
    if (!url) return;
    setRevivingUrl(url);
    try {
      const res = await fetch('/api/m3u-doctor/revive', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast('Stream revived and queued for playback!', 'success');
        await fetchDoctorHealth();
        onRefreshChannels();
      } else if (res.status === 401 || res.status === 403) {
        if (showToast) showToast('Admin sign-in via #admin required to revive streams.', 'error');
      } else {
        if (showToast) showToast(data.error?.message || data.error || 'Could not revive stream', 'error');
      }
    } catch {
      if (showToast) showToast('Error reviving stream', 'error');
    } finally {
      setRevivingUrl(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSources();
      fetchMaintenanceStatus();
      fetchAnalytics();
      fetchDoctorHealth();
    }
  }, [isOpen]);

  const handleProxyModeChange = (mode: string) => {
    setProxyMode(mode);
    localStorage.setItem('shahintv_proxy_mode', mode);
    if (showToast) {
      const label = mode === 'auto' ? 'Auto Stealth Proxy' : mode === 'vlc' ? 'VLC IPTV Mode' : mode === 'smarters' ? 'IPTV Smarters Mode' : mode === 'smarttv' ? 'SmartTV Mode' : 'Direct Proxy';
      showToast(`Stream Network Mode set to ${label}`, 'info');
    }
  };

  const handleTestUrl = async () => {
    if (!newSourceUrl.trim()) return;
    setIsTestingUrl(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/m3u/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newSourceUrl.trim() })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ valid: false, message: e?.message || "Failed to connect to M3U URL" });
    } finally {
      setIsTestingUrl(false);
    }
  };

  const handleStartInspection = async () => {
    if (inputMode === 'url' && !newSourceUrl.trim()) {
      if (showToast) showToast("Please enter an M3U playlist URL first", "error");
      return;
    }
    if (inputMode === 'raw' && !rawM3uText.trim()) {
      if (showToast) showToast("Please paste raw M3U playlist text first", "error");
      return;
    }

    setIsInspecting(true);
    setInspectionResult(null);

    try {
      const res = await fetch('/api/m3u/inspect-and-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inputMode === 'url' ? newSourceUrl.trim() : undefined,
          rawM3u: inputMode === 'raw' ? rawM3uText.trim() : undefined,
          sourceName: newSourceName.trim() || undefined,
          maxChannelsToCheck: 300
        })
      });
      const data = await res.json();
      if (res.ok && data.batchId) {
        setInspectionResult(data);
        if (showToast) {
          showToast(`Stream audit finished: ${data.playingCount} playing, ${data.notPlayingCount} offline`, 'info');
        }
      } else {
        if (showToast) showToast(data.error || 'Failed to inspect M3U channels', 'error');
      }
    } catch (e: any) {
      if (showToast) showToast(e?.message || 'Error inspecting M3U stream', 'error');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleCommitStagedBatch = async (mode: 'working_only' | 'all') => {
    if (!inspectionResult?.batchId) return;
    setIsCommittingBatch(true);
    try {
      const res = await fetch('/api/m3u/commit-batch', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          batchId: inspectionResult.batchId,
          mode,
          customName: newSourceName.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) {
          showToast(`Permission confirmed! Added ${data.channelsAdded} channels to M R S IPTV.`, 'success');
        }
        setInspectionResult(null);
        setNewSourceUrl('');
        setNewSourceName('');
        setRawM3uText('');
        await fetchSources();
        onRefreshChannels();
      } else if (res.status === 401 || res.status === 403) {
        if (showToast) showToast('Admin sign-in via #admin required to commit M3U channels.', 'error');
      } else {
        if (showToast) showToast(data.error || 'Failed to commit channels', 'error');
      }
    } catch (e: any) {
      if (showToast) showToast(e?.message || 'Error committing channels', 'error');
    } finally {
      setIsCommittingBatch(false);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceUrl.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/m3u/sources', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: newSourceName.trim() || undefined,
          url: newSourceUrl.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast(data.message || 'M3U Link saved successfully!', 'success');
        setNewSourceName('');
        setNewSourceUrl('');
        setTestResult(null);
        await fetchSources();
        onRefreshChannels();
      } else if (res.status === 401 || res.status === 403) {
        if (showToast) showToast('Admin sign-in via #admin required to save M3U sources.', 'error');
      } else {
        if (showToast) showToast(data.error || 'Failed to save M3U source', 'error');
      }
    } catch (e: any) {
      if (showToast) showToast(e?.message || 'Error saving source', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSource = async (prefix: string, name: string) => {
    setConfirmDeletePrefix(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/m3u/sources/${prefix}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast(`Removed "${name}" from sources`, 'info');
        await fetchSources();
        onRefreshChannels();
      } else if (res.status === 401 || res.status === 403) {
        if (showToast) showToast('Admin sign-in via #admin required to delete sources.', 'error');
      } else {
        if (showToast) showToast(data.error || 'Failed to delete M3U source', 'error');
      }
    } catch (e) {
      if (showToast) showToast('Failed to delete M3U source', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/m3u/refresh', {
        method: 'POST',
        headers: getAdminAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTotalChannels(data.totalChannels);
        if (showToast) showToast(`M3U Channels synced! Total ${data.totalChannels} live channels online.`, 'success');
        await fetchSources();
        onRefreshChannels();
      } else if (res.status === 401 || res.status === 403) {
        if (showToast) showToast('Admin sign-in via #admin required to refresh M3U playlists.', 'error');
      } else {
        if (showToast) showToast(data.error || 'Error refreshing M3U playlists', 'error');
      }
    } catch (e) {
      if (showToast) showToast('Error refreshing M3U playlists', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--theme-bg,#070A11)]/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[var(--theme-bg,#070A11)] border border-[var(--theme-border-accent,rgba(56,189,248,0.45))] rounded-2xl w-full max-w-3xl overflow-hidden shadow-[0_24px_75px_rgba(0,0,0,0.92)] flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[var(--theme-surface,#0E131F)] border-b border-[var(--theme-border,rgba(56,189,248,0.25))] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent-soft,rgba(56,189,248,0.20))] text-[var(--theme-accent,#38BDF8)] border border-[var(--theme-border-accent,rgba(56,189,248,0.5))] flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                M3U Playlist Links & Network Proxy Engine
              </h2>
              <p className="text-xs text-[#C9D1E0]">Update M3U links, manage sources, and bypass playback blocks</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-lg btn-premium-crimson flex items-center justify-center transition-all active:scale-95 group cursor-pointer shrink-0"
            title="Close Settings"
            aria-label="Close Settings"
          >
            <X className="w-5 h-5 stroke-[2.5] transition-transform duration-200 group-hover:rotate-90" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[var(--theme-bg,#070A11)] custom-scrollbar">

          {/* Top Banner Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#0B132B] border border-[#F59E0B]/35 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#C9D1E0] uppercase tracking-wider block">Live Channels</span>
                <span className="text-xl font-black text-[#F59E0B] tabular-nums">{totalChannels.toLocaleString()}</span>
              </div>
              <Tv className="w-6 h-6 text-[#F59E0B]/60 shrink-0" />
            </div>

            <div className="bg-[#0B132B] border border-[#00D9FF]/35 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#C9D1E0] uppercase tracking-wider block">Live Playlists</span>
                <span className="text-xl font-black text-[#00D9FF] tabular-nums">{sources.length} Active</span>
              </div>
              <Layers className="w-6 h-6 text-[#00D9FF]/60 shrink-0" />
            </div>

            <div className="bg-[#0B132B] border border-[#10B981]/35 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#C9D1E0] uppercase tracking-wider block">Network Proxy</span>
                <span className="text-xs font-bold text-[#10B981] flex items-center gap-1 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  {proxyMode === 'auto' ? 'Auto Stealth' : proxyMode.toUpperCase()}
                </span>
              </div>
              <Zap className="w-6 h-6 text-[#10B981]/60 shrink-0" />
            </div>
          </div>

          {/* Section 1: Intelligent M3U Stream Inspector & Permission Importer */}
          <div className="bg-[#070C1E] border border-[#00D9FF]/35 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#00D9FF]/20 pb-2.5">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <h3 className="text-sm font-extrabold text-white">
                  M3U Stream Inspector & Exact Playing Channel Identifier
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-[#050816] p-1 rounded-lg border border-[#00D9FF]/30">
                  <button
                    type="button"
                    onClick={() => setInputMode('url')}
                    className={`min-h-[34px] px-3 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      inputMode === 'url' ? 'bg-[#00D9FF] text-black' : 'text-[#C9D1E0] hover:text-white'
                    }`}
                  >
                    Playlist URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('raw')}
                    className={`min-h-[34px] px-3 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      inputMode === 'raw' ? 'bg-[#00D9FF] text-black' : 'text-[#C9D1E0] hover:text-white'
                    }`}
                  >
                    Raw M3U Text
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-[11px] font-bold text-[#C9D1E0] block mb-1">Source Label (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Premium Sports Feed"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    className="w-full min-h-[40px] bg-[#0B132B] border border-[#00D9FF]/30 rounded-lg px-3 py-2 text-xs text-white placeholder-[#C9D1E0]/50 focus:outline-none focus:border-[#00D9FF]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-[#C9D1E0] block mb-1">
                    {inputMode === 'url' ? 'M3U Playlist URL *' : 'Paste Raw #EXTM3U Content *'}
                  </label>
                  {inputMode === 'url' ? (
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://example.com/playlist.m3u"
                        value={newSourceUrl}
                        onChange={(e) => setNewSourceUrl(e.target.value)}
                        className="w-full min-h-[40px] bg-[#0B132B] border border-[#00D9FF]/30 rounded-lg px-3 py-2 text-xs text-white placeholder-[#C9D1E0]/50 focus:outline-none focus:border-[#00D9FF]"
                      />
                      <button
                        type="button"
                        onClick={handleStartInspection}
                        disabled={isInspecting || !newSourceUrl.trim()}
                        className="min-h-[40px] px-4 py-2 btn-premium-cyan text-xs font-black rounded-lg transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {isInspecting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>Auditing...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5 shrink-0" />
                            <span>Check Streams</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        rows={3}
                        placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-name=&quot;Channel 1&quot; group-title=&quot;Sports&quot;,Channel 1&#10;http://example.com/live.m3u8"
                        value={rawM3uText}
                        onChange={(e) => setRawM3uText(e.target.value)}
                        className="w-full bg-[#0B132B] border border-[#00D9FF]/30 rounded-lg px-3 py-2 text-xs text-white placeholder-[#C9D1E0]/50 font-mono focus:outline-none focus:border-[#00D9FF]"
                      />
                      <button
                        type="button"
                        onClick={handleStartInspection}
                        disabled={isInspecting || !rawM3uText.trim()}
                        className="min-h-[40px] px-4 py-2 btn-premium-cyan text-xs font-black rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {isInspecting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>Auditing Streams...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5 shrink-0" />
                            <span>Check Streams from Text</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Inspection Audit Results Display */}
              {inspectionResult && (
                <div className="bg-[#050816] border border-[#00D9FF]/40 rounded-xl p-3.5 space-y-3">
                  {/* Summary Counters */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-[#0B132B] border border-[#00D9FF]/25 rounded-lg text-center">
                      <span className="text-[10px] text-[#C9D1E0] font-bold block uppercase">Total Found</span>
                      <span className="text-base font-black text-white tabular-nums">{inspectionResult.totalFound}</span>
                    </div>
                    <div className="p-2.5 bg-[#0B132B] border border-[#10B981]/40 rounded-lg text-center">
                      <span className="text-[10px] text-[#6EE7B7] font-bold block uppercase">Playing Streams</span>
                      <span className="text-base font-black text-[#10B981] tabular-nums">{inspectionResult.playingCount}</span>
                    </div>
                    <div className="p-2.5 bg-[#0B132B] border border-[#F43F5E]/40 rounded-lg text-center">
                      <span className="text-[10px] text-[#FDA4AF] font-bold block uppercase">Dead / Offline</span>
                      <span className="text-base font-black text-[#F43F5E] tabular-nums">{inspectionResult.notPlayingCount}</span>
                    </div>
                  </div>

                  {/* Tab Selector */}
                  <div className="flex border-b border-[#00D9FF]/20 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setActiveInspectorTab('playing')}
                      className={`min-h-[38px] pb-1.5 px-3 transition-colors flex items-center gap-1.5 cursor-pointer ${
                        activeInspectorTab === 'playing'
                          ? 'border-b-2 border-[#10B981] text-[#10B981]'
                          : 'text-[#C9D1E0] hover:text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Playing Channels ({inspectionResult.playingCount})</span>
                    </button>
                    <button
                      onClick={() => setActiveInspectorTab('dead')}
                      className={`pb-1.5 px-3 transition-colors flex items-center gap-1.5 ${
                        activeInspectorTab === 'dead'
                          ? 'border-b-2 border-[#F43F5E] text-[#F43F5E]'
                          : 'text-[#C9D1E0] hover:text-white'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Offline Channels ({inspectionResult.notPlayingCount})</span>
                    </button>
                  </div>

                  {/* Channel Table / List */}
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {activeInspectorTab === 'playing' ? (
                      inspectionResult.playingChannels.length > 0 ? (
                        inspectionResult.playingChannels.map((ch, idx) => (
                          <div
                            key={ch.id || idx}
                            className="p-2.5 bg-[#0B132B] border border-[#10B981]/25 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                              <div className="truncate">
                                <span className="font-bold text-white block truncate">{ch.name}</span>
                                <span className="text-[10px] text-[#C9D1E0]/70">{ch.category}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-[#10B981]/15 text-[#6EE7B7] border border-[#10B981]/30 uppercase font-black">
                                {ch.bestOption || 'vlc'} mode
                              </span>
                              <span className="text-[10px] font-mono text-[#00D9FF] tabular-nums">
                                {ch.latencyMs ? `${ch.latencyMs}ms` : '<200ms'}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-[#C9D1E0]/70">
                          No working channels detected in this playlist.
                        </div>
                      )
                    ) : (
                      inspectionResult.notPlayingChannels.length > 0 ? (
                        inspectionResult.notPlayingChannels.map((ch, idx) => (
                          <div
                            key={ch.id || idx}
                            className="p-2.5 bg-[#0B132B] border border-[#F43F5E]/25 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-[#F43F5E] shrink-0" />
                              <div className="truncate">
                                <span className="font-bold text-white block truncate">{ch.name}</span>
                                <span className="text-[10px] text-[#C9D1E0]/70">{ch.category}</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-[#FDA4AF] shrink-0">
                              {ch.failureReason || 'Offline / Blocked'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-[#6EE7B7]">
                          All channels are live and working! Zero offline channels.
                        </div>
                      )
                    )}
                  </div>

                  {/* Explicit Site Inclusion Permission Box */}
                  <div className="p-3 bg-gradient-to-r from-[#070C1E] via-[#0B132B] to-[#070C1E] border border-[#F59E0B]/40 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <span className="text-xs font-black text-white uppercase tracking-wider">
                          Site Inclusion Permission Required
                        </span>
                      </div>
                      <span className="text-[10px] text-[#00D9FF] font-mono">
                        Ready to Import
                      </span>
                    </div>

                    <p className="text-xs text-[#C9D1E0]">
                      Only verified live streams ({inspectionResult.playingCount} working) are permitted on M R S IPTV. {inspectionResult.notPlayingCount} dead/offline stream(s) are automatically excluded.
                    </p>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCommitStagedBatch('working_only')}
                        disabled={isCommittingBatch || inspectionResult.playingCount === 0}
                        className="min-h-[40px] px-4 py-2 btn-premium-emerald text-xs font-black rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Include Live Channels Only ({inspectionResult.playingCount} Channels)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setInspectionResult(null)}
                        className="min-h-[40px] px-3.5 py-2 btn-premium-glass text-[#F43F5E] hover:text-[#FDA4AF] text-xs font-bold rounded-lg transition-all cursor-pointer"
                      >
                        Cancel & Discard
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Global Network Proxy & Unblock Engine Settings */}
          <div className="bg-[#070C1E] border border-[#00D9FF]/25 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#00D9FF]/20 pb-2.5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <h3 className="text-sm font-extrabold text-white">Stream Network Proxy & Anti-Block Engine</h3>
              </div>
              <span className="text-[10px] text-[#10B981] bg-[#10B981]/15 px-2.5 py-0.5 rounded-md border border-[#10B981]/35 font-mono">Bypasses Geo & UA Blocks</span>
            </div>
            
            <p className="text-xs text-[#C9D1E0]">
              Some IPTV stream links block web browsers or require specific User-Agents (like VLC or Smart TV). Choose a proxy mode to ensure unplayable M3U channels play smoothly:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {[
                { id: 'auto', title: 'Auto Stealth Proxy', desc: 'Auto-retries Chrome, VLC & Smarters headers' },
                { id: 'vlc', title: 'VLC IPTV Mode', desc: 'Passes VLC 3.0 UA (Bypasses 90% blocks)' },
                { id: 'smarttv', title: 'SmartTV Profile', desc: 'Emulates Samsung Tizen SmartTV' },
                { id: 'smarters', title: 'Smarters Engine', desc: 'Emulates IPTV Smarters Pro' }
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleProxyModeChange(mode.id)}
                  className={`min-h-[84px] p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                    proxyMode === mode.id
                      ? 'sidebar-square-btn-active text-white'
                      : 'sidebar-square-btn text-[#C9D1E0] hover:text-white'
                  }`}
                >
                  <div>
                    <span className="text-xs font-extrabold block text-white">{mode.title}</span>
                    <span className="text-[10px] opacity-80 mt-0.5 block leading-tight">{mode.desc}</span>
                  </div>
                  {proxyMode === mode.id && (
                    <span className="text-[10px] font-bold text-[#00D9FF] mt-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00D9FF] shrink-0" /> Active Profile
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2.5: Automated Daily Camellia Maintenance & Premium Activation Code Audit */}
          <div className="bg-[#070C1E] border border-[#B832F5]/35 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B832F5]/20 pb-2.5">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#B832F5] shrink-0" />
                <h3 className="text-sm font-extrabold text-white">Daily Camellia System Maintenance & Premium Code Audit</h3>
              </div>
              <button
                type="button"
                onClick={handleRunMaintenance}
                disabled={isRunningMaintenance}
                className="min-h-[38px] px-3.5 py-1.5 btn-premium-purple text-[11px] font-extrabold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRunningMaintenance ? 'animate-spin' : ''}`} />
                <span>{isRunningMaintenance ? 'Running Check...' : 'Run Maintenance Now'}</span>
              </button>
            </div>

            <p className="text-xs text-[#C9D1E0]">
              The M R S IPTV Camellia Engine runs automatically every 24 hours to sanitize M3U channels, auto-repair stream links, and audit all active premium activation codes to guarantee they are locked to <strong className="text-[#00D9FF]">1 device only at a time</strong>.
            </p>

            {maintenanceData && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="bg-[#0B132B] border border-[#B832F5]/30 rounded-xl p-3 flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-[#B832F5]/15 rounded-lg text-[#D8B4FE] flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#C9D1E0] font-bold block uppercase">1-Device Lock Enforced</span>
                    <span className="text-xs font-black text-[#D8B4FE]">
                      {maintenanceData.maintenance?.singleDeviceVerified ?? 0} Code(s) Verified
                    </span>
                  </div>
                </div>

                <div className="bg-[#0B132B] border border-[#F59E0B]/30 rounded-xl p-3 flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-[#F59E0B]/15 rounded-lg text-[#F59E0B] flex items-center justify-center shrink-0">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#C9D1E0] font-bold block uppercase">Official Pass Codes</span>
                    <span className="text-xs font-black text-[#FDE68A]">
                      {maintenanceData.system?.officialPassCodesCount ?? 40} Official VIP Codes
                    </span>
                  </div>
                </div>

                <div className="bg-[#0B132B] border border-[#10B981]/30 rounded-xl p-3 flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-[#10B981]/15 rounded-lg text-[#10B981] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#C9D1E0] font-bold block uppercase">Last Camellia Run</span>
                    <span className="text-[11px] font-bold text-[#6EE7B7]">
                      {maintenanceData.maintenance?.lastRunAtFormatted ? new Date(maintenanceData.maintenance.lastRunAtFormatted).toLocaleTimeString() : 'Active'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {maintenanceData?.maintenance?.logDetails && (
              <div className="p-2.5 bg-[#0B132B] border border-[#00D9FF]/25 rounded-lg text-[11px] font-mono text-[#C9D1E0] flex items-start gap-2">
                <Cpu className="w-3.5 h-3.5 text-[#00D9FF] shrink-0 mt-0.5" />
                <span className="leading-tight">{maintenanceData.maintenance.logDetails}</span>
              </div>
            )}
          </div>

          {/* Section 2.6: M3U Doctor 24/7 Health Engine & Dead-Letter Revive */}
          <div className="bg-[#070C1E] border border-[#10B981]/35 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#10B981]/20 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
                <h3 className="text-sm font-extrabold text-white">M3U Doctor 24/7 Stream Health Engine</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchDoctorHealth}
                  className="min-h-[38px] px-3 py-1.5 btn-premium-glass text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                  aria-label="Refresh M3U Doctor health status"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#00D9FF] shrink-0" />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={handleRunDoctorScan}
                  disabled={isRunningDoctor || doctorStatus?.isScanning}
                  className="min-h-[38px] px-3.5 py-1.5 btn-premium-emerald text-[11px] font-extrabold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  aria-label="Run M3U Doctor 5-Stage Health Scan"
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRunningDoctor || doctorStatus?.isScanning ? 'animate-spin' : ''}`} />
                  <span>{isRunningDoctor || doctorStatus?.isScanning ? 'Scanning Live Streams...' : 'Run 24/7 Doctor Scan'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-[#0B132B] border border-[#00D9FF]/30 rounded-xl p-3">
                <span className="text-[10px] text-[#C9D1E0] font-bold block uppercase">Verified Scanned</span>
                <span className="text-lg font-black text-[#00D9FF] tabular-nums">
                  {(doctorReport?.totals?.scanned ?? doctorStatus?.totals?.scanned ?? 0).toLocaleString()}
                </span>
                <span className="text-[9px] text-[#C9D1E0]/70 block">
                  {(doctorReport?.totals?.unknown ?? doctorStatus?.totals?.unknown ?? 0).toLocaleString()} in queue
                </span>
              </div>
              <div className="bg-[#0B132B] border border-[#10B981]/30 rounded-xl p-3">
                <span className="text-[10px] text-[#6EE7B7] font-bold block uppercase">Verified Live</span>
                <span className="text-lg font-black text-[#10B981] tabular-nums">
                  {(doctorReport?.totals?.alive ?? doctorStatus?.totals?.alive ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-[#0B132B] border border-[#F43F5E]/30 rounded-xl p-3">
                <span className="text-[10px] text-[#FDA4AF] font-bold block uppercase">Hidden Dead</span>
                <span className="text-lg font-black text-[#F43F5E] tabular-nums">
                  {(doctorReport?.totals?.deadRemoved ?? doctorStatus?.totals?.deadRemoved ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-[#0B132B] border border-[#F59E0B]/30 rounded-xl p-3">
                <span className="text-[10px] text-[#FDE68A] font-bold block uppercase">Last Scan</span>
                <span className="text-xs font-bold text-[#F59E0B] block mt-1 truncate">
                  {doctorReport?.finishedAt
                    ? new Date(doctorReport.finishedAt).toLocaleTimeString()
                    : doctorStatus?.isScanning
                    ? 'Scanning now...'
                    : 'Scheduled'}
                </span>
              </div>
            </div>

            {Array.isArray(doctorReport?.deadReasons) && doctorReport.deadReasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {doctorReport.deadReasons.slice(0, 6).map((item: any, idx: number) => (
                  <span
                    key={`${item.r}-${idx}`}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#F43F5E]/10 text-[#FDA4AF] border border-[#F43F5E]/30"
                  >
                    {item.r || 'offline'}: {item.c}
                  </span>
                ))}
              </div>
            )}

            {Array.isArray(doctorReport?.removedChannels) && doctorReport.removedChannels.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase text-[#FDA4AF] block">
                  Quarantined / Dead Streams ({doctorReport.removedChannels.length} shown — click Revive to test &amp; restore)
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {doctorReport.removedChannels.slice(0, 20).map((item: any, idx: number) => (
                    <div
                      key={`${item.url}-${idx}`}
                      className="p-2.5 bg-[#0B132B] border border-[#F43F5E]/25 rounded-lg flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-white block truncate">{item.name || 'Stream Feed'}</span>
                        <span className="text-[10px] font-mono text-[#FDA4AF] block truncate">
                          {item.reason || 'Dead'} · {item.url}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={revivingUrl === item.url}
                        onClick={() => handleReviveStream(item.url)}
                        className="min-h-[34px] px-3 py-1 rounded-lg btn-premium-emerald text-[11px] font-bold shrink-0 disabled:opacity-50 cursor-pointer"
                      >
                        {revivingUrl === item.url ? 'Reviving...' : 'Revive'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2.8: Real-Time Site Visitor Traffic & Details Analytics */}
          <div className="bg-[#070C1E] border border-[#00D9FF]/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#00D9FF]/20 pb-2.5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#10B981] shrink-0" />
                <Users className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <h3 className="text-sm font-extrabold text-white">Live Site Visitors & Real-Time Traffic Analytics</h3>
              </div>
              <button
                type="button"
                onClick={fetchAnalytics}
                disabled={isFetchingAnalytics}
                className="min-h-[36px] px-3 py-1 btn-premium-cyan text-[11px] font-extrabold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isFetchingAnalytics ? 'animate-spin' : ''}`} />
                <span>Refresh Stats</span>
              </button>
            </div>

            {/* Metrics Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-[#0B132B] border border-[#10B981]/30 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <span className="text-[10px] text-[#C9D1E0] font-bold uppercase">Online Now</span>
                </div>
                <span className="text-lg font-black text-[#10B981] tabular-nums">
                  {analyticsData?.stats?.liveActiveVisitors ?? 1}
                </span>
                <span className="text-[9px] text-[#6EE7B7] block">Active in last 60s</span>
              </div>

              <div className="bg-[#0B132B] border border-[#00D9FF]/30 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users className="w-3.5 h-3.5 text-[#00D9FF] shrink-0" />
                  <span className="text-[10px] text-[#C9D1E0] font-bold uppercase">Total Unique</span>
                </div>
                <span className="text-lg font-black text-[#00D9FF] tabular-nums">
                  {analyticsData?.stats?.totalUniqueVisitors ?? 1}
                </span>
                <span className="text-[9px] text-[#C9D1E0] block">Unique visitors</span>
              </div>

              <div className="bg-[#0B132B] border border-[#B832F5]/30 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Eye className="w-3.5 h-3.5 text-[#B832F5] shrink-0" />
                  <span className="text-[10px] text-[#C9D1E0] font-bold uppercase">Page Views</span>
                </div>
                <span className="text-lg font-black text-[#D8B4FE] tabular-nums">
                  {analyticsData?.stats?.totalPageViews ?? 1}
                </span>
                <span className="text-[9px] text-[#C9D1E0] block">Total hits tracked</span>
              </div>

              <div className="bg-[#0B132B] border border-[#F59E0B]/30 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Tv className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                  <span className="text-[10px] text-[#C9D1E0] font-bold uppercase">Streams Played</span>
                </div>
                <span className="text-lg font-black text-[#F59E0B] tabular-nums">
                  {analyticsData?.stats?.totalStreamSessions ?? 0}
                </span>
                <span className="text-[9px] text-[#C9D1E0] block">Live TV sessions</span>
              </div>
            </div>

            {/* Device Distribution */}
            {analyticsData?.stats?.deviceDistribution && (
              <div className="bg-[#0B132B] border border-[#00D9FF]/25 rounded-xl p-3">
                <span className="text-[10px] font-bold uppercase text-[#C9D1E0] block mb-2">Device & Platform Breakdown</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-lg bg-[#070C1E] border border-[#00D9FF]/25">
                    <Tv className="w-4 h-4 text-[#00D9FF] mx-auto mb-1" />
                    <span className="text-white block font-bold">Smart TV</span>
                    <span className="text-[#00D9FF] font-extrabold tabular-nums">{analyticsData.stats.deviceDistribution['Smart TV']} Users</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#070C1E] border border-[#10B981]/25">
                    <Smartphone className="w-4 h-4 text-[#10B981] mx-auto mb-1" />
                    <span className="text-white block font-bold">Mobile</span>
                    <span className="text-[#10B981] font-extrabold tabular-nums">{analyticsData.stats.deviceDistribution['Mobile']} Users</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#070C1E] border border-[#B832F5]/25">
                    <Monitor className="w-4 h-4 text-[#B832F5] mx-auto mb-1" />
                    <span className="text-white block font-bold">Desktop</span>
                    <span className="text-[#D8B4FE] font-extrabold tabular-nums">{analyticsData.stats.deviceDistribution['Desktop']} Users</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#070C1E] border border-[#F59E0B]/25">
                    <Smartphone className="w-4 h-4 text-[#F59E0B] mx-auto mb-1" />
                    <span className="text-white block font-bold">Tablet</span>
                    <span className="text-[#F59E0B] font-extrabold tabular-nums">{analyticsData.stats.deviceDistribution['Tablet']} Users</span>
                  </div>
                </div>
              </div>
            )}

            {/* Active Visitor Session Logs */}
            {analyticsData?.recentVisitors && analyticsData.recentVisitors.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-[#C9D1E0] block">Live Active Visitor Logs</span>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {analyticsData.recentVisitors.map((v: any, idx: number) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-[#0B132B] border border-[#00D9FF]/20 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                        <div>
                          <span className="font-mono text-white font-bold">{v.ip}</span>
                          <span className="text-[10px] text-[#C9D1E0] ml-2">({v.deviceType} • {v.browser} on {v.os})</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-[#00D9FF] font-semibold block">{v.currentChannel}</span>
                        <span className="text-[9px] text-[#C9D1E0]/70">Active {v.lastActiveSecondsAgo}s ago</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Active M3U Sources List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <h3 className="text-sm font-extrabold text-white">Active Channel Network Feeds ({sources.length})</h3>
              </div>
              <button
                type="button"
                onClick={handleForceRefreshAll}
                disabled={isRefreshing}
                className="min-h-[40px] px-3.5 py-2 btn-premium-cyan text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync & Update Playlists'}</span>
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {sources.map((src, idx) => {
                const displayName = (src.name || 'Broadcast Feed')
                  .replace(/SkyM3U\s*/gi, '')
                  .replace(/88tv\s*/gi, '')
                  .replace(/kceh\s*/gi, '')
                  .replace(/fcdb\s*/gi, '')
                  .replace(/iptv[-_]org\s*/gi, '')
                  .trim() || 'Broadcast Feed';
                return (
                  <div 
                    key={src.prefix || idx}
                    className="bg-[#0B132B] border border-[#00D9FF]/25 hover:border-[#00D9FF]/60 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-white truncate">M R S IPTV • {displayName}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#00D9FF]/15 text-[#00D9FF] border border-[#00D9FF]/35 shrink-0">
                          CLUSTER #{idx + 1}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#C9D1E0] truncate mt-0.5 font-mono">
                        mrs-transponder-relay-0{idx + 1}.live.stream (M R S Dedicated Cluster)
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {confirmDeletePrefix === src.prefix ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteSource(src.prefix, src.name)}
                            className="min-h-[36px] px-3 py-1 bg-[#F43F5E] hover:bg-[#E11D48] text-white text-[11px] font-extrabold rounded-lg cursor-pointer"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePrefix(null)}
                            className="min-h-[36px] px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePrefix(src.prefix)}
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#C9D1E0] hover:text-[#F43F5E] hover:bg-[#F43F5E]/15 transition-colors cursor-pointer"
                          title="Remove source"
                          aria-label={`Remove source ${displayName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#070C1E] border-t border-[#00D9FF]/25 flex items-center justify-between text-xs text-[#C9D1E0]">
          <span>Last Updated: {lastFetchedAt ? new Date(lastFetchedAt).toLocaleTimeString() : 'Just now'}</span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 py-2 btn-premium-glass text-white font-bold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
