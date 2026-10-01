/**
 * components/ChatShell.tsx — The Dumb Beautiful Host Shell
 *
 * It owns NO business logic and NO rendering logic.
 * It is strictly the host shell with:
 *   1. Discovers the shop domain from .well-known (Arrow 1)
 *   2. Shopping cart icon with indicator dot (Arrow 2)
 *   3. 3-dots menu with "Start new chat" & Settings modal with 2 toggles (Arrow 3)
 *   4. X close button that collapses to floating bubble without session loss (Arrow 4)
 *   5. Dynamic welcome greeting with shop name (Arrow 5)
 *   6. Displays collections at load via LiveCommerce (Arrow 6)
 *   7. Brand placeholder input bar at the bottom (Arrow 7)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  ShoppingCart,
  PanelRight,
  MoreVertical,
  X,
  Settings,
  ChevronRight,
  ArrowLeft,
  Send,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import LiveCommerce from '../commerce/LiveCommerce';
import type {
  LiveCommerceHandle,
  CommerceIntent,
  StoreInfo,
  CommerceSnapshot,
} from '../commerce/types';
import { discoverStore } from '../commerce/discovery';
import { STORE_CATALOG } from '../commerce/catalog';

interface ChatShellProps {
  /** Optional custom MCP or store discovery URL */
  discoveryUrl?: string;
  /** Callback when commerce intent is emitted */
  onIntent?: (intent: CommerceIntent) => void;
  className?: string;
}

export const ChatShell: React.FC<ChatShellProps> = ({
  discoveryUrl,
  onIntent,
  className = '',
}) => {
  // Store info discovered from .well-known (Arrow 1)
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);

  // Shell UI states
  const [isOpen, setIsOpen] = useState(true); // Floating open or collapsed bubble
  const [isDocked, setIsDocked] = useState(false); // Docked sidebar mode or floating card
  const [activeOverlay, setActiveOverlay] = useState<'none' | 'menu' | 'settings'>('none');

  // Privacy & Settings toggles (Screenshot 3)
  const [personalizedAds, setPersonalizedAds] = useState(true);
  const [helpImproveAI, setHelpImproveAI] = useState(false);

  // Input message state (Arrow 7)
  const [inputMessage, setInputMessage] = useState('');

  // Cart indicator dot (Arrow 2)
  const [hasCartDot, setHasCartDot] = useState(true);

  // LiveCommerce ref
  const liveCommerceRef = useRef<LiveCommerceHandle>(null);

  // 1. Discover shop from .well-known on mount (100% resilient)
  useEffect(() => {
    discoverStore(discoveryUrl).then(info => {
      setStoreInfo(info);
      setHasCartDot(info.has_cart_items);
    });
  }, [discoveryUrl]);

  // Handle intents from LiveCommerce
  const handleIntent = useCallback((intent: CommerceIntent) => {
    onIntent?.(intent);

    if (intent.type === 'select_collection' && intent.collectionId) {
      // Route collection to catalog discovery
      const payload = STORE_CATALOG[intent.collectionId];
      if (payload && liveCommerceRef.current) {
        liveCommerceRef.current.ingest(payload);
      }
    }

    if (intent.type === 'add_to_cart') {
      setHasCartDot(true);
    }

    // Keep cart dot in sync with snapshot after state update
    setTimeout(() => {
      const snap = liveCommerceRef.current?.snapshot();
      if (snap?.cart) {
        setHasCartDot(snap.cart.units > 0);
      } else {
        setHasCartDot(false);
      }
    }, 50);
  }, [onIntent]);

  // Shopping cart button in top bar (Arrow 2) — cart UI is removed
  const handleOpenCart = () => {
    setActiveOverlay('none');
    onIntent?.({ type: 'open_cart' });
  };

  // Start new chat action (Screenshot 2)
  const handleStartNewChat = () => {
    setActiveOverlay('none');
    liveCommerceRef.current?.reset();
  };

  // Handle sending a user message (Arrow 7)
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputMessage.trim();
    if (!text) return;

    setInputMessage('');

    // Query LiveCommerce
    liveCommerceRef.current?.ingest({ view: 'discovery', products: [] });
  };

  const storeName = storeInfo?.name ?? '';
  const displayName = storeInfo?.display_name || storeInfo?.name || '';

  return (
    <div className={`fixed z-50 ${className}`}>
      {/* ── ARROW 4: FLOATING BUBBLE LAUNCHER (when closed) ────────────────── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="launcher"
            type="button"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#18181c] text-white shadow-[0_10px_35px_rgba(0,0,0,0.6)] border border-white/20 hover:border-white/40 backdrop-blur-xl transition-colors cursor-pointer group"
            aria-label="Open chat"
          >
            <div className="relative flex items-center justify-center">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-zinc-950 shadow-sm">
                <Sparkles size={17} className="fill-zinc-950 text-zinc-950" />
              </span>
              {hasCartDot && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 ring-2 ring-[#18181c] animate-pulse" />
              )}
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── MAIN CHAT SHELL WINDOW ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, y: 30, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 25, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className={`flex flex-col bg-[#18181c] text-zinc-100 shadow-[0_24px_70px_rgba(0,0,0,0.7)] border border-white/10 backdrop-blur-2xl overflow-hidden ${
              isDocked
                ? 'fixed top-0 right-0 bottom-0 w-full sm:w-[460px] rounded-l-[32px] sm:border-r-0'
                : 'fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-[calc(100vw-32px)] sm:w-[440px] h-[670px] max-h-[calc(100vh-32px)] rounded-[30px]'
            }`}
          >
            {/* ── SHELL TOP BAR HEADER ─────────────────────────────────────── */}
            <header className="relative flex items-center justify-between px-4 py-3.5 border-b border-white/5 bg-[#18181c]/90 backdrop-blur-md z-30 select-none">
              {/* Brand identifier */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-white text-zinc-950 shrink-0 shadow-sm">
                  <Sparkles size={16} className="fill-zinc-950 text-zinc-950" />
                </div>
                <span className="truncate text-[14px] font-bold tracking-tight text-white">
                  {displayName}
                </span>
              </div>

              {/* Action icons */}
              <div className="flex items-center gap-3 shrink-0">
                {/* Shopping Cart button with indicator dot (Arrow 2) */}
                <button
                  type="button"
                  onClick={handleOpenCart}
                  aria-label="Shopping bag"
                  className="relative grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer"
                >
                  <ShoppingCart size={18} />
                  {hasCartDot && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-white ring-2 ring-[#18181c]" />
                  )}
                </button>

                {/* Dock / split-screen toggle button */}
                <button
                  type="button"
                  onClick={() => setIsDocked(d => !d)}
                  aria-label={isDocked ? 'Undock chat' : 'Dock chat'}
                  className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 text-white/90 hover:text-white transition-colors cursor-pointer hidden sm:grid"
                >
                  {isDocked ? <Minimize2 size={16} /> : <PanelRight size={17} />}
                </button>

                {/* 3-dots Menu button (Arrow 3) */}
                <button
                  type="button"
                  onClick={() => setActiveOverlay(v => (v === 'none' ? 'menu' : 'none'))}
                  aria-label="Chat menu"
                  className={`grid h-8 w-8 place-items-center rounded-full transition-colors cursor-pointer ${
                    activeOverlay !== 'none' ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/90'
                  }`}
                >
                  <MoreVertical size={18} />
                </button>

                {/* X close button (Arrow 4) */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close chat"
                  className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* ── SHELL BODY: LIVE COMMERCE RENDERING (Arrows 5 & 6) ────────── */}
            <div className="relative flex flex-1 w-full min-h-0 overflow-hidden">
              <LiveCommerce
                ref={liveCommerceRef}
                storeName={storeName}
                collections={storeInfo?.collections}
                initialCart={storeInfo?.initial_cart}
                onIntent={handleIntent}
                emitNavigationIntents={false}
              />

              {/* ── ARROW 3: SCREENSHOT 2 (3-DOTS MENU POPOVER) ─────────────── */}
              <AnimatePresence>
                {activeOverlay === 'menu' && (
                  <motion.div
                    key="menu-popover"
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.16 }}
                    className="absolute top-3 right-3 left-3 z-40 rounded-2xl border border-white/15 bg-[#1b1b20] p-4 shadow-2xl backdrop-blur-2xl"
                  >
                    <div>
                      <h3 className="text-sm font-bold text-white">Start a new chat?</h3>
                      <p className="text-xs text-zinc-400 mt-1 mb-3.5 leading-relaxed">
                        Starting a new chat will delete this conversation. You can't undo this action.
                      </p>
                      <button
                        type="button"
                        onClick={handleStartNewChat}
                        className="w-full rounded-full bg-white py-2.5 text-xs font-bold text-zinc-950 hover:bg-zinc-200 transition-colors shadow-sm cursor-pointer"
                      >
                        Start a new chat
                      </button>
                    </div>

                    <div className="border-t border-zinc-800/80 my-3.5" />

                    <button
                      type="button"
                      onClick={() => setActiveOverlay('settings')}
                      className="flex w-full items-center justify-between py-1 text-left text-white hover:text-white/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <Settings size={17} className="text-zinc-300" />
                        <span className="text-xs font-semibold text-white">Settings</span>
                      </div>
                      <ChevronRight size={16} className="text-zinc-400" />
                    </button>

                    <div className="border-t border-zinc-800/80 my-3.5" />

                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="hover:text-white transition-colors cursor-pointer">Terms of Use</span>
                      <span className="hover:text-white transition-colors cursor-pointer">Privacy</span>
                    </div>

                    <p className="mt-3 text-[11px] text-zinc-500 leading-normal">
                      {displayName} uses AI, so it may occasionally make mistakes
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── ARROW 3: SCREENSHOT 3 (SETTINGS MODAL WITH 2 TOGGLES) ────── */}
              <AnimatePresence>
                {activeOverlay === 'settings' && (
                  <motion.div
                    key="settings-modal"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.18 }}
                    className="absolute inset-0 z-40 flex flex-col bg-[#18181c] p-5 overflow-y-auto"
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 pb-3">
                      <button
                        type="button"
                        onClick={() => setActiveOverlay('menu')}
                        className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer"
                        aria-label="Back to menu"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <h2 className="text-base font-extrabold text-white">Settings</h2>
                    </div>

                    {/* Tab Navigation: Privacy */}
                    <div className="border-b border-zinc-800 pt-1 pb-2">
                      <div className="inline-block relative">
                        <span className="text-xs font-bold text-white pb-2 inline-block">
                          Privacy
                        </span>
                        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-full" />
                      </div>
                    </div>

                    {/* Toggle 1: Personalized ads & offers */}
                    <div className="pt-5 pb-4 border-b border-zinc-800/70">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="text-xs font-bold text-white leading-snug">
                            Personalized ads & offers
                          </h4>
                          <p className="mt-1 text-[11.5px] text-zinc-400 leading-relaxed">
                            Allow your activity and chats to tailor the products, offers, and ads you see — so you discover more of what's right for you.
                          </p>
                        </div>
                        {/* iOS style toggle */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={personalizedAds}
                          onClick={() => setPersonalizedAds(v => !v)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                            personalizedAds ? 'bg-white' : 'bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full shadow-md transition duration-200 ease-in-out mt-0.5 ${
                              personalizedAds ? 'translate-x-5 bg-zinc-950' : 'translate-x-0.5 bg-white'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Toggle 2: Help improve AI */}
                    <div className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="text-xs font-bold text-white leading-snug">
                            Help improve AI
                          </h4>
                          <p className="mt-1 text-[11.5px] text-zinc-400 leading-relaxed">
                            Allow conversations with {displayName} to help train AI. This includes anything you type or add to the chat, like photos.
                          </p>
                        </div>
                        {/* iOS style toggle */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={helpImproveAI}
                          onClick={() => setHelpImproveAI(v => !v)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                            helpImproveAI ? 'bg-white' : 'bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full shadow-md transition duration-200 ease-in-out mt-0.5 ${
                              helpImproveAI ? 'translate-x-5 bg-zinc-950' : 'translate-x-0.5 bg-white'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Explanatory note at bottom */}
                    <p className="mt-auto pt-6 text-[11px] text-zinc-500 leading-relaxed">
                      You're in control. You can change these anytime — turning them off won't affect your shopping experience.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── ARROW 7: BOTTOM INPUT BAR ────────────────────────────────── */}
            <div className="p-3 border-t border-white/5 bg-[#18181c]/95 z-30">
              <form onSubmit={handleSendMessage} className="relative flex items-center">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  placeholder={`Message ${displayName}`}
                  className="w-full rounded-full border border-zinc-800 bg-[#121215] px-4 py-3 pr-11 text-xs text-white placeholder-zinc-500 focus:border-white/30 focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  aria-label="Send message"
                  className="absolute right-1.5 grid h-8 w-8 place-items-center rounded-full bg-white text-zinc-950 disabled:opacity-20 hover:bg-zinc-200 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send size={13} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatShell;
