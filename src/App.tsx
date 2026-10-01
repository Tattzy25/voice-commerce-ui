import React, { useRef, useState } from 'react';
import LiveCommerce from './commerce/LiveCommerce';
import type { LiveCommerceHandle, CommerceIntent } from './commerce/types';

export default function App() {
  const liveCommerceRef = useRef<LiveCommerceHandle>(null);
  const [storeName] = useState('');

  const handleIntent = (intent: CommerceIntent) => {
    console.log('[LiveCommerce Intent]:', intent);
  };

  return (
    <LiveCommerce
      ref={liveCommerceRef}
      storeName={storeName}
      onIntent={handleIntent}
      sessionActive={true}
      emitNavigationIntents={false}
    />
  );
}
