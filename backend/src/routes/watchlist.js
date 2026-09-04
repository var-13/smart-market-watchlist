import { Router } from 'express';
import db from '../db/db.js';
import { SYMBOLS } from '../simulator.js';
import { getMeaningfulChangeForSymbol } from '../services/meaningfulChange.js';

const router = Router();
const DEFAULT_USER_ID = 1;
const SUPPORTED_SYMBOLS = SYMBOLS.map(s => s.symbol);

/**
 * GET /watchlist
 * Return user's watchlist items with:
 * - current_price
 * - current_volume
 * - % change since last_viewed (or since added)
 * - change_score
 * - is_meaningful flag
 * - reason string
 * Sorted by change_score DESC (meaningful movers first)
 */
router.get('/', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT id, user_id, symbol, added_at
      FROM watchlist_items
      WHERE user_id = ?
    `).all(DEFAULT_USER_ID);

    // Compute meaningful change metrics for each symbol
    const enriched = items.map(item => {
      const metrics = getMeaningfulChangeForSymbol(DEFAULT_USER_ID, item.symbol);
      return {
        id: item.id,
        user_id: item.user_id,
        symbol: item.symbol,
        added_at: item.added_at,
        current_price: metrics.currentPrice,
        current_volume: metrics.currentVolume,
        last_updated: metrics.lastUpdated,
        last_viewed_at: metrics.lastViewedAt,
        price_at_last_view: metrics.baselinePrice,
        pct_change: metrics.rawPctChange,
        change_score: metrics.changeScore,
        avg_daily_move: metrics.avgDailyMove,
        is_meaningful: metrics.isMeaningful,
        is_volume_surge: metrics.isVolumeSurge,
        volume_ratio: metrics.volumeRatio,
        reason: metrics.reason,
        source: metrics.source || 'simulated',
      };
    });

    // Sort by change_score descending, putting highest priority changes first
    enriched.sort((a, b) => (b.change_score || 0) - (a.change_score || 0));

    return res.json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return res.status(500).json({ success: false, error: 'Internal server error fetching watchlist.' });
  }
});

/**
 * POST /watchlist/:symbol/viewed
 * Mark a single stock as viewed now and update last_viewed table
 */
router.post('/:symbol/viewed', (req, res) => {
  try {
    const rawSymbol = req.params.symbol;
    if (!rawSymbol) {
      return res.status(400).json({ success: false, error: 'Symbol parameter is required.' });
    }

    const sym = rawSymbol.trim().toUpperCase();

    // Get current price of symbol
    const latest = db.prepare(`
      SELECT price FROM price_history 
      WHERE symbol = ? 
      ORDER BY timestamp DESC, id DESC 
      LIMIT 1
    `).get(sym);

    const currentPrice = latest ? latest.price : null;

    // Upsert into last_viewed
    db.prepare(`
      INSERT INTO last_viewed (user_id, symbol, last_viewed_at, price_at_last_view)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(user_id, symbol) DO UPDATE SET
        last_viewed_at = CURRENT_TIMESTAMP,
        price_at_last_view = excluded.price_at_last_view
    `).run(DEFAULT_USER_ID, sym, currentPrice);

    return res.json({
      success: true,
      message: `Marked '${sym}' as viewed. Baseline price updated.`,
      data: {
        user_id: DEFAULT_USER_ID,
        symbol: sym,
        price_at_last_view: currentPrice,
        last_viewed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating last_viewed for symbol:', error);
    return res.status(500).json({ success: false, error: 'Internal server error updating last_viewed.' });
  }
});

/**
 * POST /watchlist/viewed
 * Mark all watchlist stocks as viewed now (convenience endpoint for page load)
 */
router.post('/viewed', (req, res) => {
  try {
    const watchlist = db.prepare(`
      SELECT symbol FROM watchlist_items WHERE user_id = ?
    `).all(DEFAULT_USER_ID);

    const upsertStmt = db.prepare(`
      INSERT INTO last_viewed (user_id, symbol, last_viewed_at, price_at_last_view)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(user_id, symbol) DO UPDATE SET
        last_viewed_at = CURRENT_TIMESTAMP,
        price_at_last_view = excluded.price_at_last_view
    `);

    const updated = [];
    const updateAll = db.transaction(() => {
      for (const item of watchlist) {
        const latest = db.prepare(`
          SELECT price FROM price_history 
          WHERE symbol = ? 
          ORDER BY timestamp DESC, id DESC 
          LIMIT 1
        `).get(item.symbol);

        const currentPrice = latest ? latest.price : null;
        upsertStmt.run(DEFAULT_USER_ID, item.symbol, currentPrice);
        updated.push({ symbol: item.symbol, price: currentPrice });
      }
    });

    updateAll();

    return res.json({
      success: true,
      message: `Marked all ${updated.length} watchlist stocks as viewed.`,
      data: updated,
    });
  } catch (error) {
    console.error('Error updating all last_viewed:', error);
    return res.status(500).json({ success: false, error: 'Internal server error updating all last_viewed.' });
  }
});

/**
 * POST /watchlist
 * Add a stock symbol to the watchlist
 */
router.post('/', (req, res) => {
  try {
    const { symbol } = req.body;

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Stock symbol is required (string).',
      });
    }

    const sym = symbol.trim().toUpperCase();

    if (!SUPPORTED_SYMBOLS.includes(sym)) {
      return res.status(400).json({
        success: false,
        error: `Symbol '${sym}' is not supported. Supported symbols: ${SUPPORTED_SYMBOLS.join(', ')}`,
      });
    }

    // Check if already in watchlist
    const existing = db.prepare(`
      SELECT id FROM watchlist_items 
      WHERE user_id = ? AND symbol = ?
    `).get(DEFAULT_USER_ID, sym);

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Symbol '${sym}' is already in your watchlist.`,
      });
    }

    const insertResult = db.prepare(`
      INSERT INTO watchlist_items (user_id, symbol)
      VALUES (?, ?)
    `).run(DEFAULT_USER_ID, sym);

    const metrics = getMeaningfulChangeForSymbol(DEFAULT_USER_ID, sym);

    return res.status(201).json({
      success: true,
      message: `Stock '${sym}' successfully added to watchlist.`,
      data: {
        id: insertResult.lastInsertRowid,
        user_id: DEFAULT_USER_ID,
        symbol: sym,
        current_price: metrics.currentPrice,
        current_volume: metrics.currentVolume,
        last_updated: metrics.lastUpdated,
        pct_change: metrics.rawPctChange,
        change_score: metrics.changeScore,
        is_meaningful: metrics.isMeaningful,
        reason: metrics.reason,
      },
    });
  } catch (error) {
    console.error('Error adding stock to watchlist:', error);
    return res.status(500).json({ success: false, error: 'Internal server error adding stock.' });
  }
});

/**
 * DELETE /watchlist/:symbol
 * Remove a stock symbol from the watchlist
 */
router.delete('/:symbol', (req, res) => {
  try {
    const rawSymbol = req.params.symbol;
    if (!rawSymbol) {
      return res.status(400).json({ success: false, error: 'Symbol parameter is required.' });
    }

    const sym = rawSymbol.trim().toUpperCase();

    const existing = db.prepare(`
      SELECT id FROM watchlist_items 
      WHERE user_id = ? AND symbol = ?
    `).get(DEFAULT_USER_ID, sym);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Symbol '${sym}' not found in your watchlist.`,
      });
    }

    db.prepare(`
      DELETE FROM watchlist_items 
      WHERE user_id = ? AND symbol = ?
    `).run(DEFAULT_USER_ID, sym);

    db.prepare(`
      DELETE FROM last_viewed 
      WHERE user_id = ? AND symbol = ?
    `).run(DEFAULT_USER_ID, sym);

    return res.json({
      success: true,
      message: `Stock '${sym}' successfully removed from watchlist.`,
      symbol: sym,
    });
  } catch (error) {
    console.error('Error deleting stock from watchlist:', error);
    return res.status(500).json({ success: false, error: 'Internal server error deleting stock.' });
  }
});

export default router;
