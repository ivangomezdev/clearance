'use client';

import {useState} from 'react';
import {Store} from 'lucide-react';

const logos: Record<string, string> = {
  home_depot: 'home_depot.ico', walmart: 'walmart.ico', amazon: 'amazon.ico',
  amazon_business: 'amazon.ico', woot: 'woot.ico', target: 'target.png',
  discord: 'discord.png', best_buy: 'best_buy.ico', lowes: 'lowes.ico', costco: 'costco.svg',
};

export function RetailerLogo({retailer, className = 'mini-store'}: {retailer: string; className?: string}) {
  const key = retailer.toLowerCase().replace(/[’']/g, '').replace(/[ -]+/g, '_');
  const src = logos[key] ? `/retailers/${logos[key]}` : undefined;
  const [failedSource, setFailedSource] = useState<string>();
  return <span className={`${className} store-${key} retailer-logo`} aria-hidden="true">
    {src && failedSource !== src
      ? <img src={src} width={24} height={24} alt="" decoding="async" draggable={false} onError={() => setFailedSource(src)}/>
      : <Store size={16}/>}
  </span>;
}
