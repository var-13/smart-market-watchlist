import db from './db/db.js';

export const SYMBOLS = [
  { symbol: 'TCS', basePrice: 3900.0, baseVolume: 12000 },
  { symbol: 'INFY', basePrice: 1820.0, baseVolume: 18000 },
  { symbol: 'RELIANCE', basePrice: 2980.0, baseVolume: 22000 },
  { symbol: 'HDFC', basePrice: 1640.0, baseVolume: 20000 },
  { symbol: 'WIPRO', basePrice: 510.0, baseVolume: 15000 },
];

// Current in-memory price tracking
const currentPrices = new Map();

/**
 * Initialize current prices from database history or base price
 */
export function initializePrices() {
  const getLatestStmt = db.prepare(`
    SELECT price FROM price_history 
    WHERE symbol = ? AND price > 0
    ORDER BY timestamp DESC, id DESC 
    LIMIT 1
  `);

  for (const s of SYMBOLS) {
    const latest = getLatestStmt.get(s.symbol);
    if (latest && typeof latest.price === 'number' && latest.price > 0) {
      currentPrices.set(s.symbol, latest.price);
    } else {
      currentPrices.set(s.symbol, s.basePrice);
    }
  }
}

/**
 * Perform a single simulation tick across all symbols
 */
export function simulateTick() {
  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO price_history (symbol, price, volume, timestamp)
    VALUES (?, ?, ?, ?)
  `);

  const results = [];

  // Transaction for batch insert
  const insertMany = db.transaction((ticks) => {
    for (const t of ticks) {
      insertStmt.run(t.symbol, t.price, t.volume, t.timestamp);
    }
  });

  for (const s of SYMBOLS) {
    const prevPrice = currentPrices.get(s.symbol) || s.basePrice;
    const isJump = Math.random() < 0.05; // ~5% chance of news jump

    let pctChange;
    let volume;

    if (isJump) {
      // Bigger jump: ±3% to ±5%
      const direction = Math.random() < 0.5 ? 1 : -1;
      const jumpMagnitude = 3.0 + Math.random() * 2.0;
      pctChange = direction * jumpMagnitude;
      // Surge volume: 2.5x to 5x baseline
      volume = Math.round(s.baseVolume * (2.5 + Math.random() * 2.5));
    } else {
      // Normal walk: ±0.5%
      pctChange = (Math.random() - 0.5) * 1.0;
      // Plausible volume: 0.7x to 1.3x baseline
      volume = Math.round(s.baseVolume * (0.7 + Math.random() * 0.6));
    }

    let newPrice = Number((prevPrice * (1 + pctChange / 100)).toFixed(2));

    // Data integrity guard: Discard invalid/non-positive values
    if (!newPrice || isNaN(newPrice) || newPrice <= 0) {
      console.warn(`[WARN] Invalid simulated price for ${s.symbol}, resetting to base.`);
      newPrice = s.basePrice;
    }
    if (!volume || isNaN(volume) || volume <= 0) {
      volume = s.baseVolume;
    }

    currentPrices.set(s.symbol, newPrice);

    results.push({
      symbol: s.symbol,
      prevPrice,
      price: newPrice,
      pctChange: Number(pctChange.toFixed(2)),
      volume,
      isJump,
      timestamp: now,
    });
  }

  // Persist to database
  insertMany(results);

  // Pretty print output
  const timeStr = new Date().toLocaleTimeString();
  console.log(`\n[${timeStr}] ── Tick Update ─────────────────────────────────────`);
  for (const r of results) {
    const sign = r.pctChange >= 0 ? '+' : '';
    const pctStr = `${sign}${r.pctChange.toFixed(2)}%`.padStart(7);
    const priceStr = `₹${r.price.toFixed(2)}`.padStart(11);
    const volStr = `Vol: ${r.volume.toLocaleString().padStart(8)}`;
    const jumpTag = r.isJump ? ` ⚡ [NEWS JUMP ${r.pctChange >= 0 ? 'SURGE' : 'DROP'}]` : '';

    console.log(`  ${r.symbol.padEnd(9)} ${priceStr} (${pctStr})  ${volStr}${jumpTag}`);
  }

  return results;
}

/**
 * Pre-populate 7 days of realistic historical price data (hourly intervals)
 * for testing the 7-day meaningful change calculations immediately.
 */
export function seedHistory(days = 7) {
  console.log(`\nGenerating ${days} days of baseline hourly history for all symbols...`);
  const totalHours = days * 24;
  const insertStmt = db.prepare(`
    INSERT INTO price_history (symbol, price, volume, timestamp)
    VALUES (?, ?, ?, ?)
  `);

  const nowMs = Date.now();
  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      insertStmt.run(r.symbol, r.price, r.volume, r.timestamp);
    }
  });

  const batch = [];

  for (const s of SYMBOLS) {
    let simPrice = s.basePrice;

    for (let h = totalHours; h >= 1; h--) {
      const timestamp = new Date(nowMs - h * 3600 * 1000).toISOString();
      const isJump = Math.random() < 0.05;
      let pctChange;
      let volume;

      if (isJump) {
        const direction = Math.random() < 0.5 ? 1 : -1;
        pctChange = direction * (3.0 + Math.random() * 2.0);
        volume = Math.round(s.baseVolume * (2.5 + Math.random() * 2.5) * 6); // 6x for hourly volume
      } else {
        pctChange = (Math.random() - 0.5) * 1.0;
        volume = Math.round(s.baseVolume * (0.7 + Math.random() * 0.6) * 6);
      }

      simPrice = Number((simPrice * (1 + pctChange / 100)).toFixed(2));
      if (simPrice <= 0) simPrice = s.basePrice;

      batch.push({
        symbol: s.symbol,
        price: simPrice,
        volume,
        timestamp,
      });
    }
  }

  insertMany(batch);
  console.log(`✔ Generated ${batch.length} historical price rows across ${SYMBOLS.length} symbols (${days} days).`);
}

/**
 * Start the standalone simulator loop
 */
export function startSimulator({ intervalMs = 10000, once = false } = {}) {
  initializePrices();

  console.log('====================================================');
  console.log('       SMART MARKET WATCHLIST - PRICE SIMULATOR     ');
  console.log('====================================================');
  console.log(`Symbols tracked: ${SYMBOLS.map(s => s.symbol).join(', ')}`);
  console.log(`Tick interval:   ${intervalMs / 1000}s`);
  console.log(`Database target: market.db`);
  console.log('Press Ctrl+C to stop.\n');

  // Run immediate first tick
  simulateTick();

  if (once) {
    console.log('\n✔ Completed single tick (--once). Exiting.');
    return;
  }

  const timer = setInterval(() => {
    try {
      simulateTick();
    } catch (err) {
      console.error('Error during tick execution:', err);
    }
  }, intervalMs);

  // Graceful shutdown
  const handleShutdown = () => {
    console.log('\nStopping simulator...');
    clearInterval(timer);
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}

// Check command line execution
const isMain = process.argv[1] && (
  process.argv[1].endsWith('simulator.js') || 
  process.argv[1].endsWith('simulator')
);

if (isMain) {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const doSeed = args.includes('--seed-history');

  if (doSeed) {
    seedHistory(7);
  }

  startSimulator({ intervalMs: 10000, once });
}
