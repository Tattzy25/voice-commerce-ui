/**
 * App.tsx — Minimalist Staging Environment
 *
 * NOTE: The background website is completely disabled by default (SHOW_BACKGROUND_WEBSITE = false)
 * per your instruction: "Remove that background right now completely gone. I don't need a website."
 *
 * To completely delete the demo website code once you pull this component out,
 * simply delete the `DemoWebsitePages` function at the bottom.
 */
import React, { useRef, useState } from 'react';
import StandaloneLiveCommerce from './commerce/StandaloneLiveCommerce';
import LiveTranscript from './components/LiveTranscript';
import type { LiveCommerceHandle, CommerceIntent } from './commerce/types';

// Set to true only if you want to preview the mock store background pages.
const SHOW_BACKGROUND_WEBSITE = false;

export default function App() {
  const liveCommerceRef = useRef<LiveCommerceHandle>(null);
  const [storeName] = useState('tatty.com');
  const [isTranscriptEnabled, setIsTranscriptEnabled] = useState(true);

  const handleIntent = (intent: CommerceIntent) => {
    console.log('[LiveCommerce Intent]:', intent);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#0a0a0c] text-white flex flex-col items-center justify-center overflow-hidden">
      {/* ── DYNAMIC SINGLE-ROW DISAPPEARING VOICE TRANSCRIPT OVERLAY ── */}
      <LiveTranscript
        enabled={isTranscriptEnabled}
        onToggle={setIsTranscriptEnabled}
      />

      {/* ── BACKGROUND WEBSITE (DISABLED BY DEFAULT / EASY TO DELETE) ── */}
      {SHOW_BACKGROUND_WEBSITE ? (
        <DemoWebsitePages storeName={storeName} />
      ) : (
        /* Minimalist 2026 Studio Backdrop */
        <div className="relative z-0 flex flex-col items-center justify-center p-8 text-center max-w-lg pointer-events-none select-none">
          <div className="absolute inset-0 bg-radial from-fuchsia-950/20 via-transparent to-transparent blur-3xl pointer-events-none" />
          <h1 className="text-xl font-bold tracking-tight text-zinc-300">
            Live Voice Commerce
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs">
            Duplex voice audio agent powered by OpenAI Realtime WebRTC.
          </p>
        </div>
      )}

      {/* ── THE FLOATING STANDALONE LIVE COMMERCE LAYER ── */}
      <StandaloneLiveCommerce
        ref={liveCommerceRef}
        storeName={storeName}
        onIntent={handleIntent}
        sessionActive={true}
        emitNavigationIntents={false}
        isTranscriptEnabled={isTranscriptEnabled}
        onToggleTranscript={setIsTranscriptEnabled}
      />
    </div>
  );
}

/**
 * MOCK STORE BACKGROUND PAGES (OPTIONAL / SAFE TO DELETE AT ANY TIME)
 */
function DemoWebsitePages({ storeName }: { storeName: string }) {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-12 text-left opacity-30 pointer-events-none">
      <h2 className="text-2xl font-bold text-white">{storeName} Storefront</h2>
      <p className="text-sm text-zinc-400 mt-2">
        Background website placeholder (can be completely deleted).
      </p>
    </div>
  );
}
