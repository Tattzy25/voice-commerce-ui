/**
 * commerce/route.ts — generic result router.
 *
 * Routes by SHAPE and by merchant/platform hints, never by a hardcoded list of
 * tool names. Keeps the complete raw result on the routed object. Unknown
 * payloads degrade to `unknown` (stored, exposed via snapshot, not rendered).
 */
import type { Raw, RoutedResult, View } from './types';
import {
  pickShallow, pick, resolveProducts, normalizeProduct, resolveCart,
  resolveCheckout, resolveOrder, resolveMessages, resolvePagination,
} from './resolve';

const nk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const VIEW_HINTS: Record<string, View> = {
  discovery: 'discovery', search: 'discovery', results: 'discovery', catalog: 'discovery',
  collection: 'discovery', collections: 'discovery', recommendations: 'discovery', shelf: 'discovery',
  product: 'detail', detail: 'detail', productdetail: 'detail', pdp: 'detail', productcard: 'detail',
  cartconfirm: 'cartConfirm', cartconfirmation: 'cartConfirm', addtocart: 'cartConfirm', addtocartresult: 'cartConfirm',
  cart: 'cart', cartstate: 'cart', bag: 'cart',
  checkout: 'checkout', checkoutcontinuation: 'checkout', embeddedcheckout: 'checkout',
  complete: 'complete', completion: 'complete', order: 'complete', ordercomplete: 'complete',
  orderconfirmation: 'complete', confirmation: 'complete',
  message: 'message', toast: 'message', notice: 'message',
};

const has = (o: Raw, aliases: string[]) => pickShallow(o, aliases) !== undefined;

export function routeResult(raw: Raw, hint?: { view?: View }): RoutedResult {
  const base: RoutedResult = {
    view: 'unknown', products: [], product: null, cart: null, checkout: null,
    order: null, messages: resolveMessages(raw), pagination: resolvePagination(raw), raw,
  };
  if (raw == null) return base;

  /* 1 · explicit hint from the host (e.g. "this came from an add_to_cart call") */
  if (hint?.view) return fill(base, hint.view);

  /* 2 · merchant/platform-declared surface wins */
  const declared = pickShallow(raw, ['view', 'ui', 'surface', 'screen', 'render', 'presentation']);
  const declaredS = typeof declared === 'string' ? VIEW_HINTS[nk(declared)] : undefined;
  const typeS = typeof pickShallow(raw, ['type', 'kind', 'result_type', 'resultType']) === 'string'
    ? VIEW_HINTS[nk(String(pickShallow(raw, ['type', 'kind', 'result_type', 'resultType'])))] : undefined;
  if (declaredS) return fill(base, declaredS);
  if (typeS) return fill(base, typeS);

  /* 3 · shape heuristics, most-specific first */
  const orderish =
    (has(raw, ['order_id', 'orderId', 'order_number', 'orderNumber', 'confirmation_number']) ) ||
    (has(raw, ['order', 'order_confirmation']) && /complet|confirm|success|placed/i.test(String(pick(raw, ['status', 'state', 'stage'], false) ?? '')));
  if (orderish) return fill(base, 'complete');

  const checkoutish =
    has(raw, ['checkout_url', 'checkoutUrl', 'continuation_url', 'continuationUrl', 'embed_url', 'embedUrl', 'iframe_url', 'checkout', 'checkout_state']) ||
    nk(String(pickShallow(raw, ['stage', 'state']) ?? '')) === 'checkout';
  if (checkoutish) return fill(base, 'checkout');

  const cartish =
    has(raw, ['cart', 'cart_state', 'line_items', 'lineItems', 'lines', 'totals', 'bag']) &&
    (has(raw, ['lines', 'line_items', 'lineItems', 'items', 'totals', 'cart']) );
  if (cartish) {
    const confirmish = has(raw, ['added', 'added_item', 'confirmation', 'confirmed', 'success', 'line_added']) ||
      /added|confirmed|success/i.test(String(pick(raw, ['status', 'message'], false) ?? ''));
    return fill(base, confirmish ? 'cartConfirm' : 'cart');
  }

  const single = pickShallow(raw, ['product', 'item', 'product_detail', 'detail']);
  if (single && typeof single === 'object' && !Array.isArray(single) &&
      (has(single, ['options', 'option_groups', 'variants', 'variations']) || has(single, ['title', 'name', 'description']))) {
    return fill(base, 'detail');
  }

  if (resolveProducts(raw).length) return fill(base, 'discovery');

  if (base.messages.length) return fill(base, 'message');
  return base; // 'unknown' — retained in raw, surfaced via snapshot.lastRaw
}

function fill(base: RoutedResult, view: View): RoutedResult {
  const r: RoutedResult = { ...base, view };
  switch (view) {
    case 'discovery':
      r.products = resolveProducts(base.raw);
      if (!r.products.length) r.view = base.messages.length ? 'message' : 'unknown';
      break;
    case 'detail': {
      const single = pickShallow(base.raw, ['product', 'item', 'product_detail', 'detail']);
      const list = resolveProducts(base.raw);
      r.product = normalizeProduct(single && typeof single === 'object' ? single : list[0] ? list[0].raw : base.raw);
      break;
    }
    case 'cartConfirm':
    case 'cart':
      r.cart = resolveCart(base.raw);
      break;
    case 'checkout':
      r.checkout = resolveCheckout(base.raw);
      break;
    case 'complete':
      r.order = resolveOrder(base.raw);
      break;
    case 'message':
    case 'unknown':
      break;
  }
  return r;
}
