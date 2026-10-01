/**
 * commerce/StandaloneLiveCommerce.tsx — The exact original floating standalone Live Commerce layer.
 *
 * Rendered exactly as designed:
 *   · Floating bottom shelf with 1-row snap carousel on mobile, 4-up hugging grid on md+
 *   · Minimized floating pill
 *   · Floating product detail & option/variant sheet
 *   · Floating checkout continuation & embed
 *   · Floating order completion
 *   · Merchant toast notifications
 *   · NO shopping cart bag UI
 */
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, ShoppingBag,
  CheckCircle2, Loader2, Store, ExternalLink, Phone, PhoneOff,
  ImagePlus, Send, UploadCloud, Eye, Maximize2, Captions,
} from 'lucide-react';
import type {
  Raw, Stage, View, Product, CheckoutState, OrderState,
  CommerceIntent, CommerceSnapshot, LiveCommerceHandle, RoutedResult,
} from './types';
import { routeResult } from './route';
import { normalizeProduct, setPriceUnit } from './resolve';
import { VoiceVisualizer } from './VoiceCall';
import { STORE_CATALOG } from './catalog';

export const PER_PAGE = 4;
const OPT_PREVIEW = 8;
const VARIANT_PREVIEW = 6;

export interface StandaloneLiveCommerceProps {
  storeName?: string;
  onIntent?: (intent: CommerceIntent) => void;
  sessionActive?: boolean;
  emitNavigationIntents?: boolean;
  priceUnit?: 'auto' | 'minor' | 'major';
  className?: string;
  isTranscriptEnabled?: boolean;
  onToggleTranscript?: (enabled: boolean) => void;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const initials = (s: string) => s.split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '•';
const NO_SB = 'lc-no-sb';

function Thumb({ p, className }: { p: Product; className?: string }) {
  const src = p.media[0];
  if (src) return <img src={src} alt={p.title || 'Product thumbnail'} referrerPolicy="no-referrer" className={cx('w-full h-full object-cover', className)} />;
  const h = hash(p.title) % 360;
  return (
    <div
      className={cx('w-full h-full grid place-items-center font-extrabold text-zinc-500', className)}
      style={{ background: `linear-gradient(135deg, hsl(${h} 28% 90%), hsl(${(h + 42) % 360} 26% 78%))`, fontSize: 'clamp(14px,3vw,26px)' }}
      aria-hidden="true"
    >
      {initials(p.title)}
    </div>
  );
}

function Stars({ rating, reviews }: { rating: number | null; reviews: number | null }) {
  if (rating == null) return null;
  return (
    <div
      className="flex items-center gap-1 text-[10px] leading-none"
      aria-label={`Rated ${rating} out of 5 stars from ${reviews ?? 0} reviews`}
      role="img"
    >
      <span className="relative text-zinc-300 tracking-[1px]" aria-hidden="true">
        ★★★★★
        <span className="absolute inset-0 overflow-hidden whitespace-nowrap text-amber-400" style={{ width: `${(rating / 5) * 100}%` }}>★★★★★</span>
      </span>
      {reviews != null && <span className="text-zinc-500 text-[9px]" aria-hidden="true">({reviews})</span>}
    </div>
  );
}

const Badge = ({ text, tone }: { text: string; tone?: 'sale' | 'new' | 'stock' }) => (
  <span className={cx(
    'absolute top-1.5 left-1.5 z-10 rounded-full px-1.5 py-0.5 text-[8.5px] font-extrabold tracking-[0.08em] text-white',
    tone === 'sale' ? 'bg-pink-600' : tone === 'new' ? 'bg-emerald-600' : 'bg-zinc-800/90',
  )}>
    {text}
  </span>
);

const badgeTone = (p: Product): 'sale' | 'new' | 'stock' | undefined =>
  p.badge ? (/sale|deal|off/i.test(p.badge) ? 'sale' : /new/i.test(p.badge) ? 'new' : undefined) : undefined;

const SESSION_STORAGE_KEY = 'standalone_live_commerce_session_v3';

interface PersistedCommerceSession {
  stage: Stage;
  products: Product[];
  page: number;
  minimized: boolean;
  activeId: string | null;
  selections: Record<string, string>;
  checkout: CheckoutState | null;
  order: OrderState | null;
  isVoiceActive: boolean;
  uploadedImages: string[];
  deliveredImage: string | null;
}

function getSavedSession(): Partial<PersistedCommerceSession> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function saveSession(data: PersistedCommerceSession) {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(data);
    sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
    localStorage.setItem(SESSION_STORAGE_KEY, serialized);
  } catch {
    // ignore
  }
}

function removeSavedSession() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const StandaloneLiveCommerce = forwardRef<LiveCommerceHandle, StandaloneLiveCommerceProps>(function StandaloneLiveCommerce(
  {
    storeName = '',
    onIntent,
    sessionActive = true,
    emitNavigationIntents = false,
    priceUnit = 'auto',
    className,
    isTranscriptEnabled,
    onToggleTranscript,
  },
  ref,
) {
  const initialSaved = useRef<Partial<PersistedCommerceSession> | null>(null);
  if (initialSaved.current === null) {
    initialSaved.current = getSavedSession();
  }

  const [stage, setStage] = useState<Stage>(() => {
    if (initialSaved.current?.stage) {
      return initialSaved.current.stage;
    }
    return 'idle';
  });
  const [products, setProducts] = useState<Product[]>(() => {
    if (initialSaved.current?.products && initialSaved.current.products.length > 0) {
      return initialSaved.current.products;
    }
    return [];
  });
  const [page, setPage] = useState(() => initialSaved.current?.page ?? 0);
  const [minimized, setMinimized] = useState(() => initialSaved.current?.minimized ?? false);
  const [active, setActive] = useState<Product | null>(() => {
    if (initialSaved.current?.activeId && initialSaved.current?.products) {
      return initialSaved.current.products.find(p => p.id === initialSaved.current?.activeId) ?? null;
    }
    return null;
  });
  const [selections, setSelections] = useState<Record<string, string>>(() => initialSaved.current?.selections ?? {});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [checkout, setCheckout] = useState<CheckoutState | null>(() => initialSaved.current?.checkout ?? null);
  const [order, setOrder] = useState<OrderState | null>(() => initialSaved.current?.order ?? null);
  const [isVoiceActive, setIsVoiceActive] = useState(() => initialSaved.current?.isVoiceActive ?? true);
  const [isTranscriptActive, setIsTranscriptActive] = useState<boolean>(() => {
    if (typeof isTranscriptEnabled === 'boolean') return isTranscriptEnabled;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('live_transcript_enabled_v1');
        if (saved !== null) return saved === 'true';
      } catch {}
    }
    return true;
  });

  useEffect(() => {
    if (typeof isTranscriptEnabled === 'boolean') {
      setIsTranscriptActive(isTranscriptEnabled);
    }
  }, [isTranscriptEnabled]);

  const handleToggleTranscript = () => {
    const next = !isTranscriptActive;
    setIsTranscriptActive(next);
    onToggleTranscript?.(next);
    try {
      localStorage.setItem('live_transcript_enabled_v1', String(next));
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('live-commerce:toggle-transcript', {
          detail: { enabled: next },
        })
      );
    }
  };

  const [isImageSheetOpen, setIsImageSheetOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>(() => initialSaved.current?.uploadedImages ?? []);
  const [isSendingImages, setIsSendingImages] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [deliveredImage, setDeliveredImage] = useState<string | null>(
    () => initialSaved.current?.deliveredImage ?? null
  );
  const [toast, setToast] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState(false);
  const lastRaw = useRef<Raw>(null);
  const toastT = useRef<any>(null);
  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;

  // Persist session across page changes and navigation
  useEffect(() => {
    if (stage === 'idle' && products.length === 0) return;
    saveSession({
      stage,
      products,
      page,
      minimized,
      activeId: active?.id ?? null,
      selections,
      checkout,
      order,
      isVoiceActive,
      uploadedImages,
      deliveredImage,
    });
  }, [stage, products, page, minimized, active, selections, checkout, order, isVoiceActive, uploadedImages, deliveredImage]);

  // Sync session across browser tabs/navigation events
  useEffect(() => {
    const handleStorage = () => {
      const saved = getSavedSession();
      if (!saved) return;
      if (saved.stage) setStage(saved.stage);
      if (saved.products) setProducts(saved.products);
      if (typeof saved.page === 'number') setPage(saved.page);
      if (typeof saved.minimized === 'boolean') setMinimized(saved.minimized);
      if (saved.activeId && saved.products) {
        setActive(saved.products.find(p => p.id === saved.activeId) ?? null);
      }
      if (saved.selections) setSelections(saved.selections);
      if (saved.checkout !== undefined) setCheckout(saved.checkout);
      if (saved.order !== undefined) setOrder(saved.order);
      if (saved.uploadedImages) setUploadedImages(saved.uploadedImages);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('popstate', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('popstate', handleStorage);
    };
  }, []);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 480 : false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const perPage = isMobile ? 2 : 4;
  const pages = Math.max(1, Math.ceil(products.length / perPage));

  useEffect(() => {
    setPage(p => Math.min(p, Math.max(0, pages - 1)));
  }, [pages]);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        setPage(p => Math.min(pages - 1, p + 1));
      } else {
        setPage(p => Math.max(0, p - 1));
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const emit = useCallback((i: CommerceIntent) => onIntentRef.current?.(i), []);
  const nav = useCallback((i: CommerceIntent) => { if (emitNavigationIntents) onIntentRef.current?.(i); }, [emitNavigationIntents]);
  const say = useCallback((m: string) => {
    setToast(m); clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remainingSlots = 4 - uploadedImages.length;
    if (remainingSlots <= 0) {
      say('Maximum 4 images allowed');
      return;
    }
    const toProcess = Array.from(files).slice(0, remainingSlots);
    toProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target?.result as string;
        if (result) {
          setUploadedImages(prev => {
            if (prev.length >= 4) return prev;
            return [...prev, result];
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const sendImages = () => {
    if (uploadedImages.length === 0 || isSendingImages) return;
    setIsSendingImages(true);
    setTimeout(() => {
      setIsSendingImages(false);
      setUploadedImages([]);
    }, 550);
  };

  const toggleVoice = useCallback(() => {
    setIsVoiceActive(v => {
      const next = !v;
      say(next ? 'Touchless voice listening' : 'Touchless voice stopped');
      return next;
    });
  }, [say]);

  useEffect(() => {
    if (document.getElementById('lc-style')) return;
    const el = document.createElement('style');
    el.id = 'lc-style';
    el.textContent = `.${NO_SB}{scrollbar-width:none;-ms-overflow-style:none}.${NO_SB}::-webkit-scrollbar{display:none;width:0}`;
    document.head.appendChild(el);
  }, []);

  useEffect(() => { setPriceUnit(priceUnit); }, [priceUnit]);

  useEffect(() => {
    const handleTryon = (e: any) => {
      const imgUrl = e.detail?.imageUrl;
      if (imgUrl) {
        setDeliveredImage(imgUrl);
        setIsImageSheetOpen(true);
        say('Virtual try-on result ready');
      }
    };
    const handleLiveResult = (e: any) => {
      const raw = e.detail?.raw;
      if (raw) {
        ingest(raw);
      }
    };
    window.addEventListener('live-commerce:tryon-result', handleTryon);
    window.addEventListener('live-commerce:result', handleLiveResult);
    return () => {
      window.removeEventListener('live-commerce:tryon-result', handleTryon);
      window.removeEventListener('live-commerce:result', handleLiveResult);
    };
  }, [say, ingest]);

  useEffect(() => {
    if (!sessionActive) {
      setStage('idle'); setProducts([]); setPage(0); setMinimized(false); setActive(null);
      setSelections({}); setShowAll({}); setCheckout(null); setOrder(null);
      setPendingAdd(false); lastRaw.current = null;
    }
  }, [sessionActive]);

  const backFrom = useCallback((s: Stage): Stage => {
    if (s === 'options') return 'detail';
    return products.length ? 'discovery' : 'idle';
  }, [products.length]);

  const ingest = useCallback((raw: Raw, hint?: { view?: View }): RoutedResult => {
    const routed = routeResult(raw, hint);
    lastRaw.current = raw;
    switch (routed.view) {
      case 'discovery':
        setProducts(routed.products); setPage(0); setMinimized(false); setStage('discovery');
        break;
      case 'detail':
        setActive(routed.product); setSelections({}); setShowAll({});
        if (routed.product) setStage('detail');
        break;
      case 'checkout':
        setCheckout(routed.checkout); setPendingAdd(false); setStage('checkout');
        break;
      case 'complete':
        setOrder(routed.order); setPendingAdd(false); setStage('complete');
        break;
      case 'message':
        if (routed.messages[0]) say(routed.messages[0]);
        break;
      default:
        break;
    }
    return routed;
  }, [say]);

  const matchedVariant = useMemo(() => {
    if (!active?.variants.length) return null;
    const keys = Object.keys(selections);
    if (!keys.length) return null;
    return active.variants.find(v => keys.every(k => v.options[k] === selections[k])) ?? null;
  }, [active, selections]);

  const act = useCallback((intent: CommerceIntent) => {
    switch (intent.type) {
      case 'select_product': {
        const p = normalizeProduct(intent.raw);
        setActive(p); setSelections({}); setShowAll({}); setStage('detail');
        nav(intent);
        return;
      }
      case 'add_to_cart':
        setPendingAdd(true);
        setTimeout(() => {
          setPendingAdd(false);
        }, 300);
        break;
      case 'continue_browsing':
        setStage(products.length ? 'discovery' : 'idle');
        nav(intent);
        return;
      case 'close':
        setStage(backFrom(stage));
        nav(intent);
        return;
      default:
        break;
    }
    emit(intent);
  }, [products.length, stage, backFrom, emit, nav, say]);

  const reset = useCallback(() => {
    setStage('idle'); setProducts([]); setPage(0); setMinimized(false); setActive(null);
    setSelections({}); setShowAll({}); setCheckout(null); setOrder(null);
    setPendingAdd(false); lastRaw.current = null;
    removeSavedSession();
  }, []);

  const clearResults = useCallback(() => {
    setProducts([]); setPage(0); setMinimized(false);
    setStage('idle');
    removeSavedSession();
  }, []);

  const snapshot = useCallback((): CommerceSnapshot => ({
    stage,
    minimized,
    resultCount: products.length,
    page: page + 1,
    pages,
    activeProduct: active ? {
      id: active.id,
      title: active.title,
      seller: active.seller,
      priceLabel: matchedVariant?.priceLabel ?? active.priceLabel,
    } : null,
    selectedOptions: selections,
    selectedVariant: matchedVariant ? { id: matchedVariant.id, label: matchedVariant.label } : null,
    cart: null,
    checkout: checkout ? { mode: checkout.mode, url: checkout.url } : null,
    order: order ? { id: order.id, message: order.message } : null,
    lastRaw: lastRaw.current,
  }), [stage, minimized, products.length, page, pages, active, selections, matchedVariant, checkout, order]);

  useImperativeHandle(ref, () => ({ ingest, act, snapshot, reset }), [ingest, act, snapshot, reset]);

  useEffect(() => {
    const w = window as any;
    w.LiveCommerce = { ingest, act, snapshot, reset };
    return () => { if (w.LiveCommerce?.ingest === ingest) delete w.LiveCommerce; };
  }, [ingest, act, snapshot, reset]);

  useEffect(() => { (window as any).LiveCommerceState = snapshot(); });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (stage === 'detail' || stage === 'options') {
        act({ type: 'close' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stage, act]);

  useEffect(() => { clearTimeout(toastT.current); }, []);

  if (!sessionActive) return null;

  const slice = products.slice(page * perPage, page * perPage + perPage);
  const detailPrice = matchedVariant?.priceLabel ?? active?.priceLabel ?? null;
  const detailMedia = matchedVariant?.media[0] ?? active?.media[0] ?? null;
  const detailAvail = matchedVariant?.availability ?? active?.availability ?? null;

  const openDetail = (p: Product) => {
    setActive(p); setSelections({}); setShowAll({}); setStage('detail');
    nav({ type: 'select_product', raw: p.raw });
  };

  const card = (p: Product) => (
    <button
      key={p.id}
      type="button"
      onClick={() => openDetail(p)}
      aria-label={`${p.title}, ${p.priceLabel ?? 'Price unavailable'}${p.compareLabel ? `, formerly ${p.compareLabel}` : ''}${p.badge ? `, ${p.badge}` : ''}`}
      className="relative flex w-full shrink-0 flex-col overflow-hidden rounded-xl bg-zinc-50 text-left text-zinc-900 transition-transform hover:-translate-y-0.5 active:scale-[0.98] shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {p.badge && <Badge text={p.badge} tone={badgeTone(p)} />}
      <span className="h-20 sm:h-24 w-full overflow-hidden bg-white flex items-center justify-center p-1.5 block shrink-0">
        <Thumb p={p} className="h-full w-full object-contain" />
      </span>
      <div className="flex flex-1 flex-col gap-1 p-2 pt-1 w-full">
        <span className="line-clamp-1 text-[11px] font-semibold leading-tight">
          {p.title}
        </span>
        {p.seller ? (
          <span className="truncate text-[9px] text-zinc-500">{p.seller}</span>
        ) : null}
        <Stars rating={p.rating} reviews={p.reviews} />
        <span className="mt-auto flex items-baseline gap-1.5">
          <span className="text-xs font-extrabold">{p.priceLabel ?? '—'}</span>
          {p.compareLabel && <s className="text-[10px] text-zinc-400">{p.compareLabel}</s>}
        </span>
      </div>
    </button>
  );

  return (
    <div className={cx('pointer-events-none fixed inset-0 z-30 text-zinc-100', className)} data-stage={stage}>
      {/* ── 1 · DISCOVERY — sleek restrained floating bar at bottom ── */}
      <AnimatePresence>
        {stage === 'discovery' && !minimized && (
          <motion.div
            key="shelf"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="pointer-events-auto absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 w-[min(calc(100vw-1.5rem),520px)] rounded-2xl border border-white/15 bg-black/90 p-2 sm:p-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-3 px-1.5 pb-2">
              <span className="text-[11px] font-extrabold tracking-[0.16em] text-white/95 uppercase truncate shrink-0">
                {storeName}
              </span>

              {/* Center touchless voice visualizer (where red oval was marked) */}
              <div className="flex-1 flex justify-center px-2">
                <VoiceVisualizer active={isVoiceActive} onToggle={toggleVoice} onStatusChange={say} />
              </div>

              {/* Controls without item count labels */}
              <span className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  aria-label="Minimize results"
                  className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 cursor-pointer"
                >
                  <ChevronDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={clearResults}
                  aria-label="Clear results"
                  className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </span>
            </div>

            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className={cx('grid gap-2 pb-1 select-none', perPage === 2 ? 'grid-cols-2' : 'grid-cols-4')}
            >
              {slice.map(card)}
            </div>

            {/* Bottom navigation row with arrows/dots and image sending icon at bottom right */}
            <div className="relative flex items-center justify-center pt-2 min-h-[28px]">
              <div className="flex items-center justify-center gap-2.5 md:gap-3.5">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                  aria-label="Previous products"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="flex gap-1.5">
                  {Array.from({ length: pages }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      aria-label={`Page ${i + 1}`}
                      className={cx('h-1.5 rounded-full transition-all cursor-pointer', i === page ? 'w-4 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/60')}
                    />
                  ))}
                </span>
                <button
                  type="button"
                  disabled={page >= pages - 1}
                  onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
                  className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                  aria-label="Next products"
                >
                  <ChevronRight size={13} />
                </button>
              </div>

              {/* Bottom right: Image sending icon button */}
              <button
                type="button"
                onClick={() => setIsImageSheetOpen(o => !o)}
                aria-label="Visual exchange and image upload"
                title={isImageSheetOpen ? 'Close visual exchange' : 'Upload and send visual references'}
                className={cx(
                  'absolute right-1 bottom-0 grid h-6 w-6 place-items-center rounded-full transition-all cursor-pointer',
                  isImageSheetOpen
                    ? 'bg-white text-zinc-950 scale-105'
                    : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
                )}
              >
                <ImagePlus size={13} />
              </button>
            </div>

            {/* Bottom Drawer Tray (maximum height 55px, comes out from the bottom, 1px padding all around) */}
            <AnimatePresence>
              {isImageSheetOpen && (
                <motion.div
                  key="bottom-image-tray"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 52, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="mt-1.5 h-[52px] max-h-[55px] w-full overflow-hidden rounded-xl border-t border-white/10 bg-transparent p-[1px] flex items-center gap-2"
                >
                  {/* Delivered Image (shows inside on the left side, clicking expands lightbox) */}
                  {deliveredImage && (
                    <div
                      onClick={() => setPreviewImage(deliveredImage)}
                      className="group relative h-[46px] w-[46px] shrink-0 rounded-lg overflow-hidden border border-white/10 bg-zinc-900 cursor-pointer shadow-xs"
                      title="Click to expand delivered image"
                    >
                      <img
                        src={deliveredImage}
                        alt="Delivered reference"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye size={13} className="text-white" />
                      </div>
                      <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 border border-black" />
                    </div>
                  )}

                  {/* Retracted width or full width Drop Zone seamlessly blended */}
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragging(false);
                      handleFiles(e.dataTransfer.files);
                    }}
                    className={cx(
                      'flex-1 h-[46px] rounded-lg border-0 transition-colors flex items-center justify-between p-[1px] px-2 overflow-hidden',
                      isDragging ? 'bg-white/10' : 'bg-transparent hover:bg-white/[0.04]'
                    )}
                  >
                    <input
                      type="file"
                      id="visual-exchange-file-input"
                      multiple
                      accept="image/*"
                      onChange={e => handleFiles(e.target.files)}
                      className="hidden"
                    />

                    {uploadedImages.length === 0 ? (
                      <label
                        htmlFor="visual-exchange-file-input"
                        className="flex items-center gap-2 w-full h-full cursor-pointer select-none"
                      >
                        <UploadCloud size={15} className="text-white/70 shrink-0" />
                        <span className="text-[10.5px] font-medium text-white/80 truncate">
                          Drop image or tap to browse (max 4)
                        </span>
                      </label>
                    ) : (
                      <div className="flex items-center justify-between w-full h-full gap-1.5">
                        {/* Uploaded thumbnails */}
                        <div className="flex items-center gap-1.5 overflow-x-auto h-full py-0.5">
                          {uploadedImages.map((src, i) => (
                            <div key={i} className="relative h-[40px] w-[40px] shrink-0 rounded-md overflow-hidden border border-white/15 bg-zinc-900 group">
                              <img src={src} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); removeUploadedImage(i); }}
                                className="absolute top-0.5 right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-black/85 text-white hover:bg-red-600 transition-colors cursor-pointer"
                                title="Remove"
                              >
                                <X size={8} />
                              </button>
                            </div>
                          ))}
                          {uploadedImages.length < 4 && (
                            <label
                              htmlFor="visual-exchange-file-input"
                              className="h-[40px] w-[28px] shrink-0 grid place-items-center rounded-md border-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
                              title="Add more images"
                            >
                              <UploadCloud size={13} />
                            </label>
                          )}
                        </div>

                        {/* Send icon (just icon to send, no buttons) */}
                        <button
                          type="button"
                          onClick={sendImages}
                          disabled={isSendingImages}
                          className="grid h-8 w-8 place-items-center rounded-full text-white hover:text-emerald-400 hover:scale-110 active:scale-95 transition-all cursor-pointer shrink-0"
                          title="Send images"
                        >
                          {isSendingImages ? <Loader2 size={15} className="animate-spin text-white" /> : <Send size={15} />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Close icon to retract tray */}
                  <button
                    type="button"
                    onClick={() => setIsImageSheetOpen(false)}
                    className="grid h-6 w-6 place-items-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 mr-0.5"
                    title="Close tray"
                    aria-label="Close tray"
                  >
                    <X size={13} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {stage === 'discovery' && minimized && (
          <motion.div
            key="shelf-pill"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="pointer-events-auto absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/85 py-2 pl-4 pr-2 backdrop-blur-xl shadow-xl"
          >
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-white/85 cursor-pointer uppercase"
            >
              <ChevronUp size={13} />
              <span>{storeName}</span>
              <span className="flex items-center gap-[1.5px] h-2.5 px-0.5">
                <span className="w-[2px] h-2 rounded-full bg-white/70 animate-pulse" />
                <span className="w-[2px] h-3 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.15s' }} />
                <span className="w-[2px] h-1.5 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '0.3s' }} />
              </span>
            </button>
            <button
              type="button"
              onClick={clearResults}
              aria-label="Clear results"
              className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 cursor-pointer"
            >
              <X size={12} />
            </button>
          </motion.div>
        )}

        {stage === 'idle' && (
          <motion.div
            key="idle-pill"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="pointer-events-auto absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-black/90 px-4 py-2.5 backdrop-blur-xl shadow-2xl"
          >
            <span className="text-[11px] font-extrabold tracking-[0.14em] text-white uppercase">
              {storeName}
            </span>
            <VoiceVisualizer active={isVoiceActive} onToggle={toggleVoice} onStatusChange={say} />
            <button
              type="button"
              onClick={() => {
                const defaultRaw = STORE_CATALOG['c1'];
                const routed = defaultRaw ? routeResult(defaultRaw) : null;
                if (routed?.products) setProducts(routed.products);
                setStage('discovery');
                setMinimized(false);
              }}
              className="text-[11px] font-semibold text-white/85 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full cursor-pointer transition-all"
            >
              Browse Catalog
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 2/3 · PRODUCT DETAIL → OPTION/VARIANT SELECTION ──────────────── */}
      <AnimatePresence>
        {(stage === 'detail' || stage === 'options') && active && (
          <motion.div
            key="detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/60 p-4 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) act({ type: 'close' }); }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="relative flex max-h-[88%] w-[min(94%,470px)] flex-col overflow-hidden rounded-3xl bg-zinc-50 text-zinc-900 shadow-2xl"
            >
              {/* Floating Header controls over top of card */}
              <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between gap-2 p-3 bg-gradient-to-b from-black/60 via-black/25 to-transparent pointer-events-none">
                <button
                  type="button"
                  onClick={() => act({ type: 'close' })}
                  aria-label={stage === 'options' ? 'Back to product' : 'Close product'}
                  className="pointer-events-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/50 text-white hover:bg-black/75 backdrop-blur-md cursor-pointer transition-colors"
                >
                  {stage === 'options' ? <ChevronLeft size={16} /> : <X size={16} />}
                </button>
                <span className="truncate text-[11px] font-semibold text-white/95 drop-shadow-sm pr-1">
                  {active.seller ?? ''}
                </span>
              </div>

              <div className={cx('flex min-h-0 flex-1 flex-col overflow-y-auto', NO_SB)}>
                <div
                  onClick={() => detailMedia && setPreviewImage(detailMedia)}
                  className="relative aspect-[4/3] max-h-[40vh] w-full shrink-0 overflow-hidden bg-zinc-100 cursor-zoom-in group select-none"
                  title="Click to expand full image"
                >
                  {active.badge && <Badge text={active.badge} tone={badgeTone(active)} />}

                  {/* Full-bleed image with zero dead space */}
                  {detailMedia ? (
                    <img
                      src={detailMedia}
                      alt={active.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                    />
                  ) : (
                    <Thumb p={active} />
                  )}

                  {/* Expand lightbox button pill */}
                  {detailMedia && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImage(detailMedia);
                      }}
                      className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white/95 backdrop-blur-md hover:bg-black/80 transition-colors cursor-pointer"
                      title="Expand full image"
                    >
                      <Maximize2 size={11} />
                      <span>Expand</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
                  <div>
                    <div className="flex items-start justify-between gap-2.5">
                      <h2 className="text-base font-extrabold leading-snug flex-1">{active.title}</h2>
                      {(active.options.length > 0 || active.variants.length > 0) && (
                        <button
                          type="button"
                          onClick={() => setStage(stage === 'options' ? 'detail' : 'options')}
                          className={cx(
                            'shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold transition-all cursor-pointer shadow-xs',
                            stage === 'options'
                              ? 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300'
                              : 'bg-zinc-900 text-white hover:bg-zinc-800'
                          )}
                        >
                          {stage === 'options' ? 'Product' : `Options · ${active.options.length || active.variants.length}`}
                        </button>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Stars rating={active.rating} reviews={active.reviews} />
                      {detailAvail && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[9.5px] font-bold text-zinc-600">
                          {detailAvail}
                        </span>
                      )}
                      {active.deliveryLabel && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700">
                          {active.deliveryLabel}
                        </span>
                      )}
                    </div>
                  </div>

                {active.description && (
                  <p className="text-xs leading-relaxed text-zinc-600">{active.description}</p>
                )}

                {stage === 'options' && (
                  <div className="flex flex-col gap-3">
                    {active.options.map(g => {
                      const open = !!showAll[g.id];
                      const vals = open ? g.values : g.values.slice(0, OPT_PREVIEW);
                      return (
                        <div key={g.id}>
                          <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">
                            {g.label}{selections[g.label] ? `: ${selections[g.label]}` : ''}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {vals.map(v => (
                              <button
                                key={v.label}
                                type="button"
                                disabled={v.available === false}
                                onClick={() => setSelections(s => ({ ...s, [g.label]: v.label }))}
                                className={cx(
                                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                                  selections[g.label] === v.label ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100',
                                  v.available === false && 'opacity-40 line-through',
                                )}
                              >
                                {v.label}{v.priceLabel ? ` · ${v.priceLabel}` : ''}
                              </button>
                            ))}
                          </div>
                          {g.values.length > OPT_PREVIEW && (
                            <button
                              type="button"
                              onClick={() => setShowAll(s => ({ ...s, [g.id]: !open }))}
                              className="mt-1.5 text-[10px] font-bold text-zinc-500 underline hover:text-zinc-800 cursor-pointer"
                            >
                              {open ? 'Show fewer' : `Show all ${g.values.length} ${g.label.toLowerCase()}s`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {active.variants.length > 0 && (() => {
                      const open = !!showAll.__variants;
                      const list = open ? active.variants : active.variants.slice(0, VARIANT_PREVIEW);
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Variants</div>
                          {list.map(v => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setSelections(v.options)}
                              className={cx(
                                'flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs cursor-pointer',
                                matchedVariant?.id === v.id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100',
                              )}
                            >
                              <span className="font-semibold">{v.label}</span>
                              <span className="flex items-center gap-2">
                                {v.availability && <span className="opacity-70">{v.availability}</span>}
                                <span className="font-extrabold">{v.priceLabel ?? ''}</span>
                              </span>
                            </button>
                          ))}
                          {active.variants.length > VARIANT_PREVIEW && (
                            <button
                              type="button"
                              onClick={() => setShowAll(s => ({ ...s, __variants: !open }))}
                              className="mt-0.5 text-[10px] font-bold text-zinc-500 underline hover:text-zinc-800 cursor-pointer"
                            >
                              {open ? 'Show fewer' : `Show all ${active.variants.length} variants`}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
                </div>
              </div>

              {/* Sticky footer */}
              <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
                <span className="text-lg font-black">{detailPrice ?? '—'}</span>
                <button
                  type="button"
                  disabled={pendingAdd}
                  onClick={() => act({ type: 'add_to_cart', raw: active.raw, variantRaw: matchedVariant?.raw ?? null, selectedOptions: selections })}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-extrabold text-white hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                >
                  {pendingAdd ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
                  {pendingAdd ? 'Adding…' : 'Add to bag'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 6 · CHECKOUT CONTINUATION / EMBED ───────────────────────────── */}
      <AnimatePresence>
        {stage === 'checkout' && checkout && (
          <motion.div
            key="checkout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0 }}
              className="flex max-h-[88%] w-[min(96%,760px)] flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-50 text-zinc-900 shadow-2xl"
            >
              <div className="flex items-center gap-3 bg-zinc-950 px-4 py-3 text-white">
                <Store size={16} className="shrink-0 text-green-400" />
                <span className="flex-1 truncate text-xs font-extrabold tracking-[0.08em]">MERCHANT CHECKOUT</span>
                {checkout.progress.map(s => (
                  <span key={s} className="rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] font-bold">{s}</span>
                ))}
                <button
                  type="button"
                  onClick={() => act({ type: 'close' })}
                  aria-label="Back"
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
              {checkout.messages.length > 0 && (
                <div className="border-b border-zinc-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
                  {checkout.messages.join(' · ')}
                </div>
              )}
              {checkout.url ? (
                <iframe
                  src={checkout.url}
                  title="Merchant checkout"
                  allow="payment; autoplay; camera; microphone"
                  className="min-h-[320px] w-full flex-1 border-0 bg-white"
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-xs text-zinc-500">
                  {checkout.messages[0] ?? 'Loading checkout...'}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 7 · ORDER COMPLETION ────────────────────────────────────────── */}
      <AnimatePresence>
        {stage === 'complete' && order && (
          <motion.div
            key="complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className={cx('flex w-[min(92%,400px)] flex-col items-center gap-3 overflow-y-auto rounded-3xl bg-zinc-50 p-6 text-center text-zinc-900 shadow-2xl max-h-[86%]', NO_SB)}
            >
              <CheckCircle2 size={44} className="text-emerald-500" />
              <h2 className="text-lg font-black">Order complete</h2>
              {order.id && (
                <div className="rounded-full bg-zinc-200 px-3 py-1 font-mono text-[11px] font-bold text-zinc-700">
                  {order.id}
                </div>
              )}
              {order.message && <p className="text-xs leading-relaxed text-zinc-600">{order.message}</p>}
              {order.details.length > 0 && (
                <div className="w-full flex-col gap-1 rounded-2xl bg-zinc-100 p-3">
                  {order.details.map(d => (
                    <div key={d.label} className="flex justify-between text-[11px] text-zinc-600">
                      <span>{d.label}</span>
                      <b className="text-zinc-900">{d.display}</b>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => act({ type: 'continue_browsing' })}
                className="mt-1 w-full rounded-xl bg-zinc-900 py-3 text-sm font-extrabold text-white hover:bg-zinc-800 cursor-pointer"
              >
                Back to browsing
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast (merchant messages) ───────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ y: -14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-bold text-zinc-900 shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox Modal for enlarged image preview */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-md cursor-zoom-out"
          >
            <div
              className="relative max-h-[85vh] max-w-[85vw] rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-zinc-950"
              onClick={e => e.stopPropagation()}
            >
              <img src={previewImage} alt="Enlarged reference" className="max-h-[80vh] max-w-[85vw] object-contain" />
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                aria-label="Close preview"
                className="absolute top-2.5 right-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white hover:bg-black transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default StandaloneLiveCommerce;
