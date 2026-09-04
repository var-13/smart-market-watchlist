import YahooFinance from 'yahoo-finance2';
import db from '../db/db.js';
import { SYMBOLS } from '../simulator.js';

// Instantiate YahooFinance client (yahoo-finance2 v4)
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Maps our internal app symbols to Yahoo Finance NSE ticker symbols.
 * HDFC Bank trades as HDFCBANK.NS (merged entity since July 2023).
 */
const YAHOO_SYMBOL_MAP = {
  TCS:      'TCS.NS',
  INFY:     'INFY.NS',
  RELIANCE: 'RELIANCE.NS',
  HDFC:     'HDFCBANK.NS',
  WIPRO:    'WIPRO.NS',
};

// Per-symbol fallback price state for the simulator walk
// Initialized from DB on startup, exactly like simulator.js does
const fallbackPrices = new Map();

/**
 * Initialize fallback prices from DB (latest known price per symbol)
 * Called once at startup.
 */
export function initFallbackPrices() {
  const stmt = db.prepare(`
    SELECT price FROM price_history
    WHERE symbol = ? AND price > 0
    ORDER BY timestamp DESC, id DESC LIMIT 1
  `);
  for (const s of SYMBOLS) {
    const row = stmt.get(s.symbol);
    fallbackPrices.set(s.symbol, (row && row.price > 0) ? row.price : s.basePrice);
  }
  console.log('[PriceProvider] Fallback prices initialized from DB.');
}

/**
 * Fetch a live quote from Yahoo Finance for one symbol.
 * Returns { price, volume } or throws on failure/bad data.
 * Hard timeout of 8 seconds per symbol.
 */
async function fetchYahooQuote(appSymbol) {
  const yahooSym = YAHOO_SYMBOL_MAP[appSymbol];
  if (!yahooSym) throw new Error(`No Yahoo symbol mapping for ${appSymbol}`);

  const quote = await Promise.race([
    yf.quote(yahooSym, {}, { validateResult: false }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout fetching ${yahooSym}`)), 8000)
    ),
  ]);

  const price = quote?.regularMarketPrice;
  const volume = quote?.regularMarketVolume;

  // Validate: price must be a positive finite number
  if (!price || typeof price !== 'number' || price <= 0 || !isFinite(price)) {
    throw new Error(`Invalid price from Yahoo for ${yahooSym}: ${price}`);
  }

  return {
    price: Number(price.toFixed(2)),
    volume: (typeof volume === 'number' && volume > 0) ? Math.round(volume) : null,
  };
}

/**
 * Simulate one price step for a single symbol (same math as simulator.js,
 * but per-symbol so we can fallback individually without touching simulator.js).
 */
function simulateFallbackStep(appSymbol) {
  const symbolDef = SYMBOLS.find(s => s.symbol === appSymbol);
  const prevPrice = fallbackPrices.get(appSymbol) || symbolDef.basePrice;
  const isJump = Math.random() < 0.05;

  let pctChange, volume;
  if (isJump) {
    pctChange = (Math.random() < 0.5 ? 1 : -1) * (3.0 + Math.random() * 2.0);
    volume = Math.round(symbolDef.baseVolume * (2.5 + Math.random() * 2.5));
  } else {
    pctChange = (Math.random() - 0.5) * 1.0;
    volume = Math.round(symbolDef.baseVolume * (0.7 + Math.random() * 0.6));
  }

  let newPrice = Number((prevPrice * (1 + pctChange / 100)).toFixed(2));
  if (!newPrice || isNaN(newPrice) || newPrice <= 0) newPrice = symbolDef.basePrice;

  fallbackPrices.set(appSymbol, newPrice);
  return { price: newPrice, volume };
}

/**
 * Run one full price tick across all symbols.
 * - Tries Yahoo Finance first for each symbol
 * - Falls back to simulator walk for any symbol that fails
 * - Inserts ALL results in a single atomic transaction
 */
export async function runLiveTick() {
  const timestamp = new Date().toISOString();
  const results = [];

  // Fetch all symbols concurrently (faster, ~8s max instead of 8s * 5)
  const fetches = await Promise.allSettled(
    SYMBOLS.map(async (s) => {
      const prevPrice = fallbackPrices.get(s.symbol) || s.basePrice;
      try {
        const { price, volume } = await fetchYahooQuote(s.symbol);
        // Update fallback state with live price for continuity
        fallbackPrices.set(s.symbol, price);
        // Use realistic volume estimate if Yahoo returns null/zero
        const vol = (volume && volume > 0) ? volume : Math.round(s.baseVolume * (0.8 + Math.random() * 0.4));
        return { symbol: s.symbol, price, prevPrice, volume: vol, source: 'live' };
      } catch (err) {
        console.warn(`[PriceProvider] ⚠ Yahoo Finance failed for ${s.symbol}: ${err.message} — using simulated fallback`);
        const { price, volume } = simulateFallbackStep(s.symbol);
        return { symbol: s.symbol, price, prevPrice, volume, source: 'simulated' };
      }
    })
  );

  for (const result of fetches) {
    // allSettled guarantees all resolve (we catch inside) — value is always set
    if (result.status === 'fulfilled') {
      results.push({ ...result.value, timestamp });
    }
  }

  // Write all results atomically
  const insertStmt = db.prepare(`
    INSERT INTO price_history (symbol, price, volume, timestamp, source)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.transaction((rows) => {
    for (const r of rows) {
      insertStmt.run(r.symbol, r.price, r.volume, r.timestamp, r.source);
    }
  })(results);

  // Print tick summary
  const time = new Date().toLocaleTimeString();
  const liveCount = results.filter(r => r.source === 'live').length;
  const simCount  = results.filter(r => r.source === 'simulated').length;
  console.log(`\n[${time}] ── Live Price Tick (${liveCount} live / ${simCount} simulated) ───────`);

  for (const r of results) {
    const prev = r.prevPrice || r.price;
    const pct  = Number((((r.price - prev) / prev) * 100).toFixed(2));
    const sign = pct >= 0 ? '+' : '';
    const srcTag = r.source === 'live' ? '🟢 LIVE' : '🟡 SIM ';
    console.log(
      `  ${srcTag}  ${r.symbol.padEnd(9)} ₹${r.price.toFixed(2).padStart(9)}  (${sign}${pct.toFixed(2)}%)  Vol: ${r.volume.toLocaleString()}`
    );
  }

  return results;
}

/**
 * Start the live price provider loop.
 * Ticks every 30 seconds (respects Yahoo Finance rate limits).
 */
export async function startLivePriceProvider({ intervalMs = 30000, once = false } = {}) {
  initFallbackPrices();

  console.log('====================================================');
  console.log('  SMART MARKET WATCHLIST - LIVE PRICE PROVIDER     ');
  console.log('====================================================');
  console.log(`  Symbols:  ${SYMBOLS.map(s => s.symbol).join(', ')}`);
  console.log(`  Interval: ${intervalMs / 1000}s  |  Fallback: Simulator`);
  console.log(`  Yahoo map: ${Object.entries(YAHOO_SYMBOL_MAP).map(([k,v]) => `${k}→${v}`).join(', ')}`);
  console.log('====================================================\n');

  // First tick immediately
  await runLiveTick().catch(err => console.error('[PriceProvider] Tick error:', err));

  if (once) {
    console.log('\n✔ Single tick complete (--once). Exiting.');
    return;
  }

  const timer = setInterval(() => {
    runLiveTick().catch(err => console.error('[PriceProvider] Tick error:', err));
  }, intervalMs);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nStopping live price provider...');
    clearInterval(timer);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
