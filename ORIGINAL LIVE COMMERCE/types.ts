/**
 * commerce/types.ts — display models for the live commerce layer.
 *
 * Rules honored here:
 *  · Every normalized node keeps its COMPLETE original object in `raw`.
 *  · Nothing is calculated: prices/totals/availability are strings rendered
 *    exactly as the merchant returned them (or formatted from a returned
 *    number + returned currency, which is presentation, not math).
 *  · Unknown / future fields survive untouched inside `raw`.
 */

export type Raw = any;

export interface LabelValue {
  label: string;
  display: string;
  raw: Raw;
}

export interface OptionValue {
  label: string;
  available: boolean | null;      // null = merchant said nothing
  priceLabel: string | null;      // variant/value-specific price, as returned
  media: string | null;           // variant/value-specific media, as returned
  raw: Raw;
}

export interface OptionGroup {
  id: string;
  label: string;                  // "Color", "Size", "Width", "Denomination", anything
  values: OptionValue[];
  raw: Raw;
}

export interface Variant {
  id: string;
  label: string;
  options: Record<string, string>;   // { Color: "Black", Size: "M" } as returned
  priceLabel: string | null;
  availability: string | null;
  media: string[];
  raw: Raw;
}

export interface Product {
  id: string;
  raw: Raw;                          // COMPLETE original product object
  title: string;
  seller: string | null;             // seller / store / domain / brand
  priceLabel: string | null;         // "$19.99" | "From $12.00" | null
  compareLabel: string | null;
  media: string[];
  description: string | null;
  rating: number | null;             // 0..5
  reviews: number | null;
  badge: string | null;
  availability: string | null;
  deliveryLabel: string | null;   // digital/fulfillment hint, only when returned
  url: string | null;
  options: OptionGroup[];
  variants: Variant[];
}

export interface CartLine {
  id: string;
  raw: Raw;
  title: string;
  media: string | null;
  qty: number | null;
  optionsLabel: string | null;       // selected option labels, as returned
  priceLabel: string | null;
}

export interface CartState {
  raw: Raw;                          // COMPLETE original cart result
  lines: CartLine[];
  totals: LabelValue[];              // rendered, never computed
  messages: string[];
  recommendations: Product[];
}

export interface CheckoutState {
  raw: Raw;                          // COMPLETE original checkout result
  mode: 'iframe' | 'external' | 'inline' | 'unknown';
  url: string | null;                // exact continuation/embed info returned
  messages: string[];
  progress: string[];                // returned steps/progress labels
  buyerActions: { label: string; raw: Raw }[];
}

export interface OrderState {
  raw: Raw;
  id: string | null;
  message: string | null;
  details: LabelValue[];
}

export type Stage =
  | 'idle'          // nothing returned yet → render nothing
  | 'discovery'     // shelf / carousel of results
  | 'detail'        // product detail + description
  | 'options'       // dynamic option/variant selection (detail sub-stage)
  | 'cartConfirm'   // compact confirmation after an add-to-cart result
  | 'cart'          // full cart review
  | 'checkout'      // continuation / embedded checkout
  | 'complete';     // order completion

export type View =
  | 'discovery' | 'detail' | 'cartConfirm' | 'cart'
  | 'checkout' | 'complete' | 'message' | 'unknown';

export interface RoutedResult {
  view: View;
  products: Product[];
  product: Product | null;
  cart: CartState | null;
  checkout: CheckoutState | null;
  order: OrderState | null;
  messages: string[];
  pagination: { page: number | null; pages: number | null; hasNext: boolean | null; cursor: string | null };
  raw: Raw;
}

/** Intents flow OUT to the host (App / Gemini tool-caller). The commerce layer
 *  never performs commerce itself — it asks the host to. */
export type CommerceIntent =
  | { type: 'select_product';   raw: Raw }
  | { type: 'add_to_cart';      raw: Raw; variantRaw: Raw | null; selectedOptions: Record<string, string> }
  | { type: 'update_qty';       lineRaw: Raw; qty: number }
  | { type: 'remove_line';      lineRaw: Raw }
  | { type: 'refresh_cart' }
  | { type: 'open_cart' }
  | { type: 'checkout';         cartRaw: Raw | null }
  | { type: 'checkout_action';  actionRaw: Raw }
  | { type: 'continue_browsing' }
  | { type: 'close' };

/** Voice-agent-readable mirror of what is on screen right now. */
export interface CommerceSnapshot {
  stage: Stage;
  minimized: boolean;
  resultCount: number;
  page: number;
  pages: number;
  activeProduct: { id: string; title: string; seller: string | null; priceLabel: string | null } | null;
  selectedOptions: Record<string, string>;
  selectedVariant: { id: string; label: string } | null;
  cart: { lines: number; units: number; totals: LabelValue[]; messages: string[] } | null;
  checkout: { mode: CheckoutState['mode']; url: string | null } | null;
  order: { id: string | null; message: string | null } | null;
  lastRaw: Raw;
}

export interface LiveCommerceHandle {
  /** Feed ANY tool/result payload in. The router decides what to show. */
  ingest: (raw: Raw, hint?: { view?: View }) => RoutedResult;
  /** Programmatic/voice actions, same path as touch. */
  act: (intent: CommerceIntent) => void;
  snapshot: () => CommerceSnapshot;
  reset: () => void;
}
