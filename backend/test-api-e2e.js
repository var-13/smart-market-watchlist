import assert from 'node:assert';
import express from 'express';
import cors from 'cors';
import watchlistRouter from './src/routes/watchlist.js';

console.log('================================================================');
console.log('            API ENDPOINT END-TO-END VERIFICATION               ');
console.log('================================================================\n');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/watchlist', watchlistRouter);

const TEST_PORT = 5009;

const server = app.listen(TEST_PORT, async () => {
  try {
    const baseUrl = `http://localhost:${TEST_PORT}`;

    // Test 1: GET /watchlist
    console.log('--- Test 1: GET /watchlist ---');
    const res1 = await fetch(`${baseUrl}/watchlist`);
    assert.strictEqual(res1.status, 200, 'GET /watchlist should return 200');
    const data1 = await res1.json();
    assert(data1.success, 'Response should indicate success');
    assert(Array.isArray(data1.data), 'data should be an array');
    console.log(`  ✔ PASS: Watchlist fetched ${data1.count} items`);
    if (data1.data.length > 0) {
      const first = data1.data[0];
      assert('source' in first, 'Item should contain source property');
      assert(['live', 'simulated'].includes(first.source), `Source must be 'live' or 'simulated' (got: ${first.source})`);
      console.log(`  ✔ PASS: Stock ${first.symbol} has source='${first.source}', price=₹${first.current_price}`);
    }

    // Test 2: POST /watchlist to add a stock (if any not present, e.g. WIPRO or INFY)
    console.log('\n--- Test 2: POST /watchlist (Add stock) ---');
    const addRes = await fetch(`${baseUrl}/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'INFY' })
    });
    const addData = await addRes.json();
    // It will either succeed (201) or say already in watchlist (409)
    assert([200, 201, 409].includes(addRes.status), `Expected 200/201/409, got ${addRes.status}`);
    console.log(`  ✔ PASS: Add stock responded with status ${addRes.status} (${addData.message || addData.error || 'ok'})`);

    // Test 3: POST /watchlist/viewed
    console.log('\n--- Test 3: POST /watchlist/viewed (Acknowledge view) ---');
    const viewRes = await fetch(`${baseUrl}/watchlist/viewed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.strictEqual(viewRes.status, 200, 'POST /watchlist/viewed should return 200');
    const viewData = await viewRes.json();
    assert(viewData.success, 'Viewed response should have success: true');
    console.log(`  ✔ PASS: Acknowledged view on ${viewData.updated_symbols?.length || 0} stocks`);

    console.log('\n================================================================');
    console.log('ALL API ENDPOINTS VERIFIED AND WORKING CORRECTLY!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
