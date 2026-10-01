/**
 * commerce/discovery.ts — Clean shop discovery from .well-known/commerce.json
 *
 * Reads domain, shop name, currency, and schema metadata directly from the endpoint.
 * No hardcoded mock products, images, or synthetic fallbacks.
 */
import type { StoreInfo } from './types';

export const EMPTY_STORE_INFO: StoreInfo = {
  shop_domain: '',
  name: '',
  display_name: '',
  currency: '',
  has_cart_items: false,
  cart_count: 0,
  collections: [],
  initial_cart: undefined,
};

/**
 * Discovers store domain and metadata from .well-known/commerce.json
 */
export async function discoverStore(customUrl?: string): Promise<StoreInfo> {
  const url = customUrl || '/.well-known/commerce.json';
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      return {
        shop_domain: data.shop_domain || data.domain || '',
        name: data.name || data.shop_name || '',
        display_name: data.display_name || data.name || '',
        currency: data.currency || '',
        has_cart_items: Boolean(data.has_cart_items),
        cart_count: typeof data.cart_count === 'number' ? data.cart_count : 0,
        collections: Array.isArray(data.collections) ? data.collections : [],
        initial_cart: data.initial_cart,
      };
    }
  } catch {
    // network or endpoint unavailable
  }
  return EMPTY_STORE_INFO;
}
