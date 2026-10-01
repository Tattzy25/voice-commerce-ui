/**
 * commerce/resolve.ts — schema-tolerant field resolvers.
 *
 * Recognizes common aliases + nested forms WITHOUT fixing one merchant's shape.
 * Canonical (shallow) fields always win; deep search is the fallback.
 * Everything keeps `raw`. Nothing is invented: absent ⇒ null/[] and the UI
 * hides the slot.
 */
import type {
  Raw, Product, OptionGroup, OptionValue, Variant, CartState, CartLine,
  CheckoutState, OrderState, LabelValue,
} from './types';

const nk = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const isObj = (v: Raw): v is Record<string, Raw> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** shallow (canonical) lookup by alias list */
export function pickShallow(o: Raw, aliases: string[]): Raw {
  if (!isObj(o)) return undefined;
  const map = new Map<string, string>();
  for (const k of Object.keys(o)) map.set(nk(k), k);
  for (const a of aliases) {
    const k = map.get(nk(a));
    if (k !== undefined && o[k] != null && o[k] !== '') return o[k];
  }
  return undefined;
}

/** bounded deep search (BFS) for aliased / nested fields */
export function pickDeep(o: Raw, aliases: string[], maxDepth = 4): Raw {
  const set = new Set(aliases.map(nk));
  const queue: { v: Raw; d: number }[] = [{ v: o, d: 0 }];
  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (d > maxDepth) continue;
    if (isObj(v)) {
      for (const k of Object.keys(v)) {
        if (set.has(nk(k)) && v[k] != null && v[k] !== '') return v[k];
      }
      for (const k of Object.keys(v)) {
        const c = v[k];
        if (isObj(c) || Array.isArray(c)) queue.push({ v: c, d: d + 1 });
      }
    } else if (Array.isArray(v)) {
      for (const c of v) if (isObj(c) || Array.isArray(c)) queue.push({ v: c, d: d + 1 });
    }
  }
  return undefined;
}

export const pick = (o: Raw, aliases: string[], deep = true): Raw => {
  const s = pickShallow(o, aliases);
  return s !== undefined ? s : deep ? pickDeep(o, aliases) : undefined;
};

/* ── primitives ─────────────────────────────────────────────────────────── */
const asString = (v: Raw): string | null => {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
};
const asNumber = (v: Raw): number | null => {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.replace(/[^0-9.\-]/g, '');
    if (m && m !== '-' && !isNaN(parseFloat(m))) return parseFloat(m);
  }
  return null;
};
const asStrings = (v: Raw): string[] => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(asStrings).flat().filter(Boolean);
  const s = asString(v);
  if (s) return [s];
  if (isObj(v)) return [asString(pickShallow(v, ['message', 'text', 'title', 'detail'])) ?? ''].filter(Boolean);
  return [];
};

/** presentation-only money formatting of a RETURNED number + RETURNED currency */
export function money(n: number | null, o: Raw): string | null {
  if (n == null) return null;
  const cur = asString(pick(o, ['currency', 'currency_code', 'currencyCode', 'iso_currency'], false)) ?? 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/* ── media / urls ───────────────────────────────────────────────────────── */
const MEDIA_ALIASES = [
  'image', 'images', 'image_url', 'imageUrl', 'thumbnail', 'thumbnail_url', 'thumbnailUrl',
  'product_image', 'productImage', 'picture', 'pictures', 'photos', 'media_url', 'mediaUrl',
  'hero_image', 'primary_image', 'main_image', 'media', 'url',
];
const urlish = (s: string) => /^(https?:|data:|\/|blob:)/i.test(s);
export function resolveMedia(o: Raw): string[] {
  const v = pick(o, MEDIA_ALIASES);
  const out: string[] = [];
  const push = (x: Raw) => {
    const s = asString(x) ?? (isObj(x) ? asString(pickShallow(x, ['url', 'image', 'src', 'link', 'href'])) : null);
    if (s && urlish(s) && !out.includes(s)) out.push(s);
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (v !== undefined) push(v);
  return out;
}
export const resolveUrl = (o: Raw): string | null => {
  const s = asString(pick(o, ['product_url', 'productUrl', 'permalink', 'canonical_url', 'link', 'url']));
  return s && urlish(s) ? s : null;
};

/* ── identity ───────────────────────────────────────────────────────────── */
export const resolveTitle = (o: Raw): string =>
  asString(pick(o, ['title', 'name', 'product_name', 'productName', 'heading', 'display_name', 'displayName', 'item_name', 'label'])) ?? 'Untitled item';

export const resolveSeller = (o: Raw): string | null => {
  const v = pick(o, ['seller', 'seller_name', 'sellerName', 'merchant', 'merchant_name', 'merchantName', 'merchant_display_name', 'store', 'store_name', 'storeName', 'storefront', 'storefront_name', 'domain', 'brand', 'shop', 'shop_name', 'shop_title', 'shopify_store', 'vendor', 'store_domain', 'sold_by', 'soldBy', 'site', 'site_name']);
  if (isObj(v)) {
    return asString(pickShallow(v, ['name', 'display_name', 'displayName', 'title', 'store_name', 'shop_name']))
      ?? asString(pickShallow(v, ['domain', 'url', 'hostname']));
  }
  return asString(v);
};

/* ── price (render returned values only) ──────────────────────────────────
   Minor-unit handling: many platforms return integer minor units (100 = $1.00,
   26999 = $269.99). Resolution order:
     1 · merchant display string (never touched)
     2 · explicit unit hint on the object (unit/scale/minor_units/in_cents/…
         or a key named *_cents / *_minor)
     3 · host override via setPriceUnit('minor' | 'major')
     4 · auto: INTEGER value ⇒ minor units (÷100); fractional ⇒ major
   This is presentation of returned amounts, not commerce math.            */
let PRICE_UNIT: 'auto' | 'minor' | 'major' = 'auto';
export const setPriceUnit = (m: 'auto' | 'minor' | 'major') => { PRICE_UNIT = m; };
export const getPriceUnit = () => PRICE_UNIT;

const UNIT_HINT_KEYS = ['price_unit', 'priceUnit', 'unit', 'amount_unit', 'amountUnit', 'scale', 'minor_units', 'minorUnits', 'in_cents', 'inCents'];
function unitMode(o: Raw, v: Raw): 'minor' | 'major' | null {
  if (isObj(o)) {
    const h = pickShallow(o, UNIT_HINT_KEYS);
    if (h != null) {
      const s = String(h).toLowerCase();
      if (/cent|minor|subunit|^2$/.test(s)) return 'minor';
      if (/major|whole|dollar|unit|^0$|^1$/.test(s)) return 'major';
    }
  }
  if (PRICE_UNIT !== 'auto') return PRICE_UNIT;
  // auto: integers are minor units, anything with a fraction is major
  if (typeof v === 'number') return Number.isInteger(v) ? 'minor' : 'major';
  if (typeof v === 'string') return /^\s*-?\d+\s*$/.test(v) ? 'minor' : 'major';
  return null;
}
function priceFrom(v: Raw, o: Raw): string | null {
  if (v == null) return null;
  const display = isObj(v) ? asString(pickShallow(v, ['display', 'formatted', 'formatted_amount', 'price_display', 'text'])) : null;
  if (display) return display;
  let src = v; let cur: Raw = o;
  if (isObj(v)) { src = pickShallow(v, ['amount', 'value', 'price', 'number']); cur = v; }
  const n = asNumber(src);
  if (n == null) return null;
  const mode = unitMode(o, src);
  return money(mode === 'minor' ? n / 100 : n, cur);
}
export function resolvePriceLabel(o: Raw): string | null {
  const display = asString(pick(o, ['price_display', 'priceDisplay', 'formatted_price', 'formattedPrice', 'display_price', 'price_string', 'price_text', 'price_formatted']));
  if (display) return display;
  // explicit minor-unit key names win over everything else
  if (isObj(o)) {
    const centKey = Object.keys(o).find(k => /(_|^)(cents?|minor)(_?$)/i.test(k));
    if (centKey) {
      const n = asNumber(o[centKey]);
      if (n != null) return money(n / 100, o);
    }
  }
  const pv = pick(o, ['price', 'current_price', 'currentPrice', 'sale_price', 'salePrice', 'unit_price', 'price_amount', 'best_price', 'amount']);
  if (pv !== undefined) {
    const s = priceFrom(pv, o);
    if (s) return s;
  }
  const min = pick(o, ['min_price', 'price_min', 'from_price', 'starting_price', 'start_price']);
  if (min !== undefined) {
    const s = priceFrom(min, o);
    if (s) return `From ${s}`;   // label on a returned min price
  }
  const range = pick(o, ['price_range', 'priceRange']);
  if (isObj(range)) {
    const lo = pickShallow(range, ['min', 'low', 'from', 'min_price']);
    const s = priceFrom(lo, range);
    if (s) return `From ${s}`;
  }
  return null;
}
export function resolveCompareLabel(o: Raw): string | null {
  const display = asString(pick(o, ['compare_at_display', 'compareAtDisplay', 'was_price_display'], false));
  if (display) return display;
  const v = pick(o, ['compare_at', 'compareAt', 'compare_at_price', 'original_price', 'originalPrice', 'list_price', 'listPrice', 'was_price', 'msrp', 'strike_price']);
  return v === undefined ? null : priceFrom(v, o);
}

/* ── rating / badge / availability / description ────────────────────────── */
export function resolveRating(o: Raw): number | null {
  let v = pick(o, ['rating', 'ratings', 'average_rating', 'averageRating', 'avg_rating', 'stars', 'review_rating', 'rating_average', 'overall_rating', 'overallRating', 'product_rating', 'score']);
  if (isObj(v)) v = pickShallow(v, ['average', 'avg', 'value', 'rating', 'score', 'mean']);
  let n = asNumber(v);
  if (n == null) return null;
  if (n > 5) n = n > 50 ? n / 20 : n / 10;
  return Math.round(Math.min(5, Math.max(0, n)) * 10) / 10;
}
export const resolveReviews = (o: Raw): number | null => {
  let v = pick(o, ['reviews', 'review_count', 'reviewCount', 'reviews_count', 'rating_count', 'ratings_count', 'ratingsCount', 'num_reviews', 'total_reviews']);
  if (v === undefined) {
    // rating often arrives as { average, count } — take the count from there
    const rObj = pickShallow(o, ['rating', 'ratings', 'average_rating', 'averageRating', 'overall_rating', 'overallRating', 'product_rating']);
    if (isObj(rObj)) v = pickShallow(rObj, ['count', 'total', 'number', 'quantity', 'reviews_count']);
  }
  if (isObj(v)) v = pickShallow(v, ['count', 'total', 'number', 'quantity', 'reviews_count']);
  return asNumber(v);
};

export const resolveBadge = (o: Raw): string | null => {
  const v = pick(o, ['badge', 'badges', 'tag', 'tags', 'promotion', 'promo_label']);
  const list = asStrings(v);
  return list[0] ?? null;
};
export const resolveAvailability = (o: Raw): string | null => {
  const v = pick(o, ['availability', 'available', 'in_stock', 'inStock', 'stock_status', 'stockStatus', 'stock', 'inventory_status', 'quantity_available']);
  if (typeof v === 'boolean') return v ? 'In stock' : 'Out of stock';
  if (typeof v === 'number') return v > 0 ? `In stock (${v})` : 'Out of stock';
  return asString(v);
};
export const resolveDescription = (o: Raw): string | null => {
  const v = pick(o, ['description', 'desc', 'summary', 'blurb', 'product_description', 'long_description', 'short_description', 'details']);
  const list = asStrings(v);
  return list.length ? list.join(' ') : null;
};
/** digital goods / fulfillment hint, rendered as a chip when returned */
export const resolveDelivery = (o: Raw): string | null => {
  const v = pick(o, ['delivery', 'delivery_method', 'deliveryMethod', 'fulfillment', 'fulfillment_type', 'download', 'downloadable', 'digital', 'license_type', 'format']);
  if (typeof v === 'boolean') return v ? 'Downloadable' : null;
  return asString(v);
};

/* ── options / variants (arbitrary merchant labels) ─────────────────────── */
const AVAIL_ALIASES = ['available', 'in_stock', 'inStock', 'stock_status', 'purchasable', 'is_available', 'stock'];
function resolveAvailTri(v: Raw): boolean | null {
  const a = pickShallow(v ?? {}, AVAIL_ALIASES);
  if (typeof a === 'boolean') return a;
  if (typeof a === 'number') return a > 0;
  const s = asString(a);
  if (s) return /in.?stock|available|yes|true|ok/i.test(s) ? true : /out.?stock|unavailable|no|false|sold.?out/i.test(s) ? false : null;
  return null;
}
export function resolveOptions(o: Raw): OptionGroup[] {
  const v = pick(o, ['options', 'option_groups', 'optionGroups', 'variant_options', 'variation_options', 'attributes', 'choices']);
  const arr = Array.isArray(v) ? v : v && isObj(v) ? Object.entries(v).map(([k, val]) => ({ name: k, values: val })) : [];
  return arr.map((g: Raw, gi: number): OptionGroup => {
    const label = asString(pickShallow(g, ['name', 'label', 'option_name', 'title', 'displayName'])) ?? `Option ${gi + 1}`;
    let vals: Raw = pickShallow(g, ['values', 'options', 'items', 'choices', 'option_values']);
    if (!Array.isArray(vals) && isObj(vals)) vals = Object.values(vals);
    if (!Array.isArray(vals) && vals != null) vals = [vals];
    const valArr: Raw[] = Array.isArray(vals) ? vals : [];
    const values: OptionValue[] = valArr.map((x: Raw): OptionValue => {
      const label2 = asString(isObj(x) ? pickShallow(x, ['label', 'value', 'name', 'title']) : x) ?? '?';
      return {
        label: label2,
        available: isObj(x) ? resolveAvailTri(x) : null,
        priceLabel: isObj(x) ? resolvePriceLabel(x) : null,
        media: isObj(x) ? resolveMedia(x)[0] ?? null : null,
        raw: x,
      };
    }).filter(v2 => v2.label !== '?');
    return { id: asString(pickShallow(g, ['id', 'code', 'key'])) ?? `opt${gi}`, label, values, raw: g };
  }).filter(g => g.values.length > 0);
}
export function resolveVariants(o: Raw): Variant[] {
  const v = pick(o, ['variants', 'variant_list', 'variations', 'skus', 'offers']);
  if (!Array.isArray(v)) return [];
  return v.map((x: Raw, i: number): Variant => {
    let opts: Record<string, string> = {};
    const ov = pickShallow(x, ['options', 'option_values', 'optionValues', 'attributes']);
    if (Array.isArray(ov)) {
      for (const e of ov) {
        if (isObj(e)) {
          const k = asString(pickShallow(e, ['name', 'label', 'option_name']));
          const val = asString(pickShallow(e, ['value', 'label2', 'val', 'option_value'])) ?? asString(pickShallow(e, ['value']));
          if (k && val) opts[k] = val;
        }
      }
    } else if (isObj(ov)) {
      for (const [k, val] of Object.entries(ov)) {
        const s = asString(isObj(val) ? pickShallow(val, ['value', 'label']) : val);
        if (s) opts[k] = s;
      }
    }
    return {
      id: asString(pickShallow(x, ['id', 'sku', 'variant_id', 'variantId'])) ?? `v${i}`,
      label: (asString(pickShallow(x, ['title', 'label', 'name'])) ?? Object.values(opts).join(' / ')) || `Variant ${i + 1}`,
      options: opts,
      priceLabel: resolvePriceLabel(x),
      availability: resolveAvailability(x),
      media: resolveMedia(x),
      raw: x,
    };
  });
}

/* ── product ────────────────────────────────────────────────────────────── */
export function normalizeProduct(raw: Raw, i = 0): Product {
  const o = isObj(raw) ? raw : { title: String(raw) };
  return {
    id: asString(pick(o, ['id', 'product_id', 'productId', 'sku', 'uid', 'key'], false)) ?? `p${i}-${Math.random().toString(36).slice(2, 8)}`,
    raw: o,
    title: resolveTitle(o),
    seller: resolveSeller(o),
    priceLabel: resolvePriceLabel(o),
    compareLabel: resolveCompareLabel(o),
    media: resolveMedia(o),
    description: resolveDescription(o),
    rating: resolveRating(o),
    reviews: resolveReviews(o),
    badge: resolveBadge(o),
    availability: resolveAvailability(o),
    deliveryLabel: resolveDelivery(o),
    url: resolveUrl(o),
    options: resolveOptions(o),
    variants: resolveVariants(o),
  };
}
export function resolveProducts(raw: Raw): Product[] {
  let arr = pick(raw, ['products', 'results', 'items', 'product_list', 'productList', 'records', 'entries', 'listings', 'offers', 'search_results', 'searchResults'], false);
  if (!Array.isArray(arr) && isObj(arr)) {
    arr = pick(arr, ['products', 'results', 'items', 'listings', 'offers'], false);
  }
  if (!Array.isArray(arr)) {
    const cat = pick(raw, ['catalog', 'data', 'response', 'payload'], false);
    if (isObj(cat)) {
      arr = pick(cat, ['products', 'results', 'items', 'listings', 'offers'], false);
    }
  }
  if (!Array.isArray(arr)) {
    arr = pickDeep(raw, ['products', 'results', 'items', 'listings', 'offers'], 4);
  }
  if (Array.isArray(arr)) return arr.map((x, i) => normalizeProduct(x, i));
  const single = pickShallow(raw, ['product', 'item', 'detail', 'product_detail'])
    ?? (isObj(raw) && isObj(raw.catalog) ? pickShallow(raw.catalog, ['product', 'item', 'detail', 'product_detail']) : null);
  if (isObj(single)) return [normalizeProduct(single)];
  return [];
}

/* ── pagination (returned values only) ──────────────────────────────────── */
export function resolvePagination(raw: Raw) {
  const p = pickShallow(raw, ['pagination', 'paging', 'page_info', 'pageInfo', 'meta']) ?? raw;
  const page = asNumber(pickShallow(p, ['page', 'page_number', 'current_page', 'pageNo']));
  const pages = asNumber(pickShallow(p, ['pages', 'total_pages', 'totalPages', 'page_count', 'last_page']));
  const hasNext = (() => {
    const h = pickShallow(p, ['has_more', 'hasMore', 'has_next', 'hasNext', 'next_cursor', 'nextCursor', 'next']);
    if (typeof h === 'boolean') return h;
    if (h != null && h !== '' && h !== false) return true;
    return null;
  })();
  const cursor = asString(pickShallow(p, ['next_cursor', 'nextCursor', 'cursor', 'next_page_token']));
  return { page, pages, hasNext, cursor };
}

/* ── cart ───────────────────────────────────────────────────────────────── */
function resolveTotals(raw: Raw): LabelValue[] {
  const v = pick(raw, ['totals', 'total', 'summary', 'amounts', 'price_totals', 'cart_totals', 'order_totals'], false)
    ?? pickDeep(raw, ['totals'], 3);
  const arr = Array.isArray(v) ? v : v != null ? [v] : [];
  return arr.map((t: Raw, i: number): LabelValue => {
    if (!isObj(t)) return { label: 'Total', display: String(t), raw: t };
    const label = asString(pickShallow(t, ['label', 'type', 'name', 'title', 'description'])) ?? (i === arr.length - 1 ? 'Total' : `Total ${i + 1}`);
    const display = asString(pickShallow(t, ['display', 'display_amount', 'formatted', 'formatted_amount', 'price_display', 'text']))
      ?? priceFrom(pickShallow(t, ['amount', 'value', 'price', 'total']), t)
      ?? asString(pickShallow(t, ['amount', 'value']));
    return { label, display: display ?? '—', raw: t };
  });
}
export function resolveCart(raw: Raw): CartState {
  const cartObj = isObj(pickShallow(raw, ['cart', 'cart_state', 'cartState', 'bag'])) ? pickShallow(raw, ['cart', 'cart_state', 'cartState', 'bag']) : raw;
  const linesArr = pick(cartObj, ['lines', 'line_items', 'lineItems', 'items', 'entries', 'cart_items', 'products'], false);
  const lines: CartLine[] = (Array.isArray(linesArr) ? linesArr : []).map((l: Raw, i: number): CartLine => ({
    id: asString(pickShallow(l, ['line_id', 'lineId', 'id', 'sku'])) ?? `l${i}`,
    raw: l,
    title: resolveTitle(l),
    media: resolveMedia(l)[0] ?? null,
    qty: asNumber(pickShallow(l, ['quantity', 'qty', 'count', 'units'])),
    optionsLabel: asStrings(pickShallow(l, ['selected_options', 'options_label', 'optionsLabel', 'options', 'variant_label', 'attributes'])).join(', ') || null,
    priceLabel: resolvePriceLabel(l),
  }));
  return {
    raw,
    lines,
    totals: resolveTotals(cartObj),
    messages: asStrings(pick(cartObj, ['messages', 'message', 'notes', 'notice', 'warnings', 'errors'], false)),
    recommendations: (Array.isArray(pick(cartObj, ['recommendations', 'recommended', 'related', 'related_products', 'suggested', 'suggestions', 'cross_sell'], false))
      ? (pick(cartObj, ['recommendations', 'recommended', 'related', 'related_products', 'suggested', 'suggestions', 'cross_sell'], false) as Raw[])
      : []).map((x, i) => normalizeProduct(x, i)),
  };
}

/* ── checkout / order ───────────────────────────────────────────────────── */
export function resolveCheckout(raw: Raw): CheckoutState {
  const c = isObj(pickShallow(raw, ['checkout', 'checkout_state', 'checkoutState'])) ? pickShallow(raw, ['checkout', 'checkout_state', 'checkoutState']) : raw;
  const url = asString(pick(c, ['checkout_url', 'checkoutUrl', 'continuation_url', 'continuationUrl', 'continue_url', 'embed_url', 'embedUrl', 'iframe_url', 'iframeUrl', 'webview_url', 'payment_url', 'redirect_url', 'url', 'link'], false))
    ?? asString(pickDeep(c, ['checkout_url', 'continuation_url', 'embed_url'], 3));
  const modeHint = asString(pick(c, ['checkout_mode', 'mode', 'presentation', 'surface', 'embed_mode'], false))?.toLowerCase() ?? '';
  const embedFlag = pickShallow(c, ['embed', 'iframe', 'webview', 'embedded']);
  let mode: CheckoutState['mode'] = 'unknown';
  if (/iframe|embed|webview|inline/.test(modeHint)) mode = /inline/.test(modeHint) ? 'inline' : 'iframe';
  else if (/external|redirect|handoff|browser/.test(modeHint)) mode = 'external';
  else if (typeof embedFlag === 'boolean' && embedFlag && url) mode = 'iframe';
  else if (url) mode = 'iframe';   // host can override; embedding returned continuation info is the default surface
  return {
    raw,
    mode,
    url,
    messages: asStrings(pick(c, ['messages', 'message', 'instructions', 'notice', 'warnings'], false)),
    progress: asStrings(pick(c, ['progress', 'steps', 'checkout_steps', 'stage', 'status'], false)),
    buyerActions: (Array.isArray(pick(c, ['required_actions', 'buyer_actions', 'actions', 'next_actions'], false))
      ? (pick(c, ['required_actions', 'buyer_actions', 'actions', 'next_actions'], false) as Raw[])
      : []).map(a => ({ label: asString(isObj(a) ? pickShallow(a, ['label', 'title', 'name', 'action']) : a) ?? 'Continue', raw: a })),
  };
}
export function resolveOrder(raw: Raw): OrderState {
  const o = isObj(pickShallow(raw, ['order', 'order_confirmation', 'confirmation'])) ? pickShallow(raw, ['order', 'order_confirmation', 'confirmation']) : raw;
  const detailsSrc = pick(o, ['details', 'summary', 'lines', 'items'], false);
  const details: LabelValue[] = (Array.isArray(detailsSrc) ? detailsSrc : detailsSrc && isObj(detailsSrc) ? [detailsSrc] : [])
    .map((d: Raw, i: number): LabelValue => ({
      label: asString(isObj(d) ? pickShallow(d, ['label', 'type', 'name', 'title']) : null) ?? `Detail ${i + 1}`,
      display: asString(isObj(d) ? pickShallow(d, ['display', 'value', 'amount', 'formatted', 'text']) : d) ?? '—',
      raw: d,
    }));
  return {
    raw,
    id: asString(pick(o, ['order_id', 'orderId', 'order_number', 'orderNumber', 'confirmation_number', 'confirmation_id', 'confirmationNumber'], false)),
    message: asStrings(pick(o, ['message', 'confirmation_message', 'summary_message', 'status_message'], false))[0] ?? null,
    details,
  };
}
export const resolveMessages = (raw: Raw): string[] =>
  asStrings(pick(raw, ['messages', 'message', 'notice', 'notes', 'status_message', 'toast'], false));
