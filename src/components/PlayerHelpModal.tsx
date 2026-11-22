import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, HelpCircle, Play, Radio, Zap, Star, Lock, Clock, Tv,
  SlidersHorizontal, AlertTriangle, Mail, Keyboard, ChevronRight
} from 'lucide-react';

interface PlayerHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlayerHelpModal: React.FC<PlayerHelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<string>('getting-started');

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 sm:p-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative w-full max-w-3xl h-[92vh] max-h-[820px] rounded-[14px] bg-[rgba(12,18,40,0.96)] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden text-white font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0 bg-[#050816]/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#F5B301]/15 border border-[#F5B301]/40 text-[#F5B301]">
                <HelpCircle className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>Help & Instructions</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#22B8F0]/20 text-[#22B8F0] border border-[#22B8F0]/30 font-bold uppercase">
                    M R S IPTV
                  </span>
                </h2>
                <p className="text-[11px] text-white/60">Official guide for live sports & TV streaming</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Help & Instructions"
              className="w-10 h-10 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-colors cursor-pointer shrink-0"
              title="Close Guide"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
          </div>

          {/* Navigation Tabs (Horizontal scroll) */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 bg-[#080D20] overflow-x-auto no-scrollbar shrink-0">
            {[
              { id: 'getting-started', label: 'Getting Started', icon: Play },
              { id: 'changing-channels', label: 'Changing Channels', icon: Radio },
              { id: 'sources-lines', label: 'Sources & AUTO Line', icon: Zap },
              { id: 'favorites-lock', label: 'Favorites & Lock', icon: Star },
              { id: 'vip-pass', label: '1h VIP Pass', icon: Clock },
              { id: 'tv-mode', label: 'TV Mode & Remotes', icon: Tv },
              { id: 'aspect-volume', label: 'Aspect & Volume', icon: SlidersHorizontal },
              { id: 'troubleshooting', label: 'Troubleshooting', icon: AlertTriangle },
              { id: 'shortcuts', label: 'Shortcuts Table', icon: Keyboard },
              { id: 'support', label: 'Support & Contact', icon: Mail }
            ].map((tab) => {
              const IconComp = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-label={tab.label}
                  className={`h-10 px-3.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-[#F5B301] text-[#050816] shadow-[0_0_12px_rgba(245,179,1,0.3)]'
                      : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <IconComp className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#050816]' : 'text-[#F5B301]'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 custom-scrollbar text-[13px] leading-relaxed text-white/80">
            {activeTab === 'getting-started' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Play className="w-4 h-4 text-[#F5B301]" />
                  Getting Started with M R S IPTV
                </h3>
                <p>
                  M R S IPTV streams live sports events, news, entertainment, and 8,890+ global channels directly to your browser or Smart TV using high-speed HLS (.m3u8) streams.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3.5 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <h4 className="text-xs font-bold text-[#F5B301] uppercase tracking-wider mb-1">Mobile & Touch</h4>
                    <p className="text-xs text-white/70">
                      Tap anywhere on the stream to unmute audio. Swipe UP to jump to the next channel, or swipe DOWN for the previous channel.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <h4 className="text-xs font-bold text-[#22B8F0] uppercase tracking-wider mb-1">Smart TV & Keyboard</h4>
                    <p className="text-xs text-white/70">
                      Use Arrow Up/Down for channels, Arrow Left/Right for Volume (-5% / +5%), G for TV Guide, and Enter/OK to play or pause.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'changing-channels' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#F5B301]" />
                  Changing Channels
                </h3>
                <p>There are three quick ways to change channels anytime:</p>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5">
                    <span className="px-2 py-0.5 rounded bg-[#F5B301]/20 text-[#F5B301] font-mono font-bold text-xs shrink-0 mt-0.5">1</span>
                    <div>
                      <strong className="text-white">Vertical Swipe Gesture:</strong> On mobile or touchscreens, swipe UP for the Next channel, or swipe DOWN for the Previous channel.
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="px-2 py-0.5 rounded bg-[#F5B301]/20 text-[#F5B301] font-mono font-bold text-xs shrink-0 mt-0.5">2</span>
                    <div>
                      <strong className="text-white">CH- and CH+ Buttons:</strong> Located in the center transport and bottom dock. Click or tap to cycle through channels.
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="px-2 py-0.5 rounded bg-[#F5B301]/20 text-[#F5B301] font-mono font-bold text-xs shrink-0 mt-0.5">3</span>
                    <div>
                      <strong className="text-white">Direct Number Dialing:</strong> Type digits (e.g. <code>0</code> <code>4</code> <code>2</code>) or open the on-screen Keypad (`123`) in the player dock. A <code className="text-[#F5B301]">CH 042</code> badge appears and tunes automatically in 2s or on OK.
                    </div>
                  </li>
                </ul>
              </div>
            )}

            {activeTab === 'sources-lines' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#F5B301]" />
                  Stream Lines & Camellia Stream Doctor
                </h3>
                <p>
                  Each channel can carry backup mirror URLs and multi-proxy routing profiles to keep live streams online:
                </p>
                <div className="space-y-2">
                  <div className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-[#2ECC71]">AUTO Mode (Recommended):</strong> Automatically negotiates the best server-side proxy profile (<code className="text-white">vlc</code>, <code className="text-white">smarters</code>, <code className="text-white">chrome</code>, <code className="text-white">smarttv</code>).
                  </div>
                  <div className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-[#F5B301]">Manual Line Switching:</strong> Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-[11px]">L</kbd> or tap <code className="text-white">Line</code> in the dock to cycle available backup mirror sources.
                  </div>
                  <div className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-[#22B8F0]">Camellia Stream Doctor:</strong> Runs continuous backend 5-stage health probes. If an HTTP 403/404 or HLS stall occurs for 10s, tap <strong className="text-white">Run Stream Doctor</strong> to immediately diagnose and switch to the fastest working proxy or mirror.
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'favorites-lock' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#F5B301]" />
                  Favorites & Screen Lock
                </h3>
                <div className="space-y-3">
                  <div className="p-3.5 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <h4 className="text-xs font-bold text-[#F5B301] uppercase tracking-wider mb-1">Saved Favorites</h4>
                    <p className="text-xs text-white/70">
                      Tap the Star icon in the dock or More menu. Saved favorites are persisted locally and accessible immediately in the Favorites filter of TV Guide.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Screen Controls Lock</h4>
                    <p className="text-xs text-white/70">
                      Tap Lock Controls in the More menu to prevent accidental touches while watching on mobile. Tap Unlock in the corner anytime to restore HUD controls.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'vip-pass' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#F5B301]" />
                  1-Hour VIP Pass & Ad-Free Streaming
                </h3>
                <p>
                  Enjoy uninterrupted, ad-free live TV streaming at zero monetary cost:
                </p>
                <ul className="space-y-2 text-xs text-white/80">
                  <li className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-[#F5B301]">Activation:</strong> Tap <code className="text-[#F5B301]">1h Free VIP</code> in the dock or header, complete the short sponsor spotlight, and your 1-hour ad-free VIP pass activates immediately.
                  </li>
                  <li className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-[#2ECC71]">Single-Device Security:</strong> Official VIP passes are locked strictly to your current device with no extra account login required.
                  </li>
                  <li className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-[#22B8F0]">Renewal:</strong> When the 1-hour pass expires, tap <strong className="text-white">1h Free VIP</strong> again anytime to extend ad-free playback.
                  </li>
                </ul>
              </div>
            )}

            {activeTab === 'tv-mode' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Tv className="w-4 h-4 text-[#F5B301]" />
                  Android TV & Remote Keys
                </h3>
                <p>
                  When opened on Android TV, Google TV, Fire TV, or Smart TV browsers, all interactive controls support DPAD focus navigation with 2px gold focus rings:
                </p>
                <div className="p-3.5 rounded-[12px] bg-white/[0.04] border border-white/10 space-y-2 text-xs">
                  <div><strong className="text-white">Arrow Up / Down / Ch+ / Ch-:</strong> Previous & Next Channel</div>
                  <div><strong className="text-white">Arrow Left / Right:</strong> Volume -5% / +5%</div>
                  <div><strong className="text-white">G Button:</strong> Toggle TV Guide & 8,890+ Channel Sheet</div>
                  <div><strong className="text-white">Enter / OK:</strong> Play / Pause or confirm dial number</div>
                  <div><strong className="text-white">Back / Escape:</strong> Close sheet / exit Fullscreen / return Home</div>
                  <div><strong className="text-white">Number Keys 0-9:</strong> Jump directly to any channel number</div>
                </div>
              </div>
            )}

            {activeTab === 'aspect-volume' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#F5B301]" />
                  Aspect Ratio & Volume Boost
                </h3>
                <div className="space-y-3">
                  <div className="p-3.5 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <h4 className="text-xs font-bold text-[#F5B301] uppercase tracking-wider mb-1">Aspect Ratio Modes</h4>
                    <p className="text-xs text-white/70">
                      Toggle between <strong className="text-white">16:9 Fit</strong> (preserves broadcast aspect), <strong className="text-white">ZOOM</strong> (ultrawide crop), and <strong className="text-white">FILL</strong> (stretches edge-to-edge) from the dock or Fullscreen overlay.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <h4 className="text-xs font-bold text-[#22B8F0] uppercase tracking-wider mb-1">Speaker Audio Boost</h4>
                    <p className="text-xs text-white/70">
                      Cycle Web Audio speaker gain in the Volume popup or More menu from <strong className="text-white">100%</strong> to <strong className="text-white">150%</strong> or <strong className="text-white">200%</strong> for quiet broadcasts.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'troubleshooting' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#FF3B4E]" />
                  Troubleshooting Playback
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-white">1. Switch Line or Run Stream Doctor:</strong>
                    <p className="text-white/70 mt-1">Tap <strong className="text-white">Line</strong> (or press <kbd className="px-1 bg-white/10 rounded font-mono">L</kbd>) to switch backup mirrors, or tap <strong className="text-white">Run Stream Doctor</strong> when the 10s stall banner appears so Camellia probes and selects a live proxy profile.</p>
                  </div>
                  <div className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-white">2. Reload Stream on Stuck Connection:</strong>
                    <p className="text-white/70 mt-1">Open <strong className="text-white">More</strong> &rarr; <strong className="text-white">Reload Stream</strong> to reset the HLS buffer cleanly without leaving the channel.</p>
                  </div>
                  <div className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-white">3. Refresh Playlist & M3U Health Sync:</strong>
                    <p className="text-white/70 mt-1">From Home, tap the top header <strong className="text-white">Refresh</strong> button or open <strong className="text-white">M3U Manager &rarr; Sync & Update All Playlists</strong> to pull freshly verified live channels from the backend M3U Doctor.</p>
                  </div>
                  <div className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                    <strong className="text-white">4. Clear Cache for Stale Catalog Issues:</strong>
                    <p className="text-white/70 mt-1">Open the navigation <strong className="text-white">Sidebar &rarr; Clear Cache</strong> if old channel URLs persist. Your VIP pass and Favorites remain safe while the channel directory re-syncs fresh.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-[#F5B301]" />
                  Keyboard & Remote Shortcuts
                </h3>
                <div className="rounded-[12px] overflow-hidden border border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#050816] text-[#F5B301] uppercase font-mono text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Key / Button</th>
                        <th className="py-2.5 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 text-white/80">
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">Space / K / Enter</td><td className="py-2 px-3">Play / Pause Live Stream (or Confirm Channel Dial)</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">Arrow Up / Down / Ch+ / Ch-</td><td className="py-2 px-3">Previous / Next Channel</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">Arrow Left / Right</td><td className="py-2 px-3">Volume -5% / +5%</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">0-9 (Digits)</td><td className="py-2 px-3">Direct Channel Number Jump (CH 0__)</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">L</td><td className="py-2 px-3">Cycle Stream Source Line / Mirror</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">G</td><td className="py-2 px-3">Toggle TV Guide & Channels</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">H / ?</td><td className="py-2 px-3">Open / Close Help & Instructions</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">F</td><td className="py-2 px-3">Toggle Fullscreen Mode</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">M</td><td className="py-2 px-3">Mute / Unmute Audio</td></tr>
                      <tr><td className="py-2 px-3 font-mono font-bold text-white">Escape / BackSpace</td><td className="py-2 px-3">Close Overlays / Exit Fullscreen / Return Home</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'support' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#F5B301]" />
                  Support & Contact
                </h3>
                <p>
                  Need assistance or want to suggest new channel sources for M R S IPTV?
                </p>
                <div className="p-4 rounded-[12px] bg-white/[0.04] border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-white/60">Platform:</span>
                    <strong className="text-white">M R S IPTV Autonomous Engine</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/60">Site Managing:</span>
                    <strong className="text-[#F5B301]">Camellia (mrxshahin.ai.studio)</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/60">Channels Online:</span>
                    <strong className="text-[#2ECC71]">8,890+ Live IPTV Channels</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0 bg-[#050816]/60">
            <span className="text-[11px] font-mono text-white/50">
              M R S IPTV · Midnight Broadcast v2.0
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Done reading help"
              className="h-10 px-5 rounded-lg bg-[#F5B301] hover:bg-[#ffc01e] text-[#050816] text-xs font-bold focus-visible:ring-2 focus-visible:ring-[#F5B301] transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
