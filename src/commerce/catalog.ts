/**
 * commerce/catalog.ts — default store catalog data for instant response
 * formatted in standard schema payloads recognized by route.ts & resolve.ts.
 */
import type { Raw } from './types';

export const STORE_CATALOG: Record<string, Raw> = {
  'c1': {
    view: 'discovery',
    collection: 'Tattoo Numbing Creams',
    products: [
      {
        id: 'tbnc-pro-500g',
        title: 'TBNC Ultra Deep Numb Pro Cream 500g',
        seller: 'Nba0ey Th Store',
        price: 4900,
        compare_at: 6500,
        currency: 'USD',
        badge: 'BESTSELLER',
        rating: 4.9,
        reviews_count: 142,
        availability: 'In stock (48 units)',
        delivery: 'Express 2-Day',
        description: 'Maximum strength tattoo numbing formulation designed for extended sessions up to 6 hours. Fast absorption with zero pigment distortion.',
        media: ['/src/assets/images/tattoo_numbing_cream_1790709633997.jpg'],
        options: [
          {
            name: 'Size',
            values: [
              { label: '500g Tub', price: 4900, available: true },
              { label: '250g Jar', price: 2900, available: true },
              { label: '100g Tube', price: 1600, available: true },
            ],
          },
          {
            name: 'Strength',
            values: [
              { label: 'Ultra Pro (10%)', available: true },
              { label: 'Standard (5%)', available: true },
            ],
          },
        ],
        variants: [
          {
            id: 'v-500g-pro',
            title: '500g Tub / Ultra Pro',
            options: { Size: '500g Tub', Strength: 'Ultra Pro (10%)' },
            price: 4900,
            availability: 'In stock',
          },
          {
            id: 'v-250g-pro',
            title: '250g Jar / Ultra Pro',
            options: { Size: '250g Jar', Strength: 'Ultra Pro (10%)' },
            price: 2900,
            availability: 'In stock',
          },
        ],
      },
      {
        id: 'tbnc-rapid-gel',
        title: 'TBNC Rapid Action Topical Gel 30g',
        seller: 'Nba0ey Th Store',
        price: 2450,
        compare_at: 3200,
        currency: 'USD',
        badge: 'SALE',
        rating: 4.8,
        reviews_count: 89,
        availability: 'In stock',
        description: 'Quick-setting numbing gel for sensitive areas. Activates in under 15 minutes.',
        media: ['/src/assets/images/tattoo_numbing_cream_1790709633997.jpg'],
      },
      {
        id: 'tbnc-spray-120ml',
        title: 'TBNC Secondary Numbing Spray 120ml',
        seller: 'Nba0ey Th Store',
        price: 3400,
        currency: 'USD',
        rating: 4.7,
        reviews_count: 65,
        availability: 'In stock',
        description: 'Spray formula for mid-session comfort and pain reduction on broken skin.',
        media: ['/src/assets/images/tattoo_numbing_cream_1790709633997.jpg'],
      },
    ],
  },
  'c2': {
    view: 'discovery',
    collection: 'Tattoo Shop Accessories',
    products: [
      {
        id: 'inksoul-tray',
        title: 'INKSOUL Ergonomic Workstation Tray',
        seller: 'Nba0ey Th Store',
        price: 3200,
        compare_at: 4500,
        currency: 'USD',
        badge: 'PRO ACCESSORY',
        rating: 4.9,
        reviews_count: 94,
        availability: 'In stock (12 units)',
        description: 'Heavyweight acrylic non-slip workstation organizer with dedicated slots for ink caps, rinse cups, and machine cables.',
        media: ['/src/assets/images/tattoo_shop_accessories_1790709642499.jpg'],
        options: [
          {
            name: 'Color',
            values: [
              { label: 'Matte Obsidian', available: true },
              { label: 'Crystal Smoke', available: true },
            ],
          },
        ],
      },
      {
        id: 'inksoul-cube',
        title: 'INKSOUL Magnetic Cube Ink Cup Stand',
        seller: 'Nba0ey Th Store',
        price: 1950,
        currency: 'USD',
        rating: 4.8,
        reviews_count: 120,
        availability: 'In stock',
        description: 'Modular magnetic ink cup holder that links together to customize your tray setup.',
        media: ['/src/assets/images/tattoo_shop_accessories_1790709642499.jpg'],
      },
    ],
  },
  'c3': {
    view: 'discovery',
    collection: 'Tattoo Machines',
    products: [
      {
        id: 'copper-rotary-pen',
        title: 'Mast Tour Wireless Rotary Pen Copper Edition',
        seller: 'Nba0ey Th Store',
        price: 15000,
        compare_at: 18900,
        currency: 'USD',
        badge: 'FEATURED',
        rating: 4.9,
        reviews_count: 78,
        availability: 'In stock (5 units)',
        delivery: 'Free Insured Shipping',
        description: 'Precision Japanese coreless motor with digital LED voltage screen, 4.0mm stroke, and dual wireless battery power packs with 12-hour continuous battery life.',
        media: ['/src/assets/images/tattoo_machine_pen_1790709652008.jpg'],
        options: [
          {
            name: 'Stroke Length',
            values: [
              { label: '4.0mm Direct', available: true },
              { label: '3.5mm All-Rounder', available: true },
            ],
          },
        ],
      },
      {
        id: 'flux-direct-drive',
        title: 'Flux Max Brushless Direct Drive Machine',
        seller: 'Nba0ey Th Store',
        price: 32000,
        currency: 'USD',
        badge: 'PREMIUM',
        rating: 5.0,
        reviews_count: 52,
        availability: 'In stock',
        description: 'State of the art brushless motor with electronic give control and Bluetooth sync.',
        media: ['/src/assets/images/tattoo_machine_pen_1790709652008.jpg'],
      },
    ],
  },
};
