import db from '../db/db.js';

/**
 * Filter and sanitize price history records:
 * - Discard non-positive price/volume
 * - Discard duplicate timestamps (keep latest id)
 * - Sort chronologically ascending
 */
export function sanitizeHistory(history, { verbose = false } = {}) {
  if (!Array.isArray(history)) return [];

  const seenTimestamps = new Set();
  const valid = [];
  let discarded = 0;

  for (const item of history) {
    // Guard: missing or non-object row
    if (!item || typeof item !== 'object') {
      discarded++;
      if (verbose) console.warn('[sanitizeHistory] Discarded null/invalid row.');
      continue;
    }
    // Guard: invalid price (zero, negative, NaN, non-number)
    if (typeof item.price !== 'number' || item.price <= 0 || isNaN(item.price)) {
      discarded++;
      if (verbose) console.warn(`[sanitizeHistory] Discarded bad price: ${item.price} at ${item.timestamp}`);
      continue;
    }
    // Guard: invalid volume (zero, negative, NaN, non-number)
    if (typeof item.volume !== 'number' || item.volume <= 0 || isNaN(item.volume)) {
      discarded++;
      if (verbose) console.warn(`[sanitizeHistory] Discarded bad volume: ${item.volume} at ${item.timestamp}`);
      continue;
    }
    // Guard: missing timestamp
    if (!item.timestamp) {
      discarded++;
      if (verbose) console.warn('[sanitizeHistory] Discarded row with missing timestamp.');
      continue;
    }
    // Guard: duplicate timestamp — keep first seen (earliest id from SQL ordering)
    if (seenTimestamps.has(item.timestamp)) {
      discarded++;
      if (verbose) console.warn(`[sanitizeHistory] Discarded duplicate timestamp: ${item.timestamp}`);
      continue;
    }
    seenTimestamps.add(item.timestamp);
    valid.push(item);
  }

  if (discarded > 0) {
    console.warn(`[sanitizeHistory] Discarded ${discarded} bad/duplicate row(s) out of ${history.length}.`);
  }

  return valid.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/**
 * Pure calculation function for meaningful change metrics.
 * Decoupled from the database so it can be tested with arbitrary fixtures.
 */
export function calculateMeaningfulChange({
  currentPrice,
  currentVolume,
  baselinePrice = null,
  priceHistory = [],
  baselineAvgDailyMove = null,
  baselineAvgVolume = null,
}) {
  // Edge Case 1: No comparison available (no last_viewed and no baseline)
  if (baselinePrice === null || baselinePrice === undefined || baselinePrice <= 0) {
    return {
      rawPctChange: null,
      avgDailyMove: null,
      changeScore: 0,
      isMeaningful: false,
      isVolumeSurge: false,
      volumeRatio: 1.0,
      reason: 'No prior view comparison yet',
    };
  }

  // 1. Raw % price change since baseline
  const rawPctChange = Number((((currentPrice - baselinePrice) / baselinePrice) * 100).toFixed(2));

  // 2. Compute 7-day average absolute daily % move
  let avgDailyMove;
  let avgVolume;

  if (baselineAvgDailyMove !== null && baselineAvgDailyMove !== undefined) {
    avgDailyMove = Math.max(baselineAvgDailyMove, 0.2);
  } else {
    const validHistory = sanitizeHistory(priceHistory);

    // Group by calendar day (YYYY-MM-DD)
    const dayMap = new Map();
    for (const item of validHistory) {
      const day = item.timestamp.slice(0, 10);
      dayMap.set(day, item.price); // takes latest price in that day
    }

    if (dayMap.size >= 2) {
      const dailyPrices = Array.from(dayMap.values());
      const moves = [];
      for (let i = 1; i < dailyPrices.length; i++) {
        const prev = dailyPrices[i - 1];
        const curr = dailyPrices[i];
        moves.push(Math.abs((curr - prev) / prev) * 100);
      }
      avgDailyMove = moves.reduce((sum, v) => sum + v, 0) / moves.length;
    } else if (validHistory.length >= 2) {
      // Fewer than 2 days: compute average move between available samples
      const sampleMoves = [];
      for (let i = 1; i < validHistory.length; i++) {
        const prev = validHistory[i - 1].price;
        const curr = validHistory[i].price;
        sampleMoves.push(Math.abs((curr - prev) / prev) * 100);
      }
      avgDailyMove = sampleMoves.reduce((sum, v) => sum + v, 0) / sampleMoves.length;
    } else {
      // Default fallback if no historical entries exist
      avgDailyMove = 1.0;
    }

    // Safeguard: clamp floor to 0.2% so we never divide by zero
    avgDailyMove = Math.max(Number(avgDailyMove.toFixed(2)), 0.2);
  }

  // 3. Compute recent average volume
  if (baselineAvgVolume !== null && baselineAvgVolume !== undefined) {
    avgVolume = baselineAvgVolume;
  } else {
    const validHistory = sanitizeHistory(priceHistory);
    if (validHistory.length > 0) {
      avgVolume = Math.round(validHistory.reduce((sum, v) => sum + v.volume, 0) / validHistory.length);
    } else {
      avgVolume = currentVolume || 10000;
    }
  }

  // 4. Change Score
  // change_score = |raw % change| / average daily % move
  const changeScore = Number((Math.abs(rawPctChange) / avgDailyMove).toFixed(2));

  // 5. Meaningful conditions:
  // - change_score > 1.5
  // - volume > 2x recent average volume
  const volumeRatio = avgVolume > 0 ? Number((currentVolume / avgVolume).toFixed(1)) : 1.0;
  const isVolumeSurge = avgVolume > 0 && currentVolume > 2.0 * avgVolume;
  const isMeaningful = changeScore > 1.5 || isVolumeSurge;

  // 6. Generate explainable reason string
  const reason = generateReasonString({
    rawPctChange,
    changeScore,
    avgDailyMove,
    isVolumeSurge,
    volumeRatio,
    isMeaningful,
  });

  return {
    rawPctChange,
    avgDailyMove,
    changeScore,
    isMeaningful,
    isVolumeSurge,
    volumeRatio,
    reason,
  };
}

/**
 * Generate human-friendly reason string for market changes
 */
export function generateReasonString({
  rawPctChange,
  changeScore,
  avgDailyMove,
  isVolumeSurge,
  volumeRatio,
  isMeaningful,
}) {
  const dir = rawPctChange >= 0 ? 'Up' : 'Down';
  const absPct = Math.abs(rawPctChange).toFixed(1);
  const sign = rawPctChange >= 0 ? '+' : '';

  if (changeScore > 1.5 && isVolumeSurge) {
    return `${dir} ${absPct}% (${changeScore}x usual daily move) on heavy volume (${volumeRatio}x avg)`;
  }

  if (changeScore > 1.5) {
    return `${dir} ${absPct}% — ${changeScore}x its usual daily move of ${avgDailyMove.toFixed(1)}%`;
  }

  if (isVolumeSurge) {
    return `Unusual volume surge (${volumeRatio}x avg) with modest price move (${sign}${rawPctChange}%)`;
  }

  if (rawPctChange === 0) {
    return 'Unchanged since last check';
  }

  return `Within normal range (${sign}${rawPctChange}% vs ${avgDailyMove.toFixed(1)}% avg move)`;
}

/**
 * Fetch and compute meaningful change metrics for a symbol from SQLite
 */
export function getMeaningfulChangeForSymbol(userId, symbol) {
  // 1. Get latest valid price & volume (SQL-level guard: price > 0 AND volume > 0)
  const latest = db.prepare(`
    SELECT price, volume, timestamp, source 
    FROM price_history 
    WHERE symbol = ? AND price > 0 AND volume > 0
    ORDER BY timestamp DESC, id DESC 
    LIMIT 1
  `).get(symbol);

  // Guard: no price history exists at all for this symbol
  if (!latest) {
    return {
      currentPrice: null,
      currentVolume: null,
      lastUpdated: null,
      baselinePrice: null,
      ...calculateMeaningfulChange({ currentPrice: 0, currentVolume: 0 }),
    };
  }

  // Guard: latest row itself has a bad price value (extra safety beyond SQL)
  if (
    typeof latest.price !== 'number' ||
    latest.price <= 0 ||
    isNaN(latest.price)
  ) {
    console.warn(`[getMeaningfulChangeForSymbol] Latest price row for ${symbol} is invalid (${latest.price}), skipping.`);
    return {
      currentPrice: null,
      currentVolume: null,
      lastUpdated: null,
      baselinePrice: null,
      ...calculateMeaningfulChange({ currentPrice: 0, currentVolume: 0 }),
    };
  }

  // 2. Get last_viewed entry
  const lastViewed = db.prepare(`
    SELECT last_viewed_at, price_at_last_view 
    FROM last_viewed 
    WHERE user_id = ? AND symbol = ?
  `).get(userId, symbol);

  let baselinePrice = null;
  let lastViewedAt = null;

  if (lastViewed && lastViewed.price_at_last_view) {
    const candidate = lastViewed.price_at_last_view;
    // Guard: stored baseline must be a valid positive number
    if (typeof candidate === 'number' && candidate > 0 && !isNaN(candidate)) {
      baselinePrice = candidate;
      lastViewedAt = lastViewed.last_viewed_at;
    } else {
      console.warn(`[getMeaningfulChangeForSymbol] Ignoring invalid price_at_last_view for ${symbol}: ${candidate}`);
    }
  }

  if (baselinePrice === null) {
    // If never viewed (or baseline was bad), check price at watchlist_items.added_at
    const watchItem = db.prepare(`
      SELECT added_at 
      FROM watchlist_items 
      WHERE user_id = ? AND symbol = ?
    `).get(userId, symbol);

    if (watchItem) {
      // Find closest valid price at or before added_at
      const priceAtAdded = db.prepare(`
        SELECT price FROM price_history
        WHERE symbol = ? AND timestamp <= ? AND price > 0 AND volume > 0
        ORDER BY timestamp DESC LIMIT 1
      `).get(symbol, watchItem.added_at);

      if (priceAtAdded && priceAtAdded.price > 0) {
        baselinePrice = priceAtAdded.price;
      }
    }
  }

  // 3. Query last 7 days of price history (discard bad data)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const history = db.prepare(`
    SELECT price, volume, timestamp 
    FROM price_history 
    WHERE symbol = ? 
      AND timestamp >= ? 
      AND price > 0 
      AND volume > 0
    ORDER BY timestamp ASC
  `).all(symbol, sevenDaysAgo);

  const metrics = calculateMeaningfulChange({
    currentPrice: latest.price,
    currentVolume: latest.volume,
    baselinePrice,
    priceHistory: history,
  });

  return {
    currentPrice: latest.price,
    currentVolume: latest.volume,
    lastUpdated: latest.timestamp,
    source: latest.source || 'simulated',
    baselinePrice,
    lastViewedAt,
    ...metrics,
  };
}
