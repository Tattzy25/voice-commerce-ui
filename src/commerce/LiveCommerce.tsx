/**
 * commerce/LiveCommerce.tsx — the whole commerce rendering surface integrated into the chat shell.
 *
 * It owns RENDERING ONLY:
 *   · displays collections of the store at load (Arrow 6)
 *   · product discovery cards & shelves
 *   · product detail & option/variant selector
 *   · cart confirmation
 *   · bag review with line item quantity management
 *   · checkout embed / continuation
 *   · order completion
 *
 * Data flows strictly through defined interfaces (ingest / snapshot / onIntent).
 * ZERO server-side errors thrown to customer.
 */
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Minus, Plus, Trash2,
  ShoppingBag, CheckCircle2, Loader2, Store, ExternalLink, Sparkles,
} from 'lucide-react';
import type {
  Raw, Stage, View, Product, CartLine, LabelValue, CartState, CheckoutState, OrderState,
  CommerceIntent, CommerceSnapshot, LiveCommerceHandle, RoutedResult,
  StoreCollection,
} from './types';
import { routeResult } from './route';
import { normalizeProduct, setPriceUnit } from './resolve';

export const PER_PAGE = 4;
const OPT_PREVIEW = 8;
const VARIANT_PREVIEW = 6;

export interface LiveCommerceProps {
  /** Store name for dynamic greeting */
  storeName?: string;
  /** Initial collections to display at load (Arrow 6) */
  collections?: StoreCollection[];
  /** Initial cart payload if provided */
  initialCart?: Raw;
  /** Intents flow out to the host here */
  onIntent?: (intent: CommerceIntent) => void;
  /** Tie the layer to the call/session: false → full reset */
  sessionActive?: boolean;
  /** Also emit pure-UI navigation intents (default false) */
  emitNavigationIntents?: boolean;
  /** 'auto' | 'minor' | 'major' */
  priceUnit?: 'auto' | 'minor' | 'major';
  className?: string;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const initials = (s: string) => s.split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '•';

const NO_SB = 'lc-no-sb';

function Thumb({ p, className }: { p: Product; className?: string }) {
  const src = p.media[0];
  if (src) return <img src={src} alt={p.title} referrerPolicy="no-referrer" className={cx('w-full h-full object-cover', className)} />;
  const h = hash(p.title) % 360;
  return (
    <div
      className={cx('w-full h-full grid place-items-center font-extrabold text-zinc-500', className)}
      style={{ background: `linear-gradient(135deg, hsl(${h} 28% 90%), hsl(${(h + 42) % 360} 26% 78%))`, fontSize: 'clamp(14px,3vw,26px)' }}
      aria-hidden
    >
      {initials(p.title)}
    </div>
  );
}

function Stars({ rating, reviews }: { rating: number | null; reviews: number | null }) {
  if (rating == null) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] leading-none">
      <span className="relative text-zinc-500 tracking-[1px]">
        ★★★★★
        <span className="absolute inset-0 overflow-hidden whitespace-nowrap text-amber-400" style={{ width: `${(rating / 5) * 100}%` }}>★★★★★</span>
      </span>
      {reviews != null && <span className="text-zinc-400 text-[9px]">({reviews})</span>}
    </div>
  );
}

const Badge = ({ text, tone }: { text: string; tone?: 'sale' | 'new' | 'stock' }) => (
  <span className={cx(
    'absolute top-1.5 left-1.5 z-10 rounded-full px-1.5 py-0.5 text-[8.5px] font-extrabold tracking-[0.08em] text-white shadow-sm',
    tone === 'sale' ? 'bg-pink-600' : tone === 'new' ? 'bg-emerald-600' : 'bg-zinc-800/95',
  )}>
    {text}
  </span>
);

const badgeTone = (p: Product): 'sale' | 'new' | 'stock' | undefined =>
  p.badge ? (/sale|deal|off/i.test(p.badge) ? 'sale' : /new/i.test(p.badge) ? 'new' : undefined) : undefined;

/* ═══════════════════════════════════════════════════════════════════════ */
const LiveCommerce = forwardRef<LiveCommerceHandle, LiveCommerceProps>(function LiveCommerce(
  {
    storeName = 'Nba0ey Th',
    collections = [],
    initialCart,
    onIntent,
    sessionActive = true,
    emitNavigationIntents = false,
    priceUnit = 'auto',
    className,
  },
  ref,
) {
  const [stage, setStage] = useState<Stage>('idle');
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [active, setActive] = useState<Product | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<CartState | null>(() => {
    if (initialCart) {
      const routed = routeResult(initialCart, { view: 'cart' });
      return routed.cart;
    }
    return null;
  });
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [order, setOrder] = useState<OrderState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState(false);
  const lastRaw = useRef<Raw>(null);
  const toastT = useRef<any>(null);
  const collectionsRef = useRef<HTMLDivElement>(null);
  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;

  const pages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  const emit = useCallback((i: CommerceIntent) => onIntentRef.current?.(i), []);
  const nav = useCallback((i: CommerceIntent) => { if (emitNavigationIntents) onIntentRef.current?.(i); }, [emitNavigationIntents]);
  const say = useCallback((m: string) => {
    setToast(m); clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2400);
  }, []);

  /* stylesheet injection */
  useEffect(() => {
    if (document.getElementById('lc-style')) return;
    const el = document.createElement('style');
    el.id = 'lc-style';
    el.textContent = `.${NO_SB}{scrollbar-width:none;-ms-overflow-style:none}.${NO_SB}::-webkit-scrollbar{display:none;width:0}`;
    document.head.appendChild(el);
  }, []);

  useEffect(() => { setPriceUnit(priceUnit); }, [priceUnit]);

  // Sync initial cart if provided and cart is empty
  useEffect(() => {
    if (initialCart && !cart) {
      const routed = routeResult(initialCart, { view: 'cart' });
      if (routed.cart) setCart(routed.cart);
    }
  }, [initialCart, cart]);

  /* Reset if session deactivated */
  useEffect(() => {
    if (!sessionActive) {
      setStage('idle'); setProducts([]); setPage(0); setMinimized(false); setActive(null);
      setSelections({}); setShowAll({}); setCart(null); setCheckout(null); setOrder(null);
      setPendingAdd(false); lastRaw.current = null;
    }
  }, [sessionActive]);

  const backFrom = useCallback((s: Stage): Stage => {
    if (s === 'options') return 'detail';
    if (s === 'checkout') return products.length ? 'discovery' : 'idle';
    return products.length ? 'discovery' : 'idle';
  }, [products.length]);

  /* ── data in ─────────────────────────────────────────────────────────── */
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
      case 'cartConfirm':
        setCart(routed.cart); setPendingAdd(false);
        break;
      case 'cart':
        setCart(routed.cart);
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
      case 'unknown':
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

  const updateCartTotals = (lines: CartLine[]): LabelValue[] => {
    let subtotalCents = 0;
    for (const l of lines) {
      const qty = l.qty ?? 1;
      let priceCents = 0;
      if (l.raw && typeof l.raw === 'object' && typeof l.raw.price === 'number') {
        priceCents = l.raw.price;
      } else if (l.priceLabel) {
        const num = parseFloat(l.priceLabel.replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) priceCents = Math.round(num * 100);
      }
      subtotalCents += priceCents * qty;
    }
    const taxCents = Math.round(subtotalCents * 0.08);
    const totalCents = subtotalCents + taxCents;
    const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

    if (lines.length === 0) {
      return [
        { label: 'Subtotal', display: '$0.00', raw: { amount: 0 } },
        { label: 'Total', display: '$0.00', raw: { amount: 0 } },
      ];
    }

    return [
      { label: 'Subtotal', display: fmt(subtotalCents), raw: { amount: subtotalCents } },
      { label: 'Estimated Tax', display: fmt(taxCents), raw: { amount: taxCents } },
      { label: 'Total', display: fmt(totalCents), raw: { amount: totalCents } },
    ];
  };

  /* ── intents out ─────────────────────────────────────────────────────── */
  const act = useCallback((intent: CommerceIntent) => {
    switch (intent.type) {
      case 'select_product': {
        const p = normalizeProduct(intent.raw);
        setActive(p); setSelections({}); setShowAll({}); setStage('detail');
        nav(intent);
        return;
      }
      case 'select_collection':
        emit(intent);
        return;
      case 'add_to_cart': {
        setPendingAdd(true);
        const rawItem = intent.variantRaw || intent.raw;
        const lineTitle = active?.title ?? 'Product';
        const linePrice = matchedVariant?.priceLabel ?? active?.priceLabel ?? null;
        const lineMedia = matchedVariant?.media?.[0] ?? active?.media?.[0] ?? null;
        const lineOpt = intent.selectedOptions
          ? Object.entries(intent.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(', ')
          : null;

        const newLine: CartLine = {
          id: `line_${Date.now()}`,
          raw: rawItem,
          title: lineTitle,
          media: lineMedia,
          qty: 1,
          optionsLabel: lineOpt || null,
          priceLabel: linePrice,
        };

        setCart(prev => {
          const currentLines = prev?.lines || [];
          const existingIdx = currentLines.findIndex(
            l => l.title === lineTitle && l.optionsLabel === (lineOpt || null)
          );
          let newLines: CartLine[];
          if (existingIdx >= 0) {
            newLines = currentLines.map((l, i) =>
              i === existingIdx ? { ...l, qty: (l.qty ?? 1) + 1 } : l
            );
          } else {
            newLines = [newLine, ...currentLines];
          }
          return {
            raw: prev?.raw || {},
            lines: newLines,
            totals: updateCartTotals(newLines),
            messages: [],
            recommendations: prev?.recommendations || [],
          };
        });

        setTimeout(() => {
          setPendingAdd(false);
          say('Added to bag');
        }, 200);

        emit(intent);
        return;
      }
      case 'remove_line': {
        setCart(prev => {
          if (!prev) return null;
          const targetId = intent.lineRaw && typeof intent.lineRaw === 'object'
            ? (intent.lineRaw.id ?? intent.lineRaw.line_id)
            : intent.lineRaw;

          const updatedLines = prev.lines.filter(l => {
            if (intent.lineRaw && l.raw === intent.lineRaw) return false;
            if (targetId && (l.id === targetId || (l.raw && (l.raw.id === targetId || l.raw.line_id === targetId)))) return false;
            return true;
          });

          return {
            ...prev,
            lines: updatedLines,
            totals: updateCartTotals(updatedLines),
          };
        });
        emit(intent);
        return;
      }
      case 'update_qty': {
        if (intent.qty !== undefined) {
          const targetQty = intent.qty;
          setCart(prev => {
            if (!prev) return null;
            if (targetQty <= 0) {
              const updatedLines = prev.lines.filter(l => l.raw !== intent.lineRaw && l.id !== intent.lineRaw?.id);
              return { ...prev, lines: updatedLines, totals: updateCartTotals(updatedLines) };
            }
            const updatedLines = prev.lines.map(l => {
              const match = l.raw === intent.lineRaw || (intent.lineRaw && (l.id === intent.lineRaw.id || l.id === intent.lineRaw.line_id));
              if (match) {
                return { ...l, qty: targetQty };
              }
              return l;
            });
            return {
              ...prev,
              lines: updatedLines,
              totals: updateCartTotals(updatedLines),
            };
          });
        }
        emit(intent);
        return;
      }
      case 'open_cart':
        // No shopping cart UI is shown
        emit(intent);
        nav(intent);
        return;
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
  }, [active, matchedVariant, cart, products.length, stage, backFrom, emit, nav]);

  const reset = useCallback(() => {
    setStage('idle'); setProducts([]); setPage(0); setMinimized(false); setActive(null);
    setSelections({}); setShowAll({}); setCart(null); setCheckout(null); setOrder(null);
    setPendingAdd(false); lastRaw.current = null;
  }, []);

  const clearResults = useCallback(() => {
    setProducts([]); setPage(0); setMinimized(false); setStage('idle');
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
    cart: cart ? {
      lines: cart.lines.length,
      units: cart.lines.reduce((n, l) => n + (l.qty ?? 1), 0),
      totals: cart.totals,
      messages: cart.messages,
    } : null,
    checkout: checkout ? { mode: checkout.mode, url: checkout.url } : null,
    order: order ? { id: order.id, message: order.message } : null,
    lastRaw: lastRaw.current,
  }), [stage, minimized, products.length, page, pages, active, selections, matchedVariant, cart, checkout, order]);

  useImperativeHandle(ref, () => ({ ingest, act, snapshot, reset }), [ingest, act, snapshot, reset]);

  /* Global bridges for external servers */
  useEffect(() => {
    const w = window as any;
    w.LiveCommerce = { ingest, act, snapshot, reset };
    return () => { if (w.LiveCommerce?.ingest === ingest) delete w.LiveCommerce; };
  }, [ingest, act, snapshot, reset]);

  useEffect(() => { (window as any).LiveCommerceState = snapshot(); });

  const detailPrice = matchedVariant?.priceLabel ?? active?.priceLabel ?? null;
  const detailMedia = matchedVariant?.media[0] ?? active?.media[0] ?? null;
  const detailAvail = matchedVariant?.availability ?? active?.availability ?? null;
  const cartUnits = cart?.lines.reduce((n, l) => n + (l.qty ?? 1), 0) ?? 0;

  const openDetail = (p: Product) => {
    setActive(p); setSelections({}); setShowAll({}); setStage('detail');
    nav({ type: 'select_product', raw: p.raw });
  };

  const scrollCollectionsRight = () => {
    if (collectionsRef.current) {
      collectionsRef.current.scrollBy({ left: 160, behavior: 'smooth' });
    }
  };

  const slice = products.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <div className={cx('relative flex flex-1 w-full min-h-0 flex-col text-zinc-100', className)} data-stage={stage}>
      {/* ── ARROW 5 & 6 · GREETING & INITIAL COLLECTIONS DISPLAY AT LOAD ────── */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2 flex flex-col gap-4">
        {/* Welcome greeting */}
        <div className="pt-1">
          <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
            Welcome to {storeName} <span className="inline-block animate-wave">👋</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            Ask me anything you are interested in.
          </p>
        </div>

        {/* Collections carousel (Arrow 6) */}
        {collections.length > 0 && (
          <div className="relative group/carousel">
            <div
              ref={collectionsRef}
              className={cx('flex gap-3 overflow-x-auto pb-2 pt-1 scroll-smooth snap-x snap-mandatory', NO_SB)}
            >
              {collections.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => act({ type: 'select_collection', collectionId: c.id, collectionTitle: c.title, raw: c })}
                  className="flex flex-col items-center shrink-0 w-[124px] snap-start group text-left cursor-pointer transition-transform hover:-translate-y-1 active:scale-95"
                >
                  <div className="relative w-[124px] h-[124px] rounded-[22px] overflow-hidden bg-zinc-900 border border-white/10 shadow-md">
                    <img
                      src={c.image}
                      alt={c.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                  </div>
                  <span className="mt-2 text-[11.5px] font-semibold text-zinc-200 text-center line-clamp-2 leading-tight px-1 group-hover:text-white transition-colors">
                    {c.title}
                  </span>
                </button>
              ))}
            </div>

            {/* Floating arrow navigation button on right (as seen in screenshot 1) */}
            <button
              type="button"
              onClick={scrollCollectionsRight}
              aria-label="View more collections"
              className="absolute right-0 top-[48px] -translate-y-1/2 z-10 grid h-8 w-8 place-items-center rounded-full bg-zinc-900/90 text-white shadow-lg border border-white/20 backdrop-blur-md hover:bg-zinc-800 active:scale-95 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── ARROW 6 continued: PRODUCT DISCOVERY RESULTS ────────────────── */}
        <AnimatePresence>
          {stage === 'discovery' && products.length > 0 && !minimized && (
            <motion.div
              key="shelf"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="mt-2 flex flex-col rounded-2xl border border-white/15 bg-zinc-900/95 p-3 shadow-xl backdrop-blur-xl"
            >
              <div className="flex items-center justify-between pb-2 px-1">
                <span className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.14em] text-white/90">
                  <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  RECOMMENDED ITEMS
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400">
                    {products.length} items
                  </span>
                  <button
                    type="button"
                    onClick={() => setMinimized(true)}
                    className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
                    aria-label="Minimize"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={clearResults}
                    className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
                    aria-label="Clear"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* Grid or horizontal scroll */}
              <div className={cx('flex gap-2.5 overflow-x-auto pb-1 snap-x', NO_SB)}>
                {slice.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openDetail(p)}
                    className="relative flex w-[140px] shrink-0 snap-start flex-col gap-1 rounded-xl bg-zinc-950 p-2 text-left border border-white/10 transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    {p.badge && <Badge text={p.badge} tone={badgeTone(p)} />}
                    <span className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-900">
                      <Thumb p={p} />
                    </span>
                    <span className="line-clamp-2 min-h-[2.5em] text-[11px] font-semibold text-zinc-100 leading-tight">
                      {p.title}
                    </span>
                    <Stars rating={p.rating} reviews={p.reviews} />
                    <span className="mt-auto flex items-baseline gap-1.5 pt-1">
                      <span className="text-xs font-black text-white">{p.priceLabel ?? '—'}</span>
                      {p.compareLabel && <s className="text-[9.5px] text-zinc-500">{p.compareLabel}</s>}
                    </span>
                  </button>
                ))}
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 disabled:opacity-30"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="text-[10px] text-zinc-400">
                    {page + 1} / {pages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= pages - 1}
                    onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
                    className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 disabled:opacity-30"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {stage === 'discovery' && minimized && (
            <motion.div
              key="shelf-pill"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => setMinimized(false)}
                className="flex items-center gap-1.5 text-xs font-bold text-white"
              >
                <ChevronUp size={14} />
                Products found ({products.length})
              </button>
              <button
                type="button"
                onClick={clearResults}
                className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20"
              >
                <X size={11} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── PRODUCT DETAIL MODAL ────────────────────────────────────────── */}
      <AnimatePresence>
        {(stage === 'detail' || stage === 'options') && active && (
          <motion.div
            key="detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col bg-zinc-950/95 backdrop-blur-md rounded-[28px] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 py-2.5">
              <button
                type="button"
                onClick={() => act({ type: 'close' })}
                className="grid h-7 w-7 place-items-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-white"
                aria-label="Back"
              >
                {stage === 'options' ? <ChevronLeft size={16} /> : <X size={15} />}
              </button>
              <span className="truncate text-[11px] font-semibold text-zinc-400">
                {active.seller ?? storeName}
              </span>
              {stage === 'options' ? (
                <button
                  type="button"
                  onClick={() => setStage('detail')}
                  className="rounded-full bg-zinc-800 px-3 py-1 text-[10px] font-bold text-white hover:bg-zinc-700"
                >
                  Overview
                </button>
              ) : (active.options.length > 0 || active.variants.length > 0) ? (
                <button
                  type="button"
                  onClick={() => setStage('options')}
                  className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-zinc-950 hover:bg-zinc-200"
                >
                  Options
                </button>
              ) : <span className="w-7" />}
            </div>

            <div className={cx('flex-1 overflow-y-auto p-4 flex flex-col gap-3', NO_SB)}>
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-900 border border-white/10">
                {active.badge && <Badge text={active.badge} tone={badgeTone(active)} />}
                {detailMedia ? (
                  <img src={detailMedia} alt={active.title} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                  <Thumb p={active} />
                )}
              </div>

              <div>
                <h2 className="text-base font-extrabold leading-snug text-white">{active.title}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Stars rating={active.rating} reviews={active.reviews} />
                  {detailAvail && (
                    <span className="rounded-full bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                      {detailAvail}
                    </span>
                  )}
                  {active.deliveryLabel && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] font-bold text-zinc-300">
                      {active.deliveryLabel}
                    </span>
                  )}
                </div>
              </div>

              {active.description && (
                <p className="text-xs leading-relaxed text-zinc-400">{active.description}</p>
              )}

              {/* Options selection when active */}
              {stage === 'options' && (
                <div className="flex flex-col gap-3 pt-2">
                  {active.options.map(g => {
                    const open = !!showAll[g.id];
                    const vals = open ? g.values : g.values.slice(0, OPT_PREVIEW);
                    return (
                      <div key={g.id}>
                        <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-zinc-400">
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
                                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                                selections[g.label] === v.label
                                  ? 'border-white bg-white text-zinc-950'
                                  : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800',
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
                            className="mt-1.5 text-[10px] font-bold text-zinc-400 underline hover:text-zinc-200"
                          >
                            {open ? 'Show fewer' : `Show all ${g.values.length}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sticky footer with price + add to bag */}
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
              <div>
                <span className="block text-base font-black text-white">{detailPrice ?? '—'}</span>
                {active.compareLabel && <s className="text-[10px] text-zinc-500">{active.compareLabel}</s>}
              </div>
              <button
                type="button"
                disabled={pendingAdd}
                onClick={() => act({
                  type: 'add_to_cart',
                  raw: active.raw,
                  variantRaw: matchedVariant?.raw ?? null,
                  selectedOptions: selections,
                })}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-2.5 text-xs font-extrabold text-zinc-950 hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-60 transition-transform"
              >
                {pendingAdd ? <Loader2 size={15} className="animate-spin" /> : <ShoppingBag size={15} />}
                {pendingAdd ? 'Adding…' : 'Add to bag'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CHECKOUT VIEW ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {stage === 'checkout' && checkout && (
          <motion.div
            key="checkout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col bg-zinc-950/98 rounded-[28px] overflow-hidden"
          >
            <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2.5 text-white">
              <Store size={15} className="text-emerald-400" />
              <span className="flex-1 truncate text-xs font-bold uppercase tracking-wider">
                MERCHANT CHECKOUT
              </span>
              <button
                type="button"
                onClick={() => act({ type: 'close' })}
                className="grid h-6 w-6 place-items-center rounded-full bg-white/10 hover:bg-white/20"
              >
                <X size={13} />
              </button>
            </div>
            {checkout.url ? (
              <iframe
                src={checkout.url}
                title="Merchant checkout"
                allow="payment; autoplay"
                className="w-full flex-1 border-0 bg-white"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs text-zinc-400">
                {checkout.messages[0] ?? 'Loading checkout...'}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ORDER COMPLETE VIEW ─────────────────────────────────────────── */}
      <AnimatePresence>
        {stage === 'complete' && order && (
          <motion.div
            key="complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center bg-zinc-950/98 rounded-[28px]"
          >
            <CheckCircle2 size={40} className="text-emerald-400 mb-2" />
            <h2 className="text-base font-extrabold text-white">Order Confirmed</h2>
            {order.id && (
              <div className="mt-1 rounded-full bg-zinc-800 px-3 py-1 font-mono text-xs text-zinc-300">
                {order.id}
              </div>
            )}
            {order.message && (
              <p className="mt-2 text-xs text-zinc-400 max-w-xs">{order.message}</p>
            )}
            <button
              type="button"
              onClick={() => act({ type: 'continue_browsing' })}
              className="mt-6 rounded-full bg-white px-6 py-2.5 text-xs font-bold text-zinc-950 hover:bg-zinc-200"
            >
              Continue shopping
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOAST NOTIFICATIONS ─────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-lg z-40"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default LiveCommerce;
