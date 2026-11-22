import React, { useState } from 'react';
import { Copy, Check, Code, FileCode, AppWindow, BookOpen, Terminal } from 'lucide-react';

export default function EmbedCodeViewer() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const htmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Android Live Sports Streaming Player</title>
    <!-- Tailwind CSS for modern aesthetics -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #020617; color: #f8fafc; font-family: sans-serif; }
        .glow { box-shadow: 0 0 15px rgba(16, 185, 129, 0.2); }
    </style>
</head>
<body class="flex flex-col min-h-screen p-4 md:p-8">

    <div class="max-w-4xl mx-auto w-full">
        <!-- Header -->
        <header class="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
            <div>
                <h1 class="text-xl font-black text-lime-400 tracking-wider flex items-center gap-2">
                    ANDROID LIVE STREAMER
                </h1>
                <p class="text-xs text-gray-500 mt-1">Responsive HTML5 Live IPTV Playlists</p>
            </div>
            <span class="text-xs px-2 py-1 bg-gray-100 border border-gray-200 text-gray-700 font-mono rounded">
                v1.2.0-Live
            </span>
        </header>

        <!-- Dynamic Main Video Screen -->
        <div class="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-gray-200 shadow-2xl mb-6">
            <iframe 
                id="main-live-player" 
                src="https://play.88player.top/m3u8.html?url=https://liveeu-gcp.alkassdigital.net/alkass3-p/main.m3u8" 
                class="w-full h-full border-0" 
                allow="autoplay; encrypted-media; fullscreen" 
                allowfullscreen>
            </iframe>
        </div>

        <!-- 3 Channel Playlist Controls -->
        <div class="bg-gray-50 p-5 rounded-2xl border border-gray-200">
            <h2 class="text-xs font-black text-gray-700 tracking-widest uppercase mb-4 flex items-center gap-1.5">
                STREAM CHANNELS (TAP TO PLAY)
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                <!-- Channel 1 -->
                <button 
                    onclick="switchChannel('https://play.88player.top/m3u8.html?url=https://liveeu-gcp.alkassdigital.net/alkass3-p/main.m3u8', this)" 
                    class="chan-btn flex flex-col p-3 rounded-xl border border-lime-500/30 bg-lime-500/5 text-left transition-all hover:bg-lime-500/10">
                    <span class="text-[10px] font-mono text-lime-400 font-bold mb-1">CHANNEL 01</span>
                    <span class="text-xs font-bold text-emerald-100">Alkass Sports 3 HD</span>
                    <span class="text-[10px] text-gray-500 mt-1 font-mono">Alkass HLS Feed</span>
                </button>

                <!-- Channel 2 -->
                <button 
                    onclick="switchChannel('https://play.88player.top/m3u8.html?url=https://liveeu-gcp.alkassdigital.net/alkass2-p/main.m3u8', this)" 
                    class="chan-btn flex flex-col p-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-left transition-all hover:bg-gray-100">
                    <span class="text-[10px] font-mono text-gray-400 font-bold mb-1">CHANNEL 02</span>
                    <span class="text-xs font-bold text-gray-700">Alkass Sports 2 HD</span>
                    <span class="text-[10px] text-gray-500 mt-1 font-mono">Alkass HLS Feed</span>
                </button>

                <!-- Channel 3 -->
                <button 
                    onclick="switchChannel('https://play.88player.top/m3u8.html?url=https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8', this)" 
                    class="chan-btn flex flex-col p-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-left transition-all hover:bg-gray-100">
                    <span class="text-[10px] font-mono text-gray-400 font-bold mb-1">CHANNEL 03</span>
                    <span class="text-xs font-bold text-gray-700">beIN Sports Xtra</span>
                    <span class="text-[10px] text-gray-500 mt-1 font-mono">beIN Cloudfront Feed</span>
                </button>

            </div>
        </div>
    </div>

    <!-- Switcher Script -->
    <script>
        function switchChannel(url, btnElement) {
            // Update iframe src
            document.getElementById('main-live-player').src = url;
            
            // Update button styles
            const buttons = document.querySelectorAll('.chan-btn');
            buttons.forEach(btn => {
                btn.className = "chan-btn flex flex-col p-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-left transition-all hover:bg-gray-100";
                // Reset internal text colours
                btn.querySelector('.text-emerald-100')?.classList.replace('text-emerald-100', 'text-gray-700');
            });
            
            // Highlight selected button
            btnElement.className = "chan-btn flex flex-col p-3 rounded-xl border border-lime-500/30 bg-lime-500/5 text-left transition-all hover:bg-lime-500/10";
            btnElement.querySelector('span:nth-child(2)').className = "text-xs font-bold text-emerald-100";
        }
    </script>
</body>
</html>`;

  const m3uPlaylist = `#EXTM3U
#EXTINF:-1 tvg-id="Alkass3" tvg-name="Alkass Sports 3 HD" tvg-logo="https://play.88player.top/logo.png" group-title="Sports",Alkass Sports 3 HD (Channel 1)
https://liveeu-gcp.alkassdigital.net/alkass3-p/main.m3u8

#EXTINF:-1 tvg-id="Alkass2" tvg-name="Alkass Sports 2 HD" tvg-logo="https://play.88player.top/logo.png" group-title="Sports",Alkass Sports 2 HD (Channel 2)
https://liveeu-gcp.alkassdigital.net/alkass2-p/main.m3u8

#EXTINF:-1 tvg-id="beINXtra" tvg-name="beIN Sports Xtra" tvg-logo="https://play.88player.top/logo.png" group-title="Sports",beIN Sports Xtra (Channel 3)
https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8`;

  const androidJavaCode = `package com.livesports.streaming;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView myWebView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        myWebView = findViewById(R.id.webview);
        WebSettings webSettings = myWebView.getSettings();
        
        // Critical settings for playing HTML5 Live Streams flawlessly
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setLoadsImagesAutomatically(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        // Hardware Acceleration is essential for high-res H264 rendering
        myWebView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);

        myWebView.setWebViewClient(new WebViewClient());
        myWebView.setWebChromeClient(new WebChromeClient());

        // Load the hosted live applet URL
        myWebView.loadUrl("https://play.88player.top/m3u8.html?url=https://liveeu-gcp.alkassdigital.net/alkass3-p/main.m3u8");
    }
}`;

  return (
    <div className="bg-[#070C1E] text-white rounded-2xl border border-[#00D9FF]/35 p-4 md:p-6 shadow-xl w-full">
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[#00D9FF]/20">
        <Code className="text-[#00D9FF] shrink-0" size={18} />
        <div>
          <h2 className="text-sm font-black tracking-wider text-white">
            ANDROID EXPORT & HTML SOURCE CODE
          </h2>
          <p className="text-[10px] text-[#C9D1E0] font-medium">Download or copy sources for your own Android Studio/web build</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* HTML Code Block */}
        <div className="rounded-xl overflow-hidden border border-[#00D9FF]/30">
          <div className="flex justify-between items-center bg-[#0B132B] px-3 py-2 border-b border-[#00D9FF]/25">
            <div className="flex items-center gap-1.5 text-xs text-white font-semibold font-mono">
              <FileCode size={14} className="text-[#00D9FF] shrink-0" />
              index.html
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(htmlCode, 'html')}
              className="min-h-[34px] flex items-center gap-1.5 text-[11px] font-bold btn-premium-cyan px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              {copiedKey === 'html' ? <Check size={12} className="text-[#10B981] shrink-0" /> : <Copy size={12} className="shrink-0" />}
              <span>{copiedKey === 'html' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="relative">
            <pre className="text-[10px] bg-[#050816] text-[#C9D1E0] p-3 overflow-x-auto font-mono max-h-[160px] custom-scrollbar">
              {htmlCode}
            </pre>
          </div>
        </div>

        {/* M3U Playlist Block */}
        <div className="rounded-xl overflow-hidden border border-[#00D9FF]/30">
          <div className="flex justify-between items-center bg-[#0B132B] px-3 py-2 border-b border-[#00D9FF]/25">
            <div className="flex items-center gap-1.5 text-xs text-white font-semibold font-mono">
              <Terminal size={14} className="text-[#10B981] shrink-0" />
              playlist.m3u (IPTV Format)
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(m3uPlaylist, 'm3u')}
              className="min-h-[34px] flex items-center gap-1.5 text-[11px] font-bold btn-premium-cyan px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              {copiedKey === 'm3u' ? <Check size={12} className="text-[#10B981] shrink-0" /> : <Copy size={12} className="shrink-0" />}
              <span>{copiedKey === 'm3u' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="text-[10px] bg-[#050816] text-[#C9D1E0] p-3 overflow-x-auto font-mono max-h-[120px] custom-scrollbar">
            {m3uPlaylist}
          </pre>
        </div>

        {/* Android WebView Java Code Block */}
        <div className="rounded-xl overflow-hidden border border-[#00D9FF]/30">
          <div className="flex justify-between items-center bg-[#0B132B] px-3 py-2 border-b border-[#00D9FF]/25">
            <div className="flex items-center gap-1.5 text-xs text-white font-semibold font-mono">
              <AppWindow size={14} className="text-[#B832F5] shrink-0" />
              MainActivity.java (Android WebView Integration)
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(androidJavaCode, 'java')}
              className="min-h-[34px] flex items-center gap-1.5 text-[11px] font-bold btn-premium-cyan px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              {copiedKey === 'java' ? <Check size={12} className="text-[#10B981] shrink-0" /> : <Copy size={12} className="shrink-0" />}
              <span>{copiedKey === 'java' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="text-[10px] bg-[#050816] text-[#C9D1E0] p-3 overflow-x-auto font-mono max-h-[160px] custom-scrollbar">
            {androidJavaCode}
          </pre>
        </div>

        {/* Quick Guide */}
        <div className="bg-[#0B132B] border border-[#00D9FF]/30 rounded-xl p-3.5 flex gap-2.5 items-start">
          <BookOpen size={16} className="text-[#00D9FF] mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-[#C9D1E0] leading-relaxed">
            <span className="text-white font-semibold">How to deploy to Android:</span> Create an Android Studio project with a single full-screen <code className="text-[#00D9FF] bg-[#050816] border border-[#00D9FF]/30 px-1.5 py-0.5 rounded-md font-mono">WebView</code> layout, add internet permission <code className="text-[#10B981] bg-[#050816] border border-[#10B981]/30 px-1.5 py-0.5 rounded-md font-mono">&lt;uses-permission android:name="android.permission.INTERNET" /&gt;</code> in AndroidManifest.xml, and use the Java snippet above to stream these live sports channels directly on any Android smartphone!
          </div>
        </div>
      </div>
    </div>
  );
}
