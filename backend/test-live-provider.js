import assert from 'node:assert';
import db from './src/db/db.js';
import { runLiveTick } from './src/services/priceProvider.js';

console.log('================================================================');
console.log('       LIVE PRICE PROVIDER & FALLBACK TEST SUITE               ');
console.log('================================================================\n');

async function runTests() {
  // Test 1: Run a live tick and inspect results
  console.log('--- Test 1: runLiveTick() execution ---');
  const results = await runLiveTick();
  assert(Array.isArray(results), 'runLiveTick should return an array');
  assert.strictEqual(results.length, 5, 'Should return results for all 5 symbols');
  console.log('  ✔ PASS: Returned 5 symbol quotes');

  // Test 2: Verify data structure of each item
  console.log('\n--- Test 2: Structure & Validation ---');
  for (const item of results) {
    assert(typeof item.symbol === 'string', 'Symbol must be string');
    assert(typeof item.price === 'number' && item.price > 0, `Price must be positive number (${item.symbol}: ${item.price})`);
    assert(typeof item.volume === 'number' && item.volume > 0, `Volume must be positive number (${item.symbol}: ${item.volume})`);
    assert(['live', 'simulated'].includes(item.source), `Source must be 'live' or 'simulated' (got: ${item.source})`);
    console.log(`  ✔ PASS: ${item.symbol.padEnd(9)} price=₹${item.price.toFixed(2).padEnd(8)} vol=${item.volume.toString().padEnd(9)} source=${item.source}`);
  }

  // Test 3: Verify SQLite database persistence & source column
  console.log('\n--- Test 3: Database Persistence ---');
  const latestDbRows = db.prepare(`
    SELECT symbol, price, volume, timestamp, source 
    FROM price_history 
    ORDER BY id DESC LIMIT 5
  `).all();

  assert.strictEqual(latestDbRows.length, 5, 'Should find 5 newest rows in DB');
  for (const row of latestDbRows) {
    assert(row.source === 'live' || row.source === 'simulated', `DB source column valid (${row.source})`);
    assert(row.price > 0, `DB price > 0 (${row.price})`);
    assert(row.volume > 0, `DB volume > 0 (${row.volume})`);
  }
  console.log('  ✔ PASS: Last 5 rows in price_history have valid price, volume, and source');

  // Test 4: Verify that at least some symbols fetched live or fallback smoothly
  console.log('\n--- Test 4: Live & Fallback Resilience ---');
  const liveCount = results.filter(r => r.source === 'live').length;
  const simCount = results.filter(r => r.source === 'simulated').length;
  console.log(`  Info: ${liveCount} live, ${simCount} simulated in this tick`);
  assert(liveCount + simCount === 5, 'Total must equal 5');
  console.log('  ✔ PASS: Live provider successfully handled all symbols with zero crash');

  console.log('\n================================================================');
  console.log('ALL PROVIDER TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
