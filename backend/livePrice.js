/**
 * livePrice.js — Root-level runner for the live price provider.
 * 
 * Usage:
 *   node livePrice.js               → runs every 30 seconds (live + fallback)
 *   node livePrice.js --once        → single tick and exit
 *   node livePrice.js --interval 60 → custom interval in seconds
 *   node livePrice.js --sim-only    → force simulator fallback for all symbols (offline testing)
 *
 * This replaces: node simulator.js
 * The original simulator.js remains fully intact and runnable independently.
 */

import { startLivePriceProvider, runLiveTick, initFallbackPrices } from './src/services/priceProvider.js';
import { startSimulator } from './src/simulator.js';

const args = process.argv.slice(2);
const once     = args.includes('--once');
const simOnly  = args.includes('--sim-only');

// Parse optional --interval <seconds>
const intervalIdx = args.indexOf('--interval');
const intervalSec = intervalIdx !== -1 ? parseInt(args[intervalIdx + 1], 10) : 30;
const intervalMs  = (isNaN(intervalSec) ? 30 : Math.max(intervalSec, 10)) * 1000;

if (simOnly) {
  // Simulate-only mode: uses the original simulator directly
  console.log('[livePrice.js] --sim-only mode: using simulator for all symbols');
  startSimulator({ intervalMs, once });
} else {
  // Normal mode: Yahoo Finance primary, simulator fallback per symbol
  startLivePriceProvider({ intervalMs, once });
}
