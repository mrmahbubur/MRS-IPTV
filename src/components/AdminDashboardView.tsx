import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Key, RefreshCw, CheckCircle2, Mail, Database,
  Cpu, Search, Download, Plus, RotateCcw, Ban, Eye, Activity,
  ArrowLeft, Lock, Unlock, Wallet, Server, HardDrive, X, Megaphone
} from 'lucide-react';
import { auth, signInWithGoogle, logOut } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  initWorkspaceAuth,
  googleWorkspaceSignIn,
  getWorkspaceAccessToken,
  backupDatabaseToDriveBackend,
  syncPaymentsFromGmailBackend,
  flushOutboxViaGmailBackend,
} from '../lib/googleWorkspace';

interface AdminDashboardViewProps {
  onBackToHome: () => void;
}

const TOKEN_STORAGE_KEY = 'mrs_admin_token';

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ onBackToHome }) => {
  const [adminToken, setAdminToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [tokenInput, setTokenInput] = useState('');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'ledger' | 'codes' | 'outbox' | 'audit' | 'doctor' | 'ads'>('overview');
  const [actionBanner, setActionBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [adsReport, setAdsReport] = useState<any>(null);
  const [rewardsReport, setRewardsReport] = useState<any>(null);
  const [adsSettings, setAdsSettings] = useState<{
    formats: { banner: boolean; sticky: boolean; popunder: boolean; interstitial: boolean; push: boolean };
    testMode: boolean;
    monetag?: { showRegularAds: boolean; rewarded?: { enabled: boolean; showFn?: string | null } };
  }>({
    formats: { banner: true, sticky: true, popunder: false, interstitial: false, push: false },
    testMode: true,
    monetag: { showRegularAds: false, rewarded: { enabled: false, showFn: null } },
  });
  const [rewardedShowFnInput, setRewardedShowFnInput] = useState('');
  const [adsBusy, setAdsBusy] = useState(false);

  // Dashboard Data
  const [stats, setStats] = useState<any>(null);
  const [revenueData, setRevenueData] = useState<any>(null);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [camelliaStatus, setCamelliaStatus] = useState<any>(null);
  const [doctorStatus, setDoctorStatus] = useState<any>(null);
  const [doctorLogs, setDoctorLogs] = useState<string[]>([]);
  const [checkerStatus, setCheckerStatus] = useState<any>(null);
  const [checkerSources, setCheckerSources] = useState<Array<{ source: string; total: number; live: number; dead: number; waiting: number }>>([]);
  const [checkerDead, setCheckerDead] = useState<Array<{ id: number; name: string; group: string | null; url: string; source: string; reason: string | null; fail_count: number; last_checked: number | null }>>([]);
  const [deadSourceFilter, setDeadSourceFilter] = useState<string>('');
  const [checkerBusy, setCheckerBusy] = useState<boolean>(false);

  const [orders, setOrders] = useState<any[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [rejectReason, setRejectReason] = useState('Payment could not be verified on account ledger');

  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'unclaimed'>('all');
  const [newLedger, setNewLedger] = useState({
    channel: 'bkash',
    trxId: '',
    amount: '',
    currency: 'BDT',
    sender: ''
  });

  const [codesRows, setCodesRows] = useState<any[]>([]);
  const [codeStatusFilter, setCodeStatusFilter] = useState('');
  const [codePlanFilter, setCodePlanFilter] = useState('');
  const [codeSearchQuery, setCodeSearchQuery] = useState('');
  const [genPlan, setGenPlan] = useState<'1m' | '2m' | '6m' | '12m'>('1m');
  const [genCount, setGenCount] = useState(25);

  const [outboxRows, setOutboxRows] = useState<any[]>([]);
  const [mailHealth, setMailHealth] = useState<any>(null);
  const [mailBusy, setMailBusy] = useState(false);
  const [wsTokenReady, setWsTokenReady] = useState(false);
  const [wsBusy, setWsBusy] = useState(false);
  const [wsConfirm, setWsConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
    });
    const unsubWs = initWorkspaceAuth(
      () => setWsTokenReady(true),
      () => setWsTokenReady(false)
    );
    getWorkspaceAccessToken().then((t) => setWsTokenReady(Boolean(t)));
    return () => {
      unsub();
      unsubWs();
    };
  }, []);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (adminToken.trim()) return adminToken.trim();
    if (firebaseUser) {
      try {
        return await firebaseUser.getIdToken();
      } catch {
        return null;
      }
    }
    return null;
  }, [adminToken, firebaseUser]);

  const adminFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const tok = await getAuthToken();
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> || {}),
    };
    if (tok) headers['Authorization'] = `Bearer ${tok}`;
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401 || res.status === 403) {
      setIsAuthenticated(false);
      throw new Error('Admin authentication required');
    }
    return res;
  }, [getAuthToken]);

  const showBanner = (type: 'ok' | 'err', text: string) => {
    setActionBanner({ type, text });
    setTimeout(() => setActionBanner(null), 5000);
  };

  const loadAllDashboardData = useCallback(async () => {
    setIsLoading(true);
    setAuthError('');
    try {
      const orderQs = new URLSearchParams({
        ...(orderStatusFilter ? { status: orderStatusFilter } : {}),
        ...(orderSearchQuery.trim() ? { q: orderSearchQuery.trim() } : {}),
      }).toString();

      const deadQs = new URLSearchParams({
        limit: '250',
        ...(deadSourceFilter ? { source: deadSourceFilter } : {}),
      }).toString();

      const [statsRes, revRes, auditRes, ordersRes, ledgerRes, codesRes, outboxRes, camRes, docRes, docLogsRes, chkSrcRes, chkDeadRes, adsRes, rewRes] = await Promise.all([
        adminFetch('/api/admin/stats'),
        adminFetch('/api/admin/revenue'),
        adminFetch('/api/admin/audit?limit=120'),
        adminFetch(`/api/admin/orders${orderQs ? `?${orderQs}` : ''}`),
        adminFetch(`/api/admin/ledger${ledgerFilter === 'unclaimed' ? '?claimed=0' : ''}`),
        adminFetch(`/api/admin/codes?${new URLSearchParams({
          ...(codeStatusFilter ? { status: codeStatusFilter } : {}),
          ...(codePlanFilter ? { plan: codePlanFilter } : {}),
          ...(codeSearchQuery ? { q: codeSearchQuery } : {})
        }).toString()}`),
        adminFetch('/api/admin/outbox?limit=80'),
        fetch('/api/camellia/status').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/m3u-doctor/status').then(r => r.ok ? r.json() : null).catch(() => null),
        adminFetch('/api/m3u-doctor/logs?lines=120').then(r => r.ok ? r.json() : { logs: [] }).catch(() => ({ logs: [] })),
        adminFetch('/api/admin/checker/sources').then(r => r.ok ? r.json() : null).catch(() => null),
        adminFetch(`/api/admin/checker/dead?${deadQs}`).then(r => r.ok ? r.json() : null).catch(() => null),
        adminFetch('/api/admin/ads/report?days=30').then(r => r.ok ? r.json() : null).catch(() => null),
        adminFetch('/api/admin/rewards/report?days=30').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const statsJson = await statsRes.json();
      setStats(statsJson);
      if (revRes.ok) setRevenueData(await revRes.json());
      if (auditRes.ok) {
        const aData = await auditRes.json();
        setAuditRows(aData.logs || []);
      }
      setOrders(await ordersRes.json());
      setLedgerRows(await ledgerRes.json());
      const codesData = await codesRes.json();
      setCodesRows(codesData.codes || []);
      const outboxData = await outboxRes.json();
      setOutboxRows(outboxData.emails || []);
      setMailHealth(outboxData.mail || statsJson.mail || null);
      if (camRes) setCamelliaStatus(camRes);
      if (docRes) setDoctorStatus(docRes);
      setDoctorLogs(docLogsRes?.logs || []);
      if (chkSrcRes?.sources) setCheckerSources(chkSrcRes.sources);
      if (chkSrcRes?.status) setCheckerStatus(chkSrcRes.status);
      if (chkDeadRes?.dead) setCheckerDead(chkDeadRes.dead);
      if (adsRes?.ok && adsRes?.data) {
        setAdsReport(adsRes.data);
        if (adsRes.data.settings) {
          setAdsSettings(adsRes.data.settings);
          setRewardedShowFnInput(String(adsRes.data.settings.monetag?.rewarded?.showFn || ''));
        }
      }
      if (rewRes?.ok && rewRes?.data) {
        setRewardsReport(rewRes.data);
      }
      setIsAuthenticated(true);
    } catch (e: any) {
      setAuthError(e?.message || 'Unable to authenticate with Admin API.');
    } finally {
      setIsLoading(false);
    }
  }, [adminFetch, orderStatusFilter, orderSearchQuery, ledgerFilter, codeStatusFilter, codePlanFilter, codeSearchQuery, deadSourceFilter]);

  useEffect(() => {
    if (adminToken || firebaseUser) {
      loadAllDashboardData();
    }
  }, [adminToken, firebaseUser, loadAllDashboardData]);

  const handleTokenLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tokenInput.trim();
    if (!cleaned) return;
    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, cleaned);
    } catch {}
    setAdminToken(cleaned);
  };

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {}
    setAdminToken('');
    setIsAuthenticated(false);
    setSelectedOrderDetail(null);
    if (firebaseUser) await logOut();
  };

  const inspectOrder = async (id: number | string) => {
    try {
      if (screenshotUrl) {
        URL.revokeObjectURL(screenshotUrl);
        setScreenshotUrl(null);
      }
      const res = await adminFetch(`/api/admin/orders/${encodeURIComponent(String(id))}`);
      const detail = await res.json();
      setSelectedOrderDetail(detail);
      if (detail.has_screenshot) {
        const sRes = await adminFetch(`/api/admin/orders/${detail.id}/screenshot`);
        if (sRes.ok) {
          const blob = await sRes.blob();
          setScreenshotUrl(URL.createObjectURL(blob));
        }
      }
    } catch (e: any) {
      showBanner('err', e?.message || 'Failed to inspect order');
    }
  };

  const handleOrderAction = async (id: number | string, action: 'approve' | 'reject' | 'recheck' | 'resend') => {
    try {
      const payload = action === 'approve'
        ? { note: approveNote || 'Verified via #admin web console' }
        : action === 'reject'
          ? { reason: rejectReason || 'Rejected by administrator' }
          : {};
      const res = await adminFetch(`/api/admin/orders/${encodeURIComponent(String(id))}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Action ${action} failed`);
      showBanner('ok', `Order #${id}: ${action.toUpperCase()} completed.`);
      await loadAllDashboardData();
      if (selectedOrderDetail?.id === id) {
        inspectOrder(id);
      }
    } catch (e: any) {
      showBanner('err', e?.message || `Failed to ${action} order`);
    }
  };

  const handleRunAutoActivate = async () => {
    try {
      const res = await adminFetch('/api/admin/auto-activate/run', { method: 'POST' });
      const data = await res.json();
      showBanner('ok', `12-Hour Auto-Activation Check Complete: ${data.activatedCount || 0} order(s) activated.`);
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'Failed to run auto-activation sweep');
    }
  };

  const handleRunBackup = async () => {
    try {
      const res = await adminFetch('/api/admin/backup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.reason || 'Backup failed');
      showBanner('ok', `SQLite Vacuum Backup saved (${data.file || 'ok'}).`);
    } catch (e: any) {
      showBanner('err', e?.message || 'Database backup failed');
    }
  };

  const handleAddLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminFetch('/api/admin/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: newLedger.channel,
          trxId: newLedger.trxId.trim(),
          amount: Number(newLedger.amount),
          currency: newLedger.currency,
          sender: newLedger.sender.trim() || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to add ledger entry');
      showBanner('ok', data.duplicate ? 'Ledger entry already exists (matched idempotently).' : 'Payment added to real SQLite ledger.');
      setNewLedger({ ...newLedger, trxId: '', amount: '', sender: '' });
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'Ledger insert failed');
    }
  };

  const handleGenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminFetch('/api/admin/codes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: genPlan, count: Number(genCount) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to generate codes');
      showBanner('ok', `Generated ${data.created} unique MRS VIP codes for plan ${genPlan}.`);
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'Code generation failed');
    }
  };

  const handleCodeAction = async (code: string, action: 'reset-device' | 'revoke') => {
    try {
      const res = await adminFetch(`/api/admin/codes/${encodeURIComponent(code)}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Code action failed');
      showBanner('ok', `Code ${code}: ${action === 'reset-device' ? 'Device lock reset' : 'Revoked'}.`);
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'Failed to update code');
    }
  };

  const handleExportCodesCsv = async () => {
    try {
      const qs = new URLSearchParams({
        status: codeStatusFilter || 'available',
        ...(codePlanFilter ? { plan: codePlanFilter } : {})
      }).toString();
      const res = await adminFetch(`/api/admin/codes/export?${qs}`);
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mrs-iptv-codes-${codeStatusFilter || 'available'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showBanner('err', e?.message || 'CSV export failed');
    }
  };

  const handleDoctorRun = async (mode: 'full' | 'retry') => {
    try {
      const res = await adminFetch('/api/m3u-doctor/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Scan trigger failed');
      showBanner('ok', data.message || `Started M3U Doctor ${mode} scan.`);
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'M3U Doctor scan failed');
    }
  };

  const handleRunLiveChecker = async () => {
    try {
      setCheckerBusy(true);
      const res = await adminFetch('/api/admin/checker/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Live checker run failed');
      showBanner('ok', `Live Checker synced ${data.sync?.total || 0} entries, probed ${data.check?.checked || 0} streams (${data.check?.live || 0} live, ${data.check?.dead || 0} dead).`);
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'Live checker run failed');
    } finally {
      setCheckerBusy(false);
    }
  };

  const handleExportDeadCsv = async () => {
    try {
      const qs = deadSourceFilter ? `?source=${encodeURIComponent(deadSourceFilter)}` : '';
      const res = await adminFetch(`/api/admin/checker/dead.csv${qs}`);
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mrs-iptv-dead-channels${deadSourceFilter ? '-filtered' : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showBanner('err', e?.message || 'Dead channel CSV export failed');
    }
  };

  const handleCamelliaAction = async (action: string) => {
    try {
      const res = await adminFetch('/api/camellia/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Camellia action failed');
      showBanner('ok', data.message || `Camellia executed: ${action}`);
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'Camellia action error');
    }
  };

  const ensureGoogleWorkspaceConnected = async () => {
    const tok = await getWorkspaceAccessToken();
    if (tok) return true;
    const res = await googleWorkspaceSignIn();
    setWsTokenReady(Boolean(res?.accessToken));
    return Boolean(res?.accessToken);
  };

  const handleConnectWorkspace = async () => {
    try {
      setWsBusy(true);
      const res = await googleWorkspaceSignIn();
      setWsTokenReady(Boolean(res?.accessToken));
      showBanner('ok', `Connected Google Workspace (${res.user.email || 'Authorized'}) for backend Drive & Gmail.`);
    } catch (e: any) {
      showBanner('err', e?.message || 'Google Workspace sign-in cancelled or failed.');
    } finally {
      setWsBusy(false);
    }
  };

  const handleSyncGmailPayments = async () => {
    try {
      setWsBusy(true);
      const tok = await getAuthToken();
      if (!tok) throw new Error('Admin token required');
      await ensureGoogleWorkspaceConnected();
      const data = await syncPaymentsFromGmailBackend(tok);
      showBanner(
        'ok',
        `Gmail Sync Complete: scanned ${data.scanned} messages, added ${data.added} new receipt(s) (${data.duplicates} duplicate, ${data.unparsed} unmatched).`
      );
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'Gmail receipt sync failed');
    } finally {
      setWsBusy(false);
    }
  };

  const requestDriveBackup = async () => {
    try {
      await ensureGoogleWorkspaceConnected();
      const avail = Object.values(stats?.stock || {}).reduce(
        (acc: number, row: any) => acc + Number(row?.available || 0),
        0
      );
      setWsConfirm({
        title: 'Upload Database & Codes Backup to Google Drive?',
        description: `The backend will package recent orders, ledger rows, audit logs, and ${avail} unused VIP codes CSV into your Google Drive folder "M R S IPTV Backups".`,
        confirmLabel: 'Upload Backup to Drive',
        onConfirm: async () => {
          const tok = await getAuthToken();
          if (!tok) throw new Error('Admin token required');
          const data = await backupDatabaseToDriveBackend(tok);
          showBanner(
            'ok',
            `Uploaded JSON snapshot & ${data.unusedCodesCount} unused codes CSV to Google Drive ("M R S IPTV Backups").`
          );
          await loadAllDashboardData();
        },
      });
    } catch (e: any) {
      showBanner('err', e?.message || 'Could not initialize Google Drive backup');
    }
  };

  const requestFlushOutboxViaGmail = async () => {
    try {
      await ensureGoogleWorkspaceConnected();
      const queuedOrFailed = outboxRows.filter((m) => m.status === 'queued' || m.status === 'failed');
      setWsConfirm({
        title: 'Send Queued Outbox Emails via Gmail API?',
        description: `The backend will send ${queuedOrFailed.length} queued/failed activation & notification emails directly through your connected Gmail account.`,
        confirmLabel: 'Send Emails via Gmail',
        onConfirm: async () => {
          const tok = await getAuthToken();
          if (!tok) throw new Error('Admin token required');
          const data = await flushOutboxViaGmailBackend(tok, { includeFailed: true, limit: 30 });
          showBanner('ok', `Gmail Outbox Flush: ${data.sent} sent, ${data.failed} failed out of ${data.queuedFound} queued.`);
          await loadAllDashboardData();
        },
      });
    } catch (e: any) {
      showBanner('err', e?.message || 'Could not initialize Gmail outbox flush');
    }
  };

  const handleVerifySmtp = async (sendTest = false) => {
    try {
      setMailBusy(true);
      const res = await adminFetch('/api/admin/mail/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendTest }),
      });
      const data = await res.json();
      if (data.mail) setMailHealth(data.mail);
      if (!res.ok || !data.ok) {
        throw new Error(data.reason || data.error?.message || 'SMTP connection verify failed');
      }
      showBanner(
        'ok',
        sendTest
          ? `SMTP Verified & Test Email dispatched (${data.testSentTo || 'admin'}).`
          : `SMTP Connection Verified (${data.mail?.host || 'smtp'}).`
      );
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'SMTP verify failed');
    } finally {
      setMailBusy(false);
    }
  };

  const handleFlushSmtpOutbox = async () => {
    try {
      setMailBusy(true);
      const res = await adminFetch('/api/admin/mail/flush', { method: 'POST' });
      const data = await res.json();
      if (data.mail) setMailHealth(data.mail);
      if (!res.ok) throw new Error(data.error?.message || 'Outbox flush failed');
      showBanner('ok', `Outbox Flush Complete: ${data.sent || 0} email(s) processed via ${data.mail?.mode || 'mail'}.`);
      await loadAllDashboardData();
    } catch (e: any) {
      showBanner('err', e?.message || 'Failed to flush outbox');
    } finally {
      setMailBusy(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 min-h-screen bg-[#050816] text-white flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-[#0B132B] border border-[#00D9FF]/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00D9FF]/15 border border-[#00D9FF]/50 flex items-center justify-center text-[#00D9FF] shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight">M R S IPTV Admin Console</h1>
                <p className="text-[11px] text-[#94A3B8]">Managed with Camellia Autonomous Authority</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onBackToHome}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Exit</span>
            </button>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/50 text-xs text-rose-200 font-semibold">
              {authError}
            </div>
          )}

          <form onSubmit={handleTokenLogin} className="space-y-3">
            <label className="block text-xs font-bold text-[#C9D1E0]">
              Admin Access Token (Bearer / ADMIN_TOKEN)
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Enter ADMIN_TOKEN..."
              className="w-full min-h-[42px] px-3.5 py-2.5 rounded-lg bg-[#050816] border border-[#00D9FF]/35 text-sm font-mono text-white focus:outline-none focus:border-[#00D9FF]"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[42px] rounded-lg btn-premium-primary text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <Key className="w-4 h-4 shrink-0" />
              <span>{isLoading ? 'Verifying...' : 'Unlock with Admin Token'}</span>
            </button>
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-white/10" />
            <span className="shrink mx-3 text-[10px] uppercase font-mono text-[#94A3B8]">OR</span>
            <div className="flex-grow border-t border-white/10" />
          </div>

          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="w-full min-h-[42px] rounded-lg bg-white/10 hover:bg-white/15 border border-white/25 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              {firebaseUser ? `Signed in as ${firebaseUser.email}` : 'Sign in with Google Admin Account'}
            </span>
          </button>
        </div>
      </div>
    );
  }

  const orderStatusCounts = stats?.orders || {};
  const stockByPlan = stats?.stock || {};
  const outboxCounts = stats?.outbox || {};

  return (
    <div className="flex-1 min-h-screen bg-[#050816] text-white p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHome}
            className="min-h-[38px] px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Live TV</span>
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#00D9FF] shrink-0" />
              <span>M R S IPTV · #admin Operations Console</span>
            </h1>
            <p className="text-xs text-[#94A3B8]">
              Real SQLite Payment Verification · 12h Auto-Activation · VIP Codes · M3U Doctor · Camellia Control
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAllDashboardData}
            className="min-h-[38px] px-3 py-2 rounded-lg bg-[#0B132B] hover:bg-[#142044] border border-[#00D9FF]/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[38px] px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Unlock className="w-3.5 h-3.5 shrink-0" />
            <span>Lock Session</span>
          </button>
        </div>
      </div>

      {actionBanner && (
        <div className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-between ${
          actionBanner.type === 'ok'
            ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
            : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
        }`}>
          <span>{actionBanner.text}</span>
          <button type="button" onClick={() => setActionBanner(null)} className="w-7 h-7 rounded-md flex items-center justify-center text-white/70 hover:text-white cursor-pointer">×</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview', label: 'Overview & Revenue', icon: Activity },
          { id: 'orders', label: `Orders (${orders.length})`, icon: Wallet },
          { id: 'ledger', label: `Payment Ledger (${ledgerRows.length})`, icon: Database },
          { id: 'codes', label: 'VIP Codes Pool', icon: Key },
          { id: 'outbox', label: `Email Outbox (${outboxRows.length})`, icon: Mail },
          { id: 'audit', label: `Audit Log (${auditRows.length})`, icon: ShieldCheck },
          { id: 'doctor', label: 'M3U Doctor', icon: Cpu },
          { id: 'ads', label: 'Monetag Ads', icon: Megaphone },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`min-h-[38px] px-3.5 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 border cursor-pointer transition-all ${
                active
                  ? 'bg-[#00D9FF]/20 border-[#00D9FF] text-white'
                  : 'bg-[#0B132B] border-white/10 text-[#94A3B8] hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-[#0B132B] border border-white/10 space-y-1">
              <span className="text-[10px] uppercase font-mono text-[#94A3B8]">Verified Orders</span>
              <div className="text-2xl font-black text-emerald-400 tabular-nums">{orderStatusCounts.verified || 0}</div>
              <div className="text-[11px] text-[#C9D1E0] tabular-nums">
                Pending: {orderStatusCounts.pending || 0} · Review: {orderStatusCounts.needs_review || 0}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#0B132B] border border-white/10 space-y-1">
              <span className="text-[10px] uppercase font-mono text-[#94A3B8]">12h Auto-Activation</span>
              <div className="text-2xl font-black text-amber-400 tabular-nums">{camelliaStatus?.system?.completedAutoActivations || 0}</div>
              <div className="text-[11px] text-[#C9D1E0] tabular-nums">
                Scheduled Waiting: {camelliaStatus?.system?.pendingAutoActivations || 0}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#0B132B] border border-white/10 space-y-1">
              <span className="text-[10px] uppercase font-mono text-[#94A3B8]">Email Outbox</span>
              <div className="text-2xl font-black text-[#00D9FF] tabular-nums">{outboxCounts.sent || 0} Sent</div>
              <div className="text-[11px] text-[#C9D1E0] tabular-nums">
                Queued: {outboxCounts.queued || 0} · Failed: {outboxCounts.failed || 0}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#0B132B] border border-white/10 space-y-1">
              <span className="text-[10px] uppercase font-mono text-[#94A3B8]">Unclaimed Ledger Rows</span>
              <div className="text-2xl font-black text-purple-400 tabular-nums">{stats?.unclaimedPayments || 0}</div>
              <div className="text-[11px] text-[#C9D1E0] tabular-nums">
                Live Visitors: {camelliaStatus?.system?.liveActiveVisitors ?? 0}
              </div>
            </div>
          </div>

          {/* Code Stock Matrix with Low-Stock (<50) Alert */}
          <div className="p-5 rounded-xl bg-[#0B132B] border border-white/10 space-y-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Real SQLite VIP Code Stock Matrix</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {['1m', '2m', '6m', '12m'].map((p) => {
                const row = stockByPlan[p] || {};
                const low = Boolean(row.lowStock) || Number(row.available || 0) < 50;
                return (
                  <div key={p} className={`p-3 rounded-lg bg-[#050816] border text-xs space-y-1 tabular-nums ${low ? 'border-rose-500/60' : 'border-white/10'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-[#00D9FF] uppercase">{p} Plan</span>
                      {low && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-black uppercase">
                          Low Stock &lt;50
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between"><span>Available:</span><strong className={low ? 'text-rose-400' : 'text-emerald-400'}>{row.available || 0}</strong></div>
                    <div className="flex justify-between"><span>Issued (Reserved):</span><strong className="text-amber-300">{row.issued || 0}</strong></div>
                    <div className="flex justify-between"><span>Redeemed (Active):</span><strong className="text-white">{row.redeemed || 0}</strong></div>
                    <div className="flex justify-between"><span>Revoked:</span><strong className="text-rose-400">{row.revoked || 0}</strong></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Revenue Breakdown (Per Plan / Method / Day) */}
          {revenueData && (
            <div className="p-5 rounded-xl bg-[#0B132B] border border-white/10 space-y-3">
              <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Verified Revenue Breakdown</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-[#050816] border border-white/10 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-[#94A3B8]">By Plan</div>
                  {(revenueData.byPlan || []).length > 0 ? revenueData.byPlan.map((r: any, i: number) => (
                    <div key={i} className="flex justify-between font-mono tabular-nums">
                      <span>{r.plan} ({r.orders}x)</span>
                      <strong className="text-emerald-400">{(Number(r.total_minor || 0) / 100).toFixed(2)} {r.currency}</strong>
                    </div>
                  )) : <div className="text-[#94A3B8]">No verified orders yet.</div>}
                </div>
                <div className="p-3 rounded-lg bg-[#050816] border border-white/10 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-[#94A3B8]">By Payment Method</div>
                  {(revenueData.byMethod || []).length > 0 ? revenueData.byMethod.map((r: any, i: number) => (
                    <div key={i} className="flex justify-between font-mono tabular-nums">
                      <span className="uppercase">{r.channel} ({r.orders}x)</span>
                      <strong className="text-[#38BDF8]">{(Number(r.total_minor || 0) / 100).toFixed(2)} {r.currency}</strong>
                    </div>
                  )) : <div className="text-[#94A3B8]">No verified orders yet.</div>}
                </div>
                <div className="p-3 rounded-lg bg-[#050816] border border-white/10 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-[#94A3B8]">Recent Days</div>
                  {(revenueData.byDay || []).slice(0, 6).map((r: any, i: number) => (
                    <div key={i} className="flex justify-between font-mono tabular-nums">
                      <span>{r.day} ({r.orders}x)</span>
                      <strong className="text-amber-300">{(Number(r.total_minor || 0) / 100).toFixed(2)} {r.currency}</strong>
                    </div>
                  ))}
                  {(revenueData.byDay || []).length === 0 && <div className="text-[#94A3B8]">No daily history yet.</div>}
                </div>
              </div>
            </div>
          )}

          {/* Quick Operations */}
          <div className="p-5 rounded-xl bg-[#0B132B] border border-white/10 space-y-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Backend Automation & Camellia Triggers</span>
            </h2>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={handleRunAutoActivate} className="min-h-[38px] px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs font-bold cursor-pointer">
                Run 12h Delayed Auto-Activation Check
              </button>
              <button type="button" onClick={handleRunBackup} className="min-h-[38px] px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-bold cursor-pointer">
                Create SQLite Backup Now
              </button>
              <button type="button" onClick={() => handleCamelliaAction('run_maintenance')} className="min-h-[38px] px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 text-xs font-bold cursor-pointer">
                Camellia Daily Maintenance
              </button>
              <button type="button" onClick={() => handleCamelliaAction('sync_channels')} className="min-h-[38px] px-4 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/50 text-indigo-200 text-xs font-bold cursor-pointer">
                Sync 8,890+ M3U Channels
              </button>
              <button type="button" onClick={() => handleCamelliaAction('flush_cache')} className="min-h-[38px] px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/25 text-white text-xs font-bold cursor-pointer">
                Flush Stream Proxy Cache
              </button>
              <button type="button" onClick={() => handleCamelliaAction('send_monthly_email')} className="min-h-[38px] px-4 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-200 text-xs font-bold cursor-pointer">
                Dispatch Monthly Report Email
              </button>
            </div>
          </div>

          {/* Google Drive & Gmail Backend Automation */}
          <div className="p-5 rounded-xl bg-[#0B132B] border border-[#38BDF8]/30 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[#38BDF8] shrink-0" />
                  <span>Google Drive &amp; Gmail Backend Services</span>
                </h2>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">
                  Client OAuth Bearer token is passed securely to <code>/api/workspace/*</code> for Drive backups, Gmail payment sync, and outbox email delivery.
                </p>
              </div>
              {wsTokenReady ? (
                <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Workspace Session Active
                </span>
              ) : (
                <GoogleSignInButton onClick={handleConnectWorkspace} disabled={wsBusy} />
              )}
            </div>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                disabled={wsBusy}
                onClick={requestDriveBackup}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                <span>Backup DB &amp; Codes CSV to Google Drive</span>
              </button>
              <button
                type="button"
                disabled={wsBusy}
                onClick={handleSyncGmailPayments}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span>Sync Skrill / Payoneer Receipts from Gmail</span>
              </button>
              <button
                type="button"
                disabled={wsBusy}
                onClick={requestFlushOutboxViaGmail}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span>Send Queued Outbox via Gmail API</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORDERS QUEUE */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {['', 'needs_review', 'pending', 'verified', 'rejected', 'expired'].map((st) => (
                <button
                  key={st || 'all'}
                  type="button"
                  onClick={() => setOrderStatusFilter(st)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                    orderStatusFilter === st
                      ? 'bg-[#00D9FF]/20 border-[#00D9FF] text-white'
                      : 'bg-[#0B132B] border-white/10 text-[#94A3B8]'
                  }`}
                >
                  {st ? st.toUpperCase() : 'ALL'}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-[#94A3B8]" />
              <input
                type="text"
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                placeholder="Search email, TrxID, Ref, or code..."
                className="min-h-[38px] w-64 pl-8 pr-3 py-1.5 rounded-lg bg-[#0B132B] border border-white/15 text-xs text-white focus:outline-none focus:border-[#00D9FF]"
              />
            </div>
          </div>

          <div className="overflow-x-auto bg-[#0B132B] border border-white/10 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#050816] border-b border-white/10 text-[#94A3B8] uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Plan / Channel</th>
                  <th className="p-3">Buyer Email / Phone</th>
                  <th className="p-3">TrxID</th>
                  <th className="p-3">Mail Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-white/[0.02]">
                    <td className="p-3 font-mono font-bold text-[#00D9FF]">{o.public_id}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase ${
                        o.status === 'verified' ? 'bg-emerald-500/20 text-emerald-300' :
                        o.status === 'needs_review' ? 'bg-amber-500/20 text-amber-300' :
                        o.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10 text-white'
                      }`}>{o.status}</span>
                    </td>
                    <td className="p-3">{o.plan} · {o.channel}</td>
                    <td className="p-3 font-mono text-[11px]">{o.email}<br/><span className="text-[#94A3B8]">{o.phone}</span></td>
                    <td className="p-3 font-mono text-amber-300">{o.trx_id || (o.has_screenshot ? 'Screenshot' : '-')}</td>
                    <td className="p-3">{o.email_status || '-'}</td>
                    <td className="p-3 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => inspectOrder(o.id)} className="px-2 py-1 bg-white/10 hover:bg-white/20 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                        <Eye className="w-3 h-3" /><span>Inspect</span>
                      </button>
                      {o.status !== 'verified' && (
                        <button type="button" onClick={() => handleOrderAction(o.id, 'approve')} className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 text-[11px] font-bold cursor-pointer">
                          Approve
                        </button>
                      )}
                      {o.status !== 'rejected' && o.status !== 'verified' && (
                        <button type="button" onClick={() => handleOrderAction(o.id, 'reject')} className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 text-[11px] font-bold cursor-pointer">
                          Reject
                        </button>
                      )}
                      {o.status === 'verified' && (
                        <button type="button" onClick={() => handleOrderAction(o.id, 'resend')} className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 text-[11px] font-bold cursor-pointer">
                          Resend Email
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-[#94A3B8]">No orders match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedOrderDetail && (
            <div className="p-5 rounded-xl bg-[#0B132B] border border-[#00D9FF]/45 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white">Order Detail · {selectedOrderDetail.public_id}</h3>
                <button type="button" onClick={() => setSelectedOrderDetail(null)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-[#94A3B8] hover:text-white cursor-pointer">Close</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5 font-mono">
                  <div>Email: <span className="text-white">{selectedOrderDetail.email}</span></div>
                  <div>Phone: <span className="text-white">{selectedOrderDetail.phone}</span></div>
                  <div>Reason: <span className="text-amber-300">{selectedOrderDetail.status_reason || 'None'}</span></div>
                  <div>Auto Activate At: <span className="text-cyan-300">{selectedOrderDetail.auto_activate_at || '-'}</span></div>
                  <div>Auto Activated At: <span className="text-emerald-300">{selectedOrderDetail.auto_activated_at || '-'}</span></div>
                  <div className="pt-2 space-y-2">
                    <input
                      type="text"
                      value={approveNote}
                      onChange={(e) => setApproveNote(e.target.value)}
                      placeholder="Approval note (optional)..."
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[#050816] border border-white/15 text-xs"
                    />
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Rejection reason..."
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[#050816] border border-white/15 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleOrderAction(selectedOrderDetail.id, 'approve')} className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-500/25 border border-emerald-400/50 text-emerald-200 font-bold cursor-pointer">
                        Approve Order
                      </button>
                      <button type="button" onClick={() => handleOrderAction(selectedOrderDetail.id, 'recheck')} className="min-h-[36px] px-3 py-1.5 rounded-lg bg-cyan-500/25 border border-cyan-400/50 text-cyan-200 font-bold cursor-pointer">
                        Re-run Verifier
                      </button>
                      <button type="button" onClick={() => handleOrderAction(selectedOrderDetail.id, 'reject')} className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-500/25 border border-rose-400/50 text-rose-200 font-bold cursor-pointer">
                        Reject Order
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  {screenshotUrl ? (
                    <img src={screenshotUrl} alt="Payment Screenshot Proof" className="max-h-72 rounded-xl border border-white/20 object-contain bg-black" />
                  ) : (
                    <div className="p-6 rounded-xl bg-[#050816] border border-white/10 text-[#94A3B8] text-center">No uploaded screenshot attached to this order.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LEDGER */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <form onSubmit={handleAddLedger} className="p-4 rounded-xl bg-[#0B132B] border border-white/10 grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end text-xs">
            <div>
              <label className="block text-[10px] text-[#94A3B8] mb-1">Channel</label>
              <select value={newLedger.channel} onChange={e => setNewLedger({ ...newLedger, channel: e.target.value, currency: ['bkash', 'nagad'].includes(e.target.value) ? 'BDT' : 'USD' })} className="w-full min-h-[38px] p-2 rounded-lg bg-[#050816] border border-white/15">
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="binance">Binance</option>
                <option value="skrill">Skrill</option>
                <option value="payoneer">Payoneer</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[#94A3B8] mb-1">TrxID / Ref</label>
              <input required type="text" value={newLedger.trxId} onChange={e => setNewLedger({ ...newLedger, trxId: e.target.value })} placeholder="TXN123..." className="w-full min-h-[38px] p-2 rounded-lg bg-[#050816] border border-white/15 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] text-[#94A3B8] mb-1">Amount</label>
              <input required type="number" step="0.01" value={newLedger.amount} onChange={e => setNewLedger({ ...newLedger, amount: e.target.value })} placeholder="110" className="w-full min-h-[38px] p-2 rounded-lg bg-[#050816] border border-white/15 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] text-[#94A3B8] mb-1">Currency</label>
              <select value={newLedger.currency} onChange={e => setNewLedger({ ...newLedger, currency: e.target.value })} className="w-full min-h-[38px] p-2 rounded-lg bg-[#050816] border border-white/15">
                <option value="BDT">BDT</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[#94A3B8] mb-1">Sender</label>
              <input type="text" value={newLedger.sender} onChange={e => setNewLedger({ ...newLedger, sender: e.target.value })} placeholder="017... / email" className="w-full min-h-[38px] p-2 rounded-lg bg-[#050816] border border-white/15" />
            </div>
            <button type="submit" className="min-h-[38px] rounded-lg btn-premium-primary text-white font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5 shrink-0" /><span>Add Payment</span>
            </button>
          </form>

          <div className="flex gap-2">
            <button type="button" onClick={() => setLedgerFilter('all')} className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${ledgerFilter === 'all' ? 'bg-[#00D9FF]/20 border-[#00D9FF]' : 'bg-[#0B132B] border-white/10'}`}>All</button>
            <button type="button" onClick={() => setLedgerFilter('unclaimed')} className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${ledgerFilter === 'unclaimed' ? 'bg-[#00D9FF]/20 border-[#00D9FF]' : 'bg-[#0B132B] border-white/10'}`}>Unclaimed Only</button>
          </div>

          <div className="overflow-x-auto bg-[#0B132B] border border-white/10 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#050816] border-b border-white/10 text-[#94A3B8] uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-3">Channel</th>
                  <th className="p-3">TrxID</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Sender</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Claimed By Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono tabular-nums">
                {ledgerRows.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 uppercase">{l.channel}</td>
                    <td className="p-3 text-amber-300">{l.trx_id}</td>
                    <td className="p-3">{(l.amount_minor / 100).toFixed(2)} {l.currency}</td>
                    <td className="p-3">{l.sender || '-'}</td>
                    <td className="p-3">{l.source}</td>
                    <td className="p-3">{l.claimed_by_order ? `Order #${l.claimed_by_order}` : <span className="text-emerald-400">Unclaimed</span>}</td>
                  </tr>
                ))}
                {ledgerRows.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-[#94A3B8]">No ledger records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CODES POOL */}
      {activeTab === 'codes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end justify-between p-4 rounded-xl bg-[#0B132B] border border-white/10 text-xs">
            <form onSubmit={handleGenerateCodes} className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-[10px] text-[#94A3B8] mb-1">Plan</label>
                <select value={genPlan} onChange={e => setGenPlan(e.target.value as any)} className="min-h-[38px] p-2 rounded-lg bg-[#050816] border border-white/15">
                  <option value="1m">1 Month (1m)</option>
                  <option value="2m">2 Months (2m)</option>
                  <option value="6m">6 Months (6m)</option>
                  <option value="12m">12 Months (12m)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[#94A3B8] mb-1">Count</label>
                <input type="number" min={1} max={5000} value={genCount} onChange={e => setGenCount(Number(e.target.value))} className="w-24 min-h-[38px] p-2 rounded-lg bg-[#050816] border border-white/15 font-mono" />
              </div>
              <button type="submit" className="min-h-[38px] px-4 rounded-lg btn-premium-primary text-white font-black uppercase tracking-wider cursor-pointer">
                Generate Codes
              </button>
            </form>

            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-[#94A3B8]" />
                <input
                  type="text"
                  value={codeSearchQuery}
                  onChange={e => setCodeSearchQuery(e.target.value)}
                  placeholder="Search code or email..."
                  className="min-h-[38px] pl-8 pr-3 py-1.5 rounded-lg bg-[#050816] border border-white/15 text-xs"
                />
              </div>
              <select value={codeStatusFilter} onChange={e => setCodeStatusFilter(e.target.value)} className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#050816] border border-white/15">
                <option value="">All Status</option>
                <option value="available">Available</option>
                <option value="issued">Issued</option>
                <option value="redeemed">Redeemed</option>
                <option value="revoked">Revoked</option>
              </select>
              <select value={codePlanFilter} onChange={e => setCodePlanFilter(e.target.value)} className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#050816] border border-white/15">
                <option value="">All Plans</option>
                <option value="1m">1m</option>
                <option value="2m">2m</option>
                <option value="6m">6m</option>
                <option value="12m">12m</option>
              </select>
              <button type="button" onClick={handleExportCodesCsv} className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 font-bold flex items-center gap-1 cursor-pointer">
                <Download className="w-3.5 h-3.5 shrink-0" /><span>CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto bg-[#0B132B] border border-white/10 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#050816] border-b border-white/10 text-[#94A3B8] uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Order / Email</th>
                  <th className="p-3">Device Lock</th>
                  <th className="p-3">Expires</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {codesRows.map((c) => (
                  <tr key={c.code}>
                    <td className="p-3 font-black text-emerald-300">{c.code}</td>
                    <td className="p-3 uppercase">{c.plan}</td>
                    <td className="p-3 uppercase">{c.status}</td>
                    <td className="p-3 text-[11px]">{c.order_id || '-'} {c.order_email ? `(${c.order_email})` : ''}</td>
                    <td className="p-3 text-[11px]">{c.device_id ? `${c.device_id.slice(0, 12)}...` : 'Unlocked'}</td>
                    <td className="p-3 text-[11px]">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '-'}</td>
                    <td className="p-3 flex gap-1.5">
                      <button type="button" onClick={() => handleCodeAction(c.code, 'reset-device')} className="min-h-[32px] px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 font-bold flex items-center gap-1 cursor-pointer">
                        <RotateCcw className="w-3 h-3 shrink-0" /><span>Reset Device</span>
                      </button>
                      {c.status !== 'revoked' && (
                        <button type="button" onClick={() => handleCodeAction(c.code, 'revoke')} className="min-h-[32px] px-2.5 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 font-bold flex items-center gap-1 cursor-pointer">
                          <Ban className="w-3 h-3 shrink-0" /><span>Revoke</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: OUTBOX */}
      {activeTab === 'outbox' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#0B132B] border border-white/10">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-white uppercase tracking-wider">Mail Transport Status</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase border ${
                    mailHealth?.mode === 'smtp' && mailHealth?.smtpConfigured
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                      : 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                  }`}
                >
                  {mailHealth?.mode === 'smtp' && mailHealth?.smtpConfigured ? 'SMTP LIVE' : `MODE: ${String(mailHealth?.mode || 'console').toUpperCase()}`}
                </span>
              </div>
              <p className="text-[11px] text-[#C9D1E0]">
                {mailHealth?.smtpConfigured
                  ? `Host: ${mailHealth.host}:${mailHealth.port} · User: ${mailHealth.user || '-'} · From: ${mailHealth.from}`
                  : 'Set MAIL_TRANSPORT="smtp" and a real Gmail App Password in SMTP_PASS (.env) for automatic SMTP delivery, or flush via Gmail API below.'}
              </p>
              {mailHealth?.lastVerifyError && (
                <p className="text-[11px] font-mono text-rose-300">Last SMTP check: {mailHealth.lastVerifyError}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={mailBusy}
                onClick={() => handleVerifySmtp(false)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verify SMTP</span>
              </button>
              <button
                type="button"
                disabled={mailBusy}
                onClick={() => handleVerifySmtp(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5 text-emerald-300" />
                <span>Send Test Email</span>
              </button>
              <button
                type="button"
                disabled={mailBusy}
                onClick={handleFlushSmtpOutbox}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${mailBusy ? 'animate-spin' : ''}`} />
                <span>Retry Failed &amp; Flush</span>
              </button>
              <button
                type="button"
                disabled={wsBusy}
                onClick={requestFlushOutboxViaGmail}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 border border-[#38BDF8]/50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>Send via Gmail API</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto bg-[#0B132B] border border-white/10 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#050816] border-b border-white/10 text-[#94A3B8] uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Recipient</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Attempts / Error</th>
                  <th className="p-3">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {outboxRows.map((m) => (
                  <tr key={m.id}>
                    <td className="p-3 font-mono tabular-nums">#{m.id}</td>
                    <td className="p-3 font-mono">{m.to_email}</td>
                    <td className="p-3">{m.subject}</td>
                    <td className="p-3 uppercase font-bold">
                      <span className={m.status === 'sent' ? 'text-emerald-400' : m.status === 'failed' ? 'text-rose-400' : 'text-amber-300'}>{m.status}</span>
                    </td>
                    <td className="p-3 text-[11px] font-mono">{m.attempts} {m.last_error ? `· ${m.last_error}` : ''}</td>
                    <td className="p-3 font-mono text-[11px]">{m.sent_at ? new Date(m.sent_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
                {outboxRows.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-[#94A3B8]">Email outbox is empty.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5B: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="overflow-x-auto bg-[#0B132B] border border-white/10 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#050816] border-b border-white/10 text-[#94A3B8] uppercase font-mono text-[10px]">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Action</th>
                <th className="p-3">Order</th>
                <th className="p-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              {auditRows.map((a) => (
                <tr key={a.id}>
                  <td className="p-3 whitespace-nowrap text-[#94A3B8]">{a.at ? new Date(a.at).toLocaleString() : '-'}</td>
                  <td className="p-3 text-cyan-300">{a.actor}</td>
                  <td className="p-3 text-white font-bold">{a.action}</td>
                  <td className="p-3">{a.order_id ? `#${a.order_id}` : '-'}</td>
                  <td className="p-3 text-[#C9D1E0] break-all">{a.detail || '-'}</td>
                </tr>
              ))}
              {auditRows.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-[#94A3B8]">No audit entries recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: M3U DOCTOR & LIVE CHECKER */}
      {activeTab === 'doctor' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#0B132B] border border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <div className="font-black text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <span>
                  Live-Only Pipeline · {checkerStatus ? `${checkerStatus.percentChecked}% Checked` : 'Initializing'}
                  {checkerStatus?.running ? ' · PROBING' : ''} · M3U Doctor {doctorStatus?.running ? `(${doctorStatus.currentMode})` : 'READY'}
                </span>
              </div>
              <div className="text-[#94A3B8] font-mono tabular-nums">
                Live: {checkerStatus?.live ?? doctorStatus?.totals?.alive ?? 0} · Dead Hidden: {checkerStatus?.dead ?? doctorStatus?.totals?.removed ?? 0} · Waiting: {checkerStatus?.waiting ?? doctorStatus?.totals?.pending ?? 0} · Total: {checkerStatus?.total ?? 0}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={checkerBusy}
                onClick={handleRunLiveChecker}
                className="min-h-[38px] px-4 py-2 rounded-lg btn-premium-primary text-white text-xs font-black uppercase cursor-pointer disabled:opacity-60"
              >
                {checkerBusy ? 'Checking...' : 'Sync & Check 500'}
              </button>
              <button type="button" onClick={() => handleDoctorRun('full')} className="min-h-[38px] px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold cursor-pointer">
                Doctor Full Scan
              </button>
              <button type="button" onClick={() => handleDoctorRun('retry')} className="min-h-[38px] px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold cursor-pointer">
                Retry Dead Mirrors
              </button>
            </div>
          </div>

          {/* Per-Playlist Health Breakdown */}
          <div className="bg-[#0B132B] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#050816] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-black uppercase tracking-wider text-white">Per-Playlist Live/Dead Breakdown</span>
              <span className="text-[#94A3B8] font-mono">{checkerSources.length} sources tracked</span>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#050816] border-b border-white/10 text-[#94A3B8] uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-2.5">Playlist Source</th>
                    <th className="p-2.5 text-right">Total</th>
                    <th className="p-2.5 text-right">Live</th>
                    <th className="p-2.5 text-right">Dead</th>
                    <th className="p-2.5 text-right">Waiting</th>
                    <th className="p-2.5 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {checkerSources.map((src) => (
                    <tr key={src.source} className={deadSourceFilter === src.source ? 'bg-[#00D9FF]/10' : ''}>
                      <td className="p-2.5 font-sans text-white truncate max-w-[260px]" title={src.source}>{src.source}</td>
                      <td className="p-2.5 text-right tabular-nums">{src.total}</td>
                      <td className="p-2.5 text-right tabular-nums text-emerald-400 font-bold">{src.live}</td>
                      <td className="p-2.5 text-right tabular-nums text-rose-400 font-bold">{src.dead}</td>
                      <td className="p-2.5 text-right tabular-nums text-amber-300">{src.waiting}</td>
                      <td className="p-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setDeadSourceFilter(deadSourceFilter === src.source ? '' : src.source)}
                          className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-sans font-bold text-white cursor-pointer"
                        >
                          {deadSourceFilter === src.source ? 'Show All' : 'View Dead'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {checkerSources.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-[#94A3B8]">No playlist sources synced yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dead Channels Inspector */}
          <div className="bg-[#0B132B] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#050816] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black uppercase tracking-wider text-white">Hidden Dead Channels ({checkerDead.length})</span>
                {deadSourceFilter && (
                  <button
                    type="button"
                    onClick={() => setDeadSourceFilter('')}
                    className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 text-[10px] font-mono cursor-pointer"
                  >
                    Filter: {deadSourceFilter.slice(0, 24)} ×
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleExportDeadCsv}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0" /><span>Export dead.csv</span>
              </button>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#050816] border-b border-white/10 text-[#94A3B8] uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-2.5">Channel</th>
                    <th className="p-2.5">Group</th>
                    <th className="p-2.5">Failure Reason</th>
                    <th className="p-2.5">Playlist</th>
                    <th className="p-2.5">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[11px]">
                  {checkerDead.map((d) => (
                    <tr key={d.id}>
                      <td className="p-2.5 font-bold text-white whitespace-nowrap">{d.name}</td>
                      <td className="p-2.5 text-[#94A3B8]">{d.group || '-'}</td>
                      <td className="p-2.5 font-mono text-rose-300">{d.reason || 'unknown'}</td>
                      <td className="p-2.5 text-[#C9D1E0] truncate max-w-[160px]" title={d.source}>{d.source}</td>
                      <td className="p-2.5 font-mono text-[10px] text-[#94A3B8] truncate max-w-[260px]" title={d.url}>{d.url}</td>
                    </tr>
                  ))}
                  {checkerDead.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-[#94A3B8]">No dead channels matched this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#050816] border border-white/10 font-mono text-[11px] max-h-64 overflow-y-auto space-y-1 text-[#C9D1E0]">
            {doctorLogs.length > 0 ? doctorLogs.map((line, i) => (
              <div key={i} className="border-b border-white/5 pb-0.5">{line}</div>
            )) : (
              <div className="text-[#94A3B8]">No M3U Doctor logs captured yet.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: MONETAG AD GATE CONTROLS */}
      {activeTab === 'ads' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#0B132B] border border-white/10 space-y-1">
              <span className="text-[10px] uppercase font-mono text-[#94A3B8]">Free-User Ad Views (30d)</span>
              <div className="text-2xl font-black text-sky-400 tabular-nums">
                {Number(adsReport?.totals?.views || 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-[#C9D1E0]">VIP users emit zero view events</div>
            </div>
            <div className="p-4 rounded-xl bg-[#0B132B] border border-white/10 space-y-1">
              <span className="text-[10px] uppercase font-mono text-[#94A3B8]">Monetag Ad Clicks (30d)</span>
              <div className="text-2xl font-black text-emerald-400 tabular-nums">
                {Number(adsReport?.totals?.clicks || 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-[#C9D1E0]">Actual earnings live in Monetag dashboard</div>
            </div>
            <div className="p-4 rounded-xl bg-[#0B132B] border border-white/10 space-y-1">
              <span className="text-[10px] uppercase font-mono text-[#94A3B8]">Gate Enforcement</span>
              <div className="text-xl font-black text-amber-300">VIP Strictly Ad-Free</div>
              <div className="text-[11px] text-[#C9D1E0]">
                Fail-closed gate · Monetag Only · Test Mode: {adsSettings.testMode ? 'ON' : 'OFF'}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#0B132B] border border-white/10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Free-Mode Monetag Ad Format Controls</h3>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Toggle individual Monetag ad formats for free visitors. Active VIP and 1-hour reward users never load any format.
                </p>
              </div>
              {adsBusy && <span className="text-xs font-mono text-sky-400">Saving...</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                { key: 'banner', label: 'Display Banners' },
                { key: 'sticky', label: 'Mobile Sticky Banner' },
                { key: 'popunder', label: 'Popunder / OnClick' },
                { key: 'interstitial', label: 'Interstitial Modals' },
                { key: 'push', label: 'Push Pre-Prompt' },
              ] as const).map((item) => {
                const enabled = Boolean(adsSettings.formats[item.key]);
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={adsBusy}
                    onClick={async () => {
                      try {
                        setAdsBusy(true);
                        const nextPayload = {
                          ...adsSettings,
                          formats: { ...adsSettings.formats, [item.key]: !enabled },
                        };
                        const r = await adminFetch('/api/admin/ads/config', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(nextPayload),
                        });
                        const j = await r.json();
                        if (j?.ok && j?.data) {
                          setAdsSettings(j.data);
                          showBanner('ok', `${item.label} ${!enabled ? 'enabled' : 'disabled'} for free mode.`);
                        }
                      } catch (err: any) {
                        showBanner('err', err?.message || 'Failed to update ad setting');
                      } finally {
                        setAdsBusy(false);
                      }
                    }}
                    className={`min-h-[44px] px-3.5 py-2.5 rounded-lg border text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      enabled
                        ? 'bg-emerald-500/15 border-emerald-400/45 text-white'
                        : 'bg-[#050816] border-white/10 text-[#94A3B8]'
                    }`}
                  >
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                      enabled ? 'bg-emerald-500/25 text-emerald-300' : 'bg-white/10 text-[#94A3B8]'
                    }`}>
                      {enabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                disabled={adsBusy}
                onClick={async () => {
                  try {
                    setAdsBusy(true);
                    const nextVal = !adsSettings.testMode;
                    const r = await adminFetch('/api/admin/ads/config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...adsSettings, testMode: nextVal }),
                    });
                    const j = await r.json();
                    if (j?.ok && j?.data) {
                      setAdsSettings(j.data);
                      showBanner('ok', `Ad Test Mode ${nextVal ? 'enabled (placeholders)' : 'disabled'}.`);
                    }
                  } catch (err: any) {
                    showBanner('err', err?.message || 'Failed to update testMode');
                  } finally {
                    setAdsBusy(false);
                  }
                }}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-lg border text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  adsSettings.testMode
                    ? 'bg-amber-500/15 border-amber-400/45 text-white'
                    : 'bg-[#050816] border-white/10 text-[#94A3B8]'
                }`}
              >
                <span className="text-xs font-bold">Preview Test Mode</span>
                <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                  adsSettings.testMode ? 'bg-amber-500/25 text-amber-300' : 'bg-white/10 text-[#94A3B8]'
                }`}>
                  {adsSettings.testMode ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          <div className="bg-[#0B132B] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#050816] border-b border-white/10 text-xs font-black uppercase tracking-wider text-white">
              Views &amp; Clicks by Monetag Zone (Last 30 Days)
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#050816] border-b border-white/10 text-[#94A3B8] uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-2.5">Monetag Zone ID</th>
                    <th className="p-2.5">Network</th>
                    <th className="p-2.5 text-right">Views</th>
                    <th className="p-2.5 text-right">Clicks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {(adsReport?.byZone || []).map((row: any, i: number) => (
                    <tr key={`${row.zoneId}-${i}`}>
                      <td className="p-2.5 text-white font-bold">{row.zoneId}</td>
                      <td className="p-2.5 text-[#C9D1E0]">{row.network}</td>
                      <td className="p-2.5 text-right tabular-nums text-sky-300">{Number(row.views || 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right tabular-nums text-emerald-400 font-bold">{Number(row.clicks || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                  {(!adsReport?.byZone || adsReport.byZone.length === 0) && (
                    <tr><td colSpan={4} className="p-4 text-center text-[#94A3B8]">No ad view or click events recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 1-Hour Free VIP Rewards Policy & Telemetry */}
          <div className="p-5 rounded-xl bg-[#0B132B] border border-white/10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Rewarded 1-Hour VIP Controls &amp; Network Policy
                </h3>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Monetag defaults to rewarded-only (showRegularAds OFF) and remains completely hidden for VIP and active 1-hour reward users.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[#050816] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-[#94A3B8]">Reward Starts</div>
                <div className="text-xl font-black text-white tabular-nums mt-0.5">
                  {Number(rewardsReport?.totals?.starts ?? rewardsReport?.starts ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#050816] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-[#94A3B8]">Reward Claims</div>
                <div className="text-xl font-black text-emerald-400 tabular-nums mt-0.5">
                  {Number(rewardsReport?.totals?.claims ?? rewardsReport?.claims ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#050816] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-[#94A3B8]">Claim Rate</div>
                <div className="text-xl font-black text-sky-400 tabular-nums mt-0.5">
                  {Number(rewardsReport?.totals?.claimRatePercent ?? rewardsReport?.claimRatePct ?? 0)}%
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#050816] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-[#94A3B8]">Active 1h Grants</div>
                <div className="text-xl font-black text-amber-300 tabular-nums mt-0.5">
                  {Number(rewardsReport?.totals?.activeGrantsNow ?? rewardsReport?.activeGrants ?? 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Monetag Controls */}
              <div className="p-4 rounded-xl bg-[#050816] border border-white/10 space-y-3">
                <div className="text-xs font-black text-white uppercase tracking-wider">Monetag Policy</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={adsBusy}
                    onClick={async () => {
                      try {
                        setAdsBusy(true);
                        const nextVal = !Boolean(adsSettings.monetag?.rewarded?.enabled);
                        const r = await adminFetch('/api/admin/rewards/toggle', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ network: 'monetag', enabled: nextVal }),
                        });
                        const j = await r.json();
                        if (!r.ok) throw new Error(j?.error?.message || 'Toggle failed');
                        const nextSettings = j?.data?.settings || j?.data;
                        if (nextSettings?.monetag) {
                          setAdsSettings(nextSettings);
                          setRewardedShowFnInput(String(nextSettings.monetag?.rewarded?.showFn || ''));
                        }
                        showBanner('ok', `Monetag rewarded ${nextVal ? 'enabled' : 'disabled'}.`);
                      } catch (err: any) {
                        showBanner('err', err?.message || 'Failed to toggle Monetag');
                      } finally {
                        setAdsBusy(false);
                      }
                    }}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                      adsSettings.monetag?.rewarded?.enabled
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                        : 'bg-white/5 border-white/15 text-[#C9D1E0]'
                    }`}
                  >
                    Rewarded: {adsSettings.monetag?.rewarded?.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    disabled={adsBusy}
                    onClick={async () => {
                      try {
                        setAdsBusy(true);
                        const nextVal = !Boolean(adsSettings.monetag?.showRegularAds);
                        const r = await adminFetch('/api/admin/ads/config', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            ...adsSettings,
                            monetag: { ...adsSettings.monetag, showRegularAds: nextVal },
                          }),
                        });
                        const j = await r.json();
                        if (!r.ok) throw new Error(j?.error?.message || 'Update failed');
                        if (j?.data) setAdsSettings(j.data);
                        showBanner('ok', `Monetag showRegularAds ${nextVal ? 'ON' : 'OFF'}.`);
                      } catch (err: any) {
                        showBanner('err', err?.message || 'Failed to update Monetag');
                      } finally {
                        setAdsBusy(false);
                      }
                    }}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                      adsSettings.monetag?.showRegularAds
                        ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                        : 'bg-white/5 border-white/15 text-[#C9D1E0]'
                    }`}
                  >
                    showRegularAds: {adsSettings.monetag?.showRegularAds ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <label className="block text-[11px] font-bold text-[#C9D1E0]">
                    Monetag Rewarded Global Function Name <span className="text-[#94A3B8] font-normal">(optional, e.g. window function)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={rewardedShowFnInput}
                      onChange={(e) => setRewardedShowFnInput(e.target.value)}
                      placeholder="e.g. show_11226634"
                      className="flex-1 min-w-[180px] min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B132B] border border-white/15 focus:border-[#00D9FF] text-xs font-mono text-white placeholder-[#64748B] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={adsBusy}
                      onClick={async () => {
                        try {
                          setAdsBusy(true);
                          const cleaned = rewardedShowFnInput.trim();
                          const r = await adminFetch('/api/admin/rewards/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              network: 'monetag',
                              showFn: cleaned || null,
                            }),
                          });
                          const j = await r.json();
                          if (!r.ok) throw new Error(j?.error?.message || 'Failed to save showFn');
                          const nextSettings = j?.data?.settings || j?.data;
                          if (nextSettings?.monetag) {
                            setAdsSettings(nextSettings);
                            setRewardedShowFnInput(String(nextSettings.monetag?.rewarded?.showFn || ''));
                          }
                          showBanner('ok', cleaned ? `Monetag rewarded showFn saved (${cleaned}).` : 'Monetag rewarded showFn cleared.');
                        } catch (err: any) {
                          showBanner('err', err?.message || 'Invalid Monetag rewarded function identifier');
                        } finally {
                          setAdsBusy(false);
                        }
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#00D9FF]/20 hover:bg-[#00D9FF]/30 border border-[#00D9FF]/45 text-xs font-bold text-[#00D9FF] cursor-pointer disabled:opacity-60"
                    >
                      Save
                    </button>
                    {adsSettings.monetag?.rewarded?.showFn && (
                      <button
                        type="button"
                        disabled={adsBusy}
                        onClick={async () => {
                          try {
                            setAdsBusy(true);
                            const r = await adminFetch('/api/admin/rewards/toggle', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ network: 'monetag', showFn: null }),
                            });
                            const j = await r.json();
                            if (!r.ok) throw new Error(j?.error?.message || 'Failed to clear showFn');
                            const nextSettings = j?.data?.settings || j?.data;
                            if (nextSettings?.monetag) {
                              setAdsSettings(nextSettings);
                              setRewardedShowFnInput('');
                            }
                            showBanner('ok', 'Monetag rewarded showFn cleared.');
                          } catch (err: any) {
                            showBanner('err', err?.message || 'Failed to clear showFn');
                          } finally {
                            setAdsBusy(false);
                          }
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold text-[#C9D1E0] cursor-pointer disabled:opacity-60"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Per-Day & Suspicious Devices */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#050816] border border-white/10 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 border-b border-white/10 text-[11px] font-black uppercase text-white">
                  Grants Per Day &amp; Network (Counts Only)
                </div>
                <table className="w-full text-left text-xs font-mono">
                  <thead className="text-[#94A3B8] text-[10px] border-b border-white/10">
                    <tr>
                      <th className="p-2">Day</th>
                      <th className="p-2">Network</th>
                      <th className="p-2 text-right">Grants</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[11px]">
                    {(rewardsReport?.grantsPerDay || []).map((g: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-2 text-white">{g.day}</td>
                        <td className="p-2 text-sky-300">{g.network}</td>
                        <td className="p-2 text-right text-emerald-400 font-bold">{g.grants}</td>
                      </tr>
                    ))}
                    {(!rewardsReport?.grantsPerDay || rewardsReport.grantsPerDay.length === 0) && (
                      <tr><td colSpan={3} className="p-3 text-center text-[#94A3B8]">No grants recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-[#050816] border border-white/10 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 border-b border-white/10 text-[11px] font-black uppercase text-white">
                  Suspicious Devices (Abuse Monitor)
                </div>
                <table className="w-full text-left text-xs font-mono">
                  <thead className="text-[#94A3B8] text-[10px] border-b border-white/10">
                    <tr>
                      <th className="p-2">Device Hash</th>
                      <th className="p-2 text-right">Grants</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[11px]">
                    {(rewardsReport?.suspiciousDevices || []).map((d: any) => (
                      <tr key={d.deviceHash}>
                        <td className="p-2 text-amber-300">{String(d.deviceHash).slice(0, 14)}...</td>
                        <td className="p-2 text-right text-rose-400 font-bold">{d.grants}</td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const r = await adminFetch('/api/admin/rewards/revoke', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ deviceHash: d.deviceHash }),
                                });
                                if (r.ok) {
                                  showBanner('ok', `Revoked active reward grants for ${String(d.deviceHash).slice(0, 12)}...`);
                                  loadAllDashboardData();
                                }
                              } catch (err: any) {
                                showBanner('err', err?.message || 'Revoke failed');
                              }
                            }}
                            className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 text-[10px] font-bold cursor-pointer"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!rewardsReport?.suspiciousDevices || rewardsReport.suspiciousDevices.length === 0) && (
                      <tr><td colSpan={3} className="p-3 text-center text-[#94A3B8]">No suspicious devices flagged.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Backend Google Drive / Gmail Mutations */}
      {wsConfirm && (
        <div className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141821] border border-[#38BDF8]/40 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black text-white">{wsConfirm.title}</h3>
              <button
                type="button"
                onClick={() => !wsBusy && setWsConfirm(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#C9D1E0] leading-relaxed">{wsConfirm.description}</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={wsBusy}
                onClick={() => setWsConfirm(null)}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold text-[#C9D1E0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={wsBusy}
                onClick={async () => {
                  try {
                    setWsBusy(true);
                    await wsConfirm.onConfirm();
                    setWsConfirm(null);
                  } catch (e: any) {
                    showBanner('err', e?.message || 'Workspace backend action failed');
                  } finally {
                    setWsBusy(false);
                  }
                }}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#050816] text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-60"
              >
                {wsBusy ? 'Processing...' : wsConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
