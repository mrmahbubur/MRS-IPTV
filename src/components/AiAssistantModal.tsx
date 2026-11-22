import React, { useState, useRef, useEffect } from 'react';
import {
  Bot, X, Send, Cpu, Tv, Zap, Play, CheckCircle2, Radio, AlertTriangle,
  Wrench, Trash2, RefreshCw, Mail, BarChart3, Film, Globe, Newspaper, Trophy, Smile
} from 'lucide-react';
import { Channel } from '../types';
import { getAdminAuthHeaders } from '../lib/adminAuth';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  onSelectChannel: (channel: Channel) => void;
  selectedChannel?: Channel | null;
  onOpenM3uManager?: () => void;
  onOpenAutoDev?: () => void;
}

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  recommendations?: Channel[];
  m3uBatch?: {
    batchId: string;
    sourceName: string;
    totalFound: number;
    playingCount: number;
    notPlayingCount: number;
  };
  timestamp: string;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  channels,
  onSelectChannel,
  selectedChannel,
  onOpenM3uManager,
  onOpenAutoDev
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'ai',
      text: `🌸 Hi! I am **Camellia**, your Autonomous Stream Doctor & Copilot powered by the Gemini Autonomous Engine.\n\n⚡ **Continuous Autonomous Streaming Engine**:\n- 🛠️ Self-healing video streams & mirror failover\n- 🔄 Index and sync all ${channels.length > 0 ? channels.length.toLocaleString() : '8,890'}+ live channels\n- 🔍 Paste any M3U link to test and auto-detect working channels\n- 🧹 Auto-tune playback buffers and clear latency\n\nHow can I help your viewing experience today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (!isOpen) return null;

  const handleSendMessage = async (customQuery?: string) => {
    const query = customQuery || inputText;
    if (!query.trim() || isTyping) return;

    setMessages(prev => [...prev, {
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);

    if (!customQuery) setInputText('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: query,
          currentChannel: selectedChannel ? { name: selectedChannel.name, category: selectedChannel.category, m3u8Url: selectedChannel.m3u8Url } : null
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages(prev => [...prev, {
          sender: 'ai',
          text: `🔒 ${data.error || 'Admin sign-in via #admin is required for administrative actions.'}`,
          recommendations: channels.slice(0, 3),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      setMessages(prev => [...prev, {
        sender: 'ai',
        text: data.text || "I'm here to assist you with live streams!",
        recommendations: data.recommendations || [],
        m3uBatch: data.m3uBatch,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: "🌸 **Camellia**: I received your query. Here are top recommended channels for you:",
        recommendations: channels.slice(0, 3),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCommitBatch = async (batchId: string, mode: 'working_only' | 'all') => {
    setIsTyping(true);
    try {
      const res = await fetch('/api/m3u/commit-batch', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ batchId, mode })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessages(prev => [...prev, {
          sender: 'ai',
          text: `🎉 **Permission Granted & Confirmed!**\n\nSuccessfully added **${data.channelsAdded}** verified channels to M R S IPTV!\n\nAll imported channels are now live in the player and category browser. Total channels online: **${data.totalChannels}**.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      } else if (res.status === 401 || res.status === 403) {
        setMessages(prev => [...prev, {
          sender: 'ai',
          text: '🔒 **Admin Authorization Required**: Please sign in via `#admin` to commit imported M3U channels.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      } else {
        setMessages(prev => [...prev, {
          sender: 'ai',
          text: `⚠️ **Import Failed**: ${data.error || 'Could not import channels.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: `⚠️ **Import Error**: ${err?.message || 'Failed to connect to server.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCancelBatch = (batchId: string) => {
    setMessages(prev => [...prev, {
      sender: 'ai',
      text: `❌ **M3U Import Cancelled**: The channels were discarded. No changes were made to M R S IPTV.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  const handleDiagnose = async () => {
    if (!selectedChannel) {
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: 'Please start playing a channel first so I can run live stream diagnostics on it.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      return;
    }
    setIsDiagnosing(true);

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

      setMessages(prev => [...prev, {
        sender: 'ai',
        text: data.aiReport || `⚡ **Auto-Healing Engine**: Tested stream for "${selectedChannel.name}". Auto-switched to optimal ${data.recommendedProxyMode?.toUpperCase()} profile!`,
        recommendations: data.alternativeMirrors || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: 'Diagnostic check failed. Please try again in a moment.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsDiagnosing(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[92vw] max-w-[420px] h-[580px] max-h-[85vh] bg-[var(--theme-bg,#070A11)]/98 backdrop-blur-2xl border border-[var(--theme-border-accent,rgba(56,189,248,0.45))] rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.92)] flex flex-col overflow-hidden text-white animate-in slide-in-from-bottom-5">
      {/* Header */}
      <div className="p-4 bg-[var(--theme-surface,#0E131F)] border-b border-[var(--theme-border,rgba(56,189,248,0.28))] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--theme-accent-soft,rgba(56,189,248,0.20))] border border-[var(--theme-border-accent,rgba(56,189,248,0.55))] flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-[var(--theme-accent,#38BDF8)] shrink-0" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="text-xs font-black uppercase tracking-wider text-white truncate">Camellia Stream Doctor</div>
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--theme-accent-soft,rgba(56,189,248,0.20))] text-[var(--theme-accent,#38BDF8)] border border-[var(--theme-border,rgba(56,189,248,0.4))] text-[9px] font-black uppercase shrink-0">
                24/7 LIVE
              </span>
            </div>
            <span className="text-[10px] text-[#C9D1E0] font-medium block truncate">
              Autonomous Stream Diagnostics
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedChannel && (
            <button
              type="button"
              onClick={handleDiagnose}
              disabled={isDiagnosing}
              title="Run Stream Diagnostics"
              className="min-h-[38px] px-2.5 btn-premium-cyan rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
            >
              <Zap className={`w-3.5 h-3.5 text-[#00D9FF] shrink-0 ${isDiagnosing ? 'animate-spin' : ''}`} />
              <span>Fix</span>
            </button>
          )}
          {onOpenM3uManager && (
            <button
              type="button"
              onClick={onOpenM3uManager}
              title="M3U Source Manager"
              className="min-h-[38px] px-2.5 btn-premium-glass text-[#C9D1E0] hover:text-white rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              M3U
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-lg btn-premium-crimson flex items-center justify-center transition-all active:scale-95 group cursor-pointer"
            title="Close Camellia"
            aria-label="Close Camellia"
          >
            <X className="w-4 h-4 stroke-[2.5] transition-transform duration-200 group-hover:rotate-90" />
          </button>
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-[var(--theme-bg,#070A11)]">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex gap-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.sender === 'ai' && (
              <div className="w-7 h-7 rounded-lg bg-[#00D9FF]/15 text-[#00D9FF] border border-[#00D9FF]/40 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}
            <div className={`max-w-[88%] rounded-xl p-3 text-xs leading-relaxed ${
              m.sender === 'user'
                ? 'bg-gradient-to-r from-[#176BFF] to-[#B832F5] text-white border border-[#00D9FF]/40'
                : 'bg-[#0B132B] border border-[#00D9FF]/25 text-[#C9D1E0]'
            }`}>
              <div className="whitespace-pre-line">{m.text}</div>

              {m.recommendations && m.recommendations.length > 0 && (
                <div className="mt-3 pt-2 border-t border-[#00D9FF]/20 space-y-1.5">
                  <div className="text-[10px] font-bold text-[#00D9FF] uppercase tracking-wider flex items-center gap-1.5">
                    <Tv className="w-3.5 h-3.5 shrink-0" /> Suggested Streams
                  </div>
                  {m.recommendations.map(rec => (
                    <button
                      type="button"
                      key={rec.id || rec.m3u8Url}
                      onClick={() => {
                        onSelectChannel(rec);
                        onClose();
                      }}
                      className="w-full flex items-center justify-between min-h-[40px] px-3 py-2 bg-[#070C1E] hover:bg-[#111E42] border border-[#00D9FF]/25 hover:border-[#00D9FF]/60 rounded-lg cursor-pointer transition-all text-left"
                    >
                      <span className="truncate pr-2 font-bold text-[11px] text-white">{rec.name}</span>
                      <Play className="w-3.5 h-3.5 text-[#00D9FF] fill-current shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* M3U Batch Staging & Permission Action Controls */}
              {m.m3uBatch && (
                <div className="mt-3 pt-2.5 border-t border-[#00D9FF]/30 space-y-2 bg-[#070C1E]/80 p-3 rounded-xl border">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-[#F59E0B] flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      Site Inclusion Permission
                    </span>
                    <span className="text-[10px] text-[#00D9FF] font-mono tabular-nums">
                      {m.m3uBatch.playingCount}/{m.m3uBatch.totalFound} Playing
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => handleCommitBatch(m.m3uBatch!.batchId, 'working_only')}
                      className="w-full text-left min-h-[42px] px-3 py-2 bg-[#10B981]/20 hover:bg-[#10B981]/30 border border-[#10B981]/50 text-white font-extrabold text-[11px] rounded-lg transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                        <span>Include Working Only ({m.m3uBatch.playingCount} Channels)</span>
                      </span>
                      <span className="text-[9px] bg-[#10B981]/30 text-[#6EE7B7] px-2 py-0.5 rounded-md font-bold uppercase shrink-0">
                        Recommended
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCommitBatch(m.m3uBatch!.batchId, 'all')}
                      className="w-full text-left min-h-[40px] px-3 py-2 bg-[#0B132B] hover:bg-[#111E42] border border-[#00D9FF]/30 text-[#C9D1E0] hover:text-white font-bold text-[11px] rounded-lg transition-all flex items-center justify-between cursor-pointer"
                    >
                      <span>Include All ({m.m3uBatch.totalFound} Channels)</span>
                      <span className="text-[9px] text-[#C9D1E0]/70 font-mono">Include Offline</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCancelBatch(m.m3uBatch!.batchId)}
                      className="w-full text-center min-h-[36px] text-[11px] text-[#F43F5E] hover:text-[#FDA4AF] font-bold transition-all rounded-lg cursor-pointer"
                    >
                      Cancel & Discard Batch
                    </button>
                  </div>
                </div>
              )}

              <div className="text-[9px] text-[#C9D1E0]/70 text-right mt-1">{m.timestamp}</div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="text-[11px] text-[#00D9FF] font-mono font-bold flex items-center gap-1.5 px-1">
            <Bot className="w-3.5 h-3.5 animate-spin shrink-0" /> Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="p-2.5 bg-[#070C1E] border-t border-[#00D9FF]/20 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
        <button
          type="button"
          onClick={() => {
            if (onOpenM3uManager) {
              onOpenM3uManager();
              onClose();
            } else {
              handleSendMessage("Check and test M3U playlist link");
            }
          }}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-cyan font-bold px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Radio className="w-3.5 h-3.5 text-[#00D9FF] shrink-0" />
          <span>Check & Import M3U</span>
        </button>
        {onOpenAutoDev && (
          <button
            type="button"
            onClick={onOpenAutoDev}
            className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-purple font-black px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            <span>Auto-Dev Engine</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSendMessage("Run full system maintenance and stream auto-repair")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-gold font-bold px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Wrench className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>Maintenance</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Flush server proxy cache and free memory")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-cyan font-bold px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          <span>Flush Cache</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Sync all M3U playlist sources and channels")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-cyan font-bold px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          <span>Sync Channels</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Send sample monthly executive email report with visitor and VIP data to M R S")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-emerald font-bold px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Mail className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <span>Monthly Report</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Show today's daily system checkup, speed upgrades, and visitor report")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-cyan font-bold px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <BarChart3 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          <span>Daily Report</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Fix current stream buffering")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-cyan px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>Fix Buffering</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Show top movie channels")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-purple px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Film className="w-3.5 h-3.5 text-purple-300 shrink-0" />
          <span>Movies</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Show Bangladeshi TV channels")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-emerald px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <span>BD TV</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Show 24/7 news channels")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-cyan px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Newspaper className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          <span>News 24/7</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Show live sports channels")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-gold px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>Live Sports</span>
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("Find kids and cartoon channels")}
          className="whitespace-nowrap min-h-[36px] text-[11px] btn-premium-purple px-3 rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Smile className="w-3.5 h-3.5 text-purple-300 shrink-0" />
          <span>Kids</span>
        </button>
      </div>

      {/* Input */}
      <div className="p-2.5 bg-[#050816] border-t border-[#00D9FF]/25 flex items-center gap-2 shrink-0">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ask Stream Assistant..."
          className="flex-1 min-h-[40px] bg-[#0B132B] border border-[#00D9FF]/30 focus:border-[#00D9FF] text-white placeholder-[#C9D1E0]/60 text-xs rounded-lg px-3.5 py-2 outline-none transition-all"
        />
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isTyping}
          aria-label="Send message"
          className="w-10 h-10 rounded-lg btn-premium-primary flex items-center justify-center transition-all disabled:opacity-40 shrink-0 cursor-pointer"
        >
          <Send className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
};
