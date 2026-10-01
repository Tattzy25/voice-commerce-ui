/**
 * commerce/types.ts — unified types for schema-tolerant commerce
 */

export type Raw = any;

export type View =
  | 'idle'
  | 'discovery'
  | 'detail'
  | 'options'
  | 'cartConfirm'
  | 'cart'
  | 'checkout'
  | 'complete'
  | 'message'
  | 'unknown';

export type Stage =
  | 'idle'
  | 'discovery'
  | 'detail'
  | 'options'
  | 'cartConfirm'
  | 'cart'
  | 'checkout'
  | 'complete';

export interface OptionValue {
  label: string;
  available: boolean | null;
  priceLabel: string | null;
  media: string | null;
  raw: Raw;
}

export interface OptionGroup {
  id: string;
  label: string;
  values: OptionValue[];
  raw: Raw;
}

export interface Variant {
  id: string;
  label: string;
  options: Record<string, string>;
  priceLabel: string | null;
  availability: string | null;
  media: string[];
  raw: Raw;
}

export interface Product {
  id: string;
  raw: Raw;
  title: string;
  seller: string | null;
  priceLabel: string | null;
  compareLabel: string | null;
  media: string[];
  description: string | null;
  rating: number | null;
  reviews: number | null;
  badge: string | null;
  availability: string | null;
  deliveryLabel: string | null;
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
  optionsLabel: string | null;
  priceLabel: string | null;
}

export interface LabelValue {
  label: string;
  display: string;
  raw: Raw;
}

export interface CartState {
  raw: Raw;
  lines: CartLine[];
  totals: LabelValue[];
  messages: string[];
  recommendations: Product[];
}

export interface CheckoutState {
  raw: Raw;
  mode: 'iframe' | 'inline' | 'external' | 'unknown';
  url: string | null;
  messages: string[];
  progress: string[];
  buyerActions: { label: string; raw: Raw }[];
}

export interface OrderState {
  raw: Raw;
  id: string | null;
  message: string | null;
  details: LabelValue[];
}

export interface PaginationInfo {
  page: number | null;
  pages: number | null;
  hasNext: boolean | null;
  cursor: string | null;
}

export interface RoutedResult {
  view: View;
  products: Product[];
  product: Product | null;
  cart: CartState | null;
  checkout: CheckoutState | null;
  order: OrderState | null;
  messages: string[];
  pagination: PaginationInfo;
  raw: Raw;
}

export type CommerceIntentType =
  | 'select_product'
  | 'select_collection'
  | 'add_to_cart'
  | 'open_cart'
  | 'continue_browsing'
  | 'close'
  | 'update_qty'
  | 'remove_line'
  | 'refresh_cart'
  | 'checkout'
  | 'checkout_action';

export interface CommerceIntent {
  type: CommerceIntentType;
  raw?: Raw;
  variantRaw?: Raw;
  selectedOptions?: Record<string, string>;
  lineRaw?: Raw;
  qty?: number;
  cartRaw?: Raw;
  actionRaw?: Raw;
  collectionId?: string;
  collectionTitle?: string;
}

export interface CommerceSnapshot {
  stage: Stage;
  minimized: boolean;
  resultCount: number;
  page: number;
  pages: number;
  activeProduct: {
    id: string;
    title: string;
    seller: string | null;
    priceLabel: string | null;
  } | null;
  selectedOptions: Record<string, string>;
  selectedVariant: { id: string; label: string } | null;
  cart: {
    lines: number;
    units: number;
    totals: LabelValue[];
    messages: string[];
  } | null;
  checkout: { mode: CheckoutState['mode']; url: string | null } | null;
  order: { id: string | null; message: string | null } | null;
  lastRaw: Raw;
}

export interface LiveCommerceHandle {
  ingest: (raw: Raw, hint?: { view?: View }) => RoutedResult;
  act: (intent: CommerceIntent) => void;
  snapshot: () => CommerceSnapshot;
  reset: () => void;
}

export interface StoreCollection {
  id: string;
  title: string;
  handle: string;
  image: string;
  itemCount?: number;
}

export interface StoreInfo {
  shop_domain: string;
  name: string;
  display_name: string;
  currency: string;
  has_cart_items: boolean;
  cart_count: number;
  collections: StoreCollection[];
  initial_cart?: Raw;
}
