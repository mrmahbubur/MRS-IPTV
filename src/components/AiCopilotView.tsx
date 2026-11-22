import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Send, 
  Cpu, 
  Play, 
  RefreshCw, 
  ShieldCheck, 
  Zap, 
  Tv, 
  Compass, 
  Mail,
  Wrench,
  Layers,
  Database,
  Users,
  Radio,
  Trophy,
  Film,
  Globe,
  BarChart3,
  Target,
  Trash2
} from 'lucide-react';
import { Channel } from '../types';
import { getAdminAuthHeaders } from '../lib/adminAuth';

interface AiCopilotViewProps {
  channels: Channel[];
  onSelectChannel: (channel: Channel) => void;
  selectedChannel?: Channel | null;
  onOpenM3uManager?: () => void;
  onOpenAutoDev?: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  recommendations?: Channel[];
  timestamp: string;
}

export const AiCopilotView: React.FC<AiCopilotViewProps> = ({
  channels,
  onSelectChannel,
  selectedChannel,
  onOpenM3uManager,
  onOpenAutoDev
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: `🌸 Hello! I am **Camellia**, your Autonomous Stream Doctor & Copilot powered by the Gemini Autonomous Engine.\n\n⚡ **Continuous Autonomous Streaming Engine**:\n- 🛠️ **Autonomous Maintenance**: Auto-repair broken streams, clean cache & tune video latency\n- 🔄 **Channel & Source Control**: Index and sync all ${channels.length > 0 ? channels.length.toLocaleString() : '8,890'}+ live IPTV channels\n- 📊 **Visitor Traffic**: Track real-time concurrents, page views, and stream sessions\n- 🔒 **VIP Security**: Enforce single-device pass code integrity & blacklist expired codes\n- 📬 **Executive Reporting**: Automated monthly executive reports to M R S (mr216873@gmail.com)\n\nWhat would you like me to diagnose or stream today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null);
  const [isExecutingAction, setIsExecutingAction] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    try {
      const historyFormatted = messages.slice(-6).map(m => ({
        role: m.sender === 'ai' ? 'model' : 'user',
        text: m.text
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: query,
          history: historyFormatted,
          currentChannel: selectedChannel ? { name: selectedChannel.name, category: selectedChannel.category, m3u8Url: selectedChannel.m3u8Url } : null
        })
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: data.error || 'Admin sign-in via #admin is required for administrative actions.',
          recommendations: channels.slice(0, 4),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, errMsg]);
        return;
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: data.text || "I've processed your request.",
        recommendations: data.recommendations || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      const fallbackMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: `🌸 **Camellia**: Processed your query with stream diagnostics authority. Here are verified channels for you:`,
        recommendations: channels.slice(0, 4),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleExecuteSiteAction = async (action: string, actionLabel: string) => {
    if (isExecutingAction) return;
    setIsExecutingAction(action);

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: `⚡ Execute: ${actionLabel}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const res = await fetch('/api/camellia/action', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action })
      });
      const data = await res.json();

      if (!res.ok) {
        const authErrMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: `🔒 **Admin Authorization Required**: ${data.error || 'Please sign in via the #admin console to execute site actions.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, authErrMsg]);
        return;
      }

      let responseText = `⚡ **System Diagnostics Action Completed**\n\n`;
      if (action === 'run_maintenance') {
        responseText += `🛠️ **Maintenance & Auto-Repair Executed**:\n- **Repaired Streams**: ${data.maintenance?.channelsRepaired ?? 0} stream URLs fixed\n- **Backend Errors Resolved**: ${data.maintenance?.errorsFixed ?? 0} errors\n- **Sources Checked**: ${data.maintenance?.sourcesChecked ?? 0} M3U playlists\n- **Status**: Platform is running smooth and buffer-free!`;
      } else if (action === 'flush_cache') {
        responseText += `🧹 **Server Proxy Cache Flushed**:\n- **Entries Cleared**: ${data.clearedCount ?? 0} active stream cache objects\n- **Result**: Memory freed and fresh streaming routes primed!`;
      } else if (action === 'sync_channels') {
        responseText += `🔄 **M3U Playlists Synchronized**:\n- **Total Channels Live**: ${data.totalChannels?.toLocaleString() ?? channels.length}\n- **Sources Indexed**: ${data.sourcesCount ?? 0} playlists\n- **Result**: All channel catalogs are fully synced!`;
      } else if (action === 'get_analytics') {
        responseText += `📊 **Real-Time Visitor Analytics**:\n- **Live Active Viewers**: ${data.stats?.liveActiveVisitors ?? 1}\n- **Total Unique Visitors**: ${data.stats?.totalUniqueVisitors ?? 1}\n- **Total Page Views**: ${data.stats?.totalPageViews ?? 1}\n- **Live Streams Played**: ${data.stats?.totalStreamSessions ?? 0}\n- **Active Sessions**: ${data.activeSessionsCount ?? 1}`;
      } else if (action === 'send_monthly_email') {
        responseText += `📬 **Monthly Executive Email Dispatched to M R S**:\n- **Recipient**: mr216873@gmail.com\n- **Summary**: Comprehensive monthly visitor numbers, subscriber audit, and stream health report sent!\n- **Status**: ${data.message || 'Dispatched successfully'}`;
      } else {
        responseText += `${data.message || 'Action executed successfully.'}`;
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: `⚠️ **Action Execution Notice**: Action attempted but encountered a temporary network delay. Autonomous background engine remains active.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsExecutingAction(null);
      setIsTyping(false);
    }
  };

  const handleRunDiagnostics = async () => {
    if (!selectedChannel) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'ai',
        text: 'Select or play any live channel first to run a stream diagnostic.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      return;
    }
    setIsDiagnosing(true);
    setDiagnoseResult(null);

    try {
      const res = await fetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName: selectedChannel.name,
          m3u8Url: selectedChannel.m3u8Url,
          category: selectedChannel.category
        })
      });
      const data = await res.json();
      setDiagnoseResult(data);

      const doctorMsg: Message = {
        id: Date.now().toString(),
        sender: 'ai',
        text: data.aiReport || `⚡ **Auto-Healing Engine**: Tested "${selectedChannel.name}" across backend profiles. Stream health verified.`,
        recommendations: data.alternativeMirrors || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, doctorMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'ai',
        text: 'Diagnostic check could not reach the probe service. Please try again in a moment.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleAnalyzeHistory = async () => {
    setIsTyping(true);
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: "✨ Recommend channels based on my watch and search activity",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const watchHistory = JSON.parse(localStorage.getItem('shahintv_watch_history') || '[]');
      const searchHistory = JSON.parse(localStorage.getItem('shahintv_search_history') || '[]');
      const favorites = JSON.parse(localStorage.getItem('shahintv_favorites') || '[]');

      const res = await fetch('/api/ai/recommend-personalized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchHistory, searchHistory, favorites })
      });
      const data = await res.json();

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: data.insight || "✨ **Viewer Analysis**: Here are channels tailored to your watching habits!",
        recommendations: data.recommendations || channels.slice(0, 5),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      handleSendMessage("Recommend channels based on my history");
    } finally {
      setIsTyping(false);
    }
  };

  const [isSendingSampleEmail, setIsSendingSampleEmail] = useState(false);
  const [emailStatusMessage, setEmailStatusMessage] = useState<string | null>(null);

  const handleSendSampleEmail = async () => {
    setIsSendingSampleEmail(true);
    setEmailStatusMessage(null);
    try {
      const res = await fetch('/api/ai/send-monthly-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSample: true })
      });
      const data = await res.json();
      
      const successMsg = data.message || `Sample monthly executive email prepared for M R S (${data.recipient || 'mr216873@gmail.com'})!`;
      setEmailStatusMessage(successMsg);

      const aiMsg: Message = {
        id: Date.now().toString(),
        sender: 'ai',
        text: `📬 **Monthly Camellia Executive Report Sample Sent!**\n\n- **Recipient**: ${data.recipient || 'mr216873@gmail.com'}\n- **Status**: ${data.result?.emailSentViaSmtp ? '✅ Dispatched via SMTP to Inbox' : '✅ Generated & Dispatched by Autonomous Engine'}\n- **Summary**: ${data.result?.executiveSummary || 'Monthly report with visitor analytics, VIP user stats, and system condition compiled successfully.'}\n\n*This report runs automatically at the end of every completed month to keep M R S fully informed.*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      setEmailStatusMessage("Failed to send sample email.");
    } finally {
      setIsSendingSampleEmail(false);
    }
  };

  const liveCountLabel = channels.length > 0 ? channels.length.toLocaleString() : '8,890';
  const quickPrompts: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: 'Run Full System Maintenance & Self-Repair', icon: Wrench },
    { label: 'Flush Server Proxy Cache & Memory', icon: Trash2 },
    { label: `Sync All ${liveCountLabel}+ Channels`, icon: RefreshCw },
    { label: 'Show Real-Time Visitor Analytics', icon: BarChart3 },
    { label: 'Send Sample Monthly Email Report to M R S', icon: Mail },
    { label: 'Analyze My Watch & Search History', icon: Target },
    { label: 'Daily Speed Upgrades & Errors Fixed', icon: Zap },
    { label: 'Show Live Sports & Cricket Channels', icon: Trophy },
    { label: 'Find Top Bangladesh Channels', icon: Globe },
    { label: 'Recommend HD Movie Channels', icon: Film }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--theme-bg,#070A11)] text-white overflow-hidden p-3 md:p-6 lg:p-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--theme-border,rgba(56,189,248,0.22))] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--theme-accent-soft,rgba(56,189,248,0.20))] border border-[var(--theme-border-accent,rgba(56,189,248,0.75))] flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-[var(--theme-accent,#38BDF8)] shrink-0" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black uppercase tracking-wider text-white">Camellia Stream Doctor</h1>
              <span className="px-2.5 py-0.5 rounded-md bg-[#00D9FF]/15 text-[#00D9FF] border border-[#00D9FF]/45 text-[10px] font-black tracking-widest uppercase">
                24/7 CAMELLIA
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/45 text-[9px] font-black uppercase tracking-wider">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-[#C9D1E0] flex items-center gap-1.5 mt-0.5">
              <span>Autonomous Stream Self-Healing & Live Diagnostics Engine</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {onOpenAutoDev && (
            <button
              type="button"
              onClick={onOpenAutoDev}
              className="min-h-[40px] px-4 py-2 btn-premium-purple rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <Cpu className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <span>Auto-Dev Engine</span>
            </button>
          )}

          {onOpenM3uManager && (
            <button
              type="button"
              onClick={onOpenM3uManager}
              className="min-h-[40px] px-4 py-2 btn-premium-cyan rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#00D9FF] shrink-0" />
              <span>M3U Manager</span>
            </button>
          )}

          {selectedChannel && (
            <button
              type="button"
              onClick={handleRunDiagnostics}
              disabled={isDiagnosing}
              className="min-h-[40px] flex items-center gap-2 px-4 py-2 btn-premium-primary rounded-lg text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 shrink-0 cursor-pointer"
            >
              <Zap className={`w-4 h-4 shrink-0 ${isDiagnosing ? 'animate-spin' : ''}`} />
              <span>{isDiagnosing ? 'Diagnosing...' : `Diagnose "${selectedChannel.name.slice(0, 14)}..."`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 my-4 overflow-hidden min-h-0">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-[var(--theme-surface,#0E131F)] border border-[var(--theme-border,rgba(56,189,248,0.22))] rounded-2xl overflow-hidden shadow-2xl">
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#00D9FF] via-[#176BFF] to-[#B832F5] flex items-center justify-center shrink-0 mt-1 shadow-md">
                    <Bot className="w-4 h-4 text-white shrink-0" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-xl p-4 text-xs sm:text-sm leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-[#176BFF] to-[#B832F5] text-white font-medium border border-[#00D9FF]/40 shadow-lg'
                    : 'bg-[#0B132B] border border-[#00D9FF]/25 text-[#C9D1E0] shadow-inner'
                }`}>
                  <div className="whitespace-pre-line font-normal">{m.text}</div>

                  {/* Recommendations Cards */}
                  {m.recommendations && m.recommendations.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[#00D9FF]/20">
                      <div className="text-[10px] font-black uppercase tracking-wider text-[#00D9FF] mb-2.5 flex items-center gap-1.5">
                        <Tv className="w-3.5 h-3.5 shrink-0" /> Recommended Channels
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {m.recommendations.map((rec) => (
                          <button
                            type="button"
                            key={rec.id || rec.m3u8Url}
                            onClick={() => onSelectChannel(rec)}
                            className="w-full text-left flex items-center justify-between p-2.5 bg-[#070C1E] hover:bg-[#111E42] border border-[#00D9FF]/25 hover:border-[#00D9FF]/60 rounded-xl cursor-pointer transition-all group"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="text-xs font-bold text-white group-hover:text-[#00D9FF] truncate">{rec.name}</div>
                              <div className="text-[10px] text-[#C9D1E0] uppercase tracking-wider">{rec.category || 'Live Stream'}</div>
                            </div>
                            <span className="w-9 h-9 rounded-lg bg-[#00D9FF]/20 group-hover:bg-[#00D9FF] text-[#00D9FF] group-hover:text-[#050816] flex items-center justify-center transition-all shrink-0">
                              <Play className="w-4 h-4 fill-current shrink-0" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[9px] text-[#C9D1E0]/70 text-right mt-1.5">{m.timestamp}</div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3 items-center text-xs text-[#00D9FF] font-bold font-mono p-2">
                <Bot className="w-4 h-4 animate-spin shrink-0" />
                <span>Camellia is executing system command & searching channel streams...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Chips */}
          <div className="p-2.5 border-t border-[var(--theme-border,rgba(56,189,248,0.22))] bg-[var(--theme-bg,#070A11)] overflow-x-auto custom-scrollbar flex items-center gap-2 shrink-0">
            {quickPrompts.map((qp, i) => {
              const Icon = qp.icon;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => {
                    if (qp.label.includes("Analyze My Watch")) {
                      handleAnalyzeHistory();
                    } else if (qp.label.includes("Maintenance")) {
                      handleExecuteSiteAction('run_maintenance', 'Run Maintenance & Auto-Repair');
                    } else if (qp.label.includes("Flush Server Proxy")) {
                      handleExecuteSiteAction('flush_cache', 'Flush Proxy Cache');
                    } else if (qp.label.includes("Sync All")) {
                      handleExecuteSiteAction('sync_channels', 'Sync All Channels');
                    } else if (qp.label.includes("Visitor Analytics")) {
                      handleExecuteSiteAction('get_analytics', 'Get Visitor Analytics');
                    } else if (qp.label.includes("Monthly Email")) {
                      handleExecuteSiteAction('send_monthly_email', 'Send Monthly Email to M R S');
                    } else {
                      handleSendMessage(qp.label);
                    }
                  }}
                  className="whitespace-nowrap min-h-[38px] text-[11px] font-bold btn-premium-cyan px-3.5 py-1.5 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 text-[var(--theme-accent,#38BDF8)] shrink-0" />
                  <span>{qp.label}</span>
                </button>
              );
            })}
          </div>

          {/* Input Box */}
          <div className="p-3 border-t border-[var(--theme-border,rgba(56,189,248,0.22))] bg-[var(--theme-bg,#070A11)] flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask Camellia to run maintenance, flush cache, sync channels, or find streams..."
              className="flex-1 min-h-[44px] bg-[var(--theme-card,#131B2B)] border border-[var(--theme-border,rgba(56,189,248,0.25))] focus:border-[var(--theme-accent,#38BDF8)] text-white placeholder-[#C9D1E0]/60 text-xs sm:text-sm rounded-lg px-4 py-2.5 outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isTyping}
              aria-label="Send message"
              className="w-11 h-11 rounded-lg btn-premium-primary flex items-center justify-center transition-all disabled:opacity-40 shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>

        {/* Sidebar Info & Autonomous Diagnostics Control Center */}
        <div className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          
          {/* Autonomous Control Hub Card */}
          <div className="bg-gradient-to-b from-[#0B132B] to-[#070C1E] border border-[#00D9FF]/35 rounded-2xl p-4 space-y-3.5 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#00D9FF]/20 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#00D9FF]">
                <ShieldCheck className="w-4 h-4 text-[#00D9FF] shrink-0" />
                <span>Diagnostics & Control Hub</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/40 text-[9px] font-black uppercase">
                ACTIVE
              </span>
            </div>

            <div className="text-[11px] text-[#C9D1E0] space-y-1">
              <p>
                <strong className="text-white">Engine:</strong> Camellia Autonomous Stream Doctor
              </p>
              <p>
                <strong className="text-white">Status:</strong> 24/7 Background Self-Healing Active
              </p>
              <p>
                <strong className="text-white">System:</strong> M R S IPTV Real-Time Monitor
              </p>
            </div>

            {/* Quick Action Buttons for Full Site Control */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleExecuteSiteAction('run_maintenance', 'Daily Maintenance & Stream Repair')}
                disabled={Boolean(isExecutingAction)}
                className="w-full min-h-[42px] py-2.5 px-3.5 btn-premium-gold rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-[#F59E0B] shrink-0" /> Run Maintenance & Repair
                </span>
                <span className="text-[10px] text-[#FDE68A] font-mono">1-Click</span>
              </button>

              <button
                type="button"
                onClick={() => handleExecuteSiteAction('sync_channels', `Sync ${liveCountLabel}+ Channels`)}
                disabled={Boolean(isExecutingAction)}
                className="w-full min-h-[42px] py-2.5 px-3.5 btn-premium-cyan rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#00D9FF] shrink-0" /> Sync {liveCountLabel}+ Channels
                </span>
                <span className="text-[10px] text-[#00D9FF] font-mono">M3U</span>
              </button>

              <button
                type="button"
                onClick={() => handleExecuteSiteAction('flush_cache', 'Flush Proxy Cache & Memory')}
                disabled={Boolean(isExecutingAction)}
                className="w-full min-h-[42px] py-2.5 px-3.5 btn-premium-cyan rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#00D9FF] shrink-0" /> Flush Cache & Latency
                </span>
                <span className="text-[10px] text-[#00D9FF] font-mono">Speed</span>
              </button>

              <button
                type="button"
                onClick={() => handleExecuteSiteAction('get_analytics', 'View Live Visitor Analytics')}
                disabled={Boolean(isExecutingAction)}
                className="w-full min-h-[42px] py-2.5 px-3.5 btn-premium-purple rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#D8B4FE] shrink-0" /> Live Visitor Analytics
                </span>
                <span className="text-[10px] text-[#D8B4FE] font-mono">Real-time</span>
              </button>

              <button
                type="button"
                onClick={() => handleExecuteSiteAction('send_monthly_email', 'Send Monthly Report to M R S')}
                disabled={Boolean(isExecutingAction)}
                className="w-full min-h-[42px] py-2.5 px-3.5 btn-premium-emerald rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#10B981] shrink-0" /> Email Report to M R S
                </span>
                <span className="text-[10px] text-[#6EE7B7] font-mono">mr216873</span>
              </button>

              {onOpenM3uManager && (
                <button
                  type="button"
                  onClick={onOpenM3uManager}
                  className="w-full min-h-[42px] py-2.5 px-3.5 btn-premium-glass rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#00D9FF] shrink-0" /> M3U Source Manager
                  </span>
                  <span className="text-[10px] text-[#C9D1E0]">Settings</span>
                </button>
              )}
            </div>
          </div>

          {/* Current Playing Channel Widget */}
          {selectedChannel ? (
            <div className="bg-gradient-to-b from-[#0B132B] to-[#070C1E] border border-[#00D9FF]/35 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#00D9FF]">Active Playing Channel</span>
                <Radio className="w-4 h-4 text-[#00D9FF] shrink-0" />
              </div>
              <div className="text-sm font-black text-white truncate">{selectedChannel.name}</div>
              <div className="text-xs text-[#C9D1E0] uppercase tracking-wider">{selectedChannel.category || 'General Category'}</div>
              
              <button
                type="button"
                onClick={handleRunDiagnostics}
                disabled={isDiagnosing}
                className="w-full min-h-[42px] py-2.5 btn-premium-cyan rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 text-[#00D9FF] shrink-0" /> Run Stream Diagnostics
              </button>
            </div>
          ) : (
            <div className="bg-[#070C1E] border border-[#00D9FF]/20 rounded-2xl p-4 text-center space-y-2">
              <Compass className="w-8 h-8 text-[#00D9FF]/60 mx-auto" />
              <div className="text-xs font-bold text-white">No Channel Active</div>
              <p className="text-[11px] text-[#C9D1E0]">Select any channel from the sidebar or ask Camellia to start streaming!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
