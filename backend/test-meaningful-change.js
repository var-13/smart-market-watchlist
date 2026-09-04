import { calculateMeaningfulChange, sanitizeHistory } from './src/services/meaningfulChange.js';

console.log('================================================================');
console.log('       MEANINGFUL CHANGE LOGIC — INDEPENDENT TEST SUITE        ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✖ FAIL: ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Test Case 1: Barely moved stock (normal intraday noise)
// ─────────────────────────────────────────────────────────────
console.log('--- Case 1: Stock That Barely Moved ---');
const case1 = calculateMeaningfulChange({
  currentPrice: 1002.00,
  currentVolume: 11000,
  baselinePrice: 1000.00, // +0.20% move
  baselineAvgDailyMove: 1.50, // 1.5% usual daily move
  baselineAvgVolume: 12000,
});
console.log('Result:', case1);
assert(case1.rawPctChange === 0.20, 'Raw % change is +0.20%');
assert(case1.changeScore === 0.13, 'Change score is 0.13 (0.20 / 1.50)');
assert(case1.isMeaningful === false, 'isMeaningful is false (score <= 1.5)');
assert(case1.reason.includes('Within normal range'), 'Reason indicates within normal range');

// ─────────────────────────────────────────────────────────────
// Test Case 2: Stock that moved a lot relative to its history
// ─────────────────────────────────────────────────────────────
console.log('\n--- Case 2: Stock That Moved A Lot (3.5x usual move) ---');
const case2 = calculateMeaningfulChange({
  currentPrice: 1042.00,
  currentVolume: 15000,
  baselinePrice: 1000.00, // +4.20% move
  baselineAvgDailyMove: 1.20, // 1.2% usual daily move
  baselineAvgVolume: 14000,
});
console.log('Result:', case2);
assert(case2.rawPctChange === 4.20, 'Raw % change is +4.20%');
assert(case2.changeScore === 3.50, 'Change score is 3.50 (4.20 / 1.20)');
assert(case2.isMeaningful === true, 'isMeaningful is true (score > 1.5)');
assert(case2.reason.includes('Up 4.2% — 3.5x its usual daily move'), 'Reason matches formatted string');

// ─────────────────────────────────────────────────────────────
// Test Case 3: Stock with volume surge (>2x avg volume)
// ─────────────────────────────────────────────────────────────
console.log('\n--- Case 3: Stock With Volume Surge (Modest price move, 2.8x volume) ---');
const case3 = calculateMeaningfulChange({
  currentPrice: 502.00,
  currentVolume: 56000, // 2.8x baseline volume
  baselinePrice: 500.00, // +0.40% move
  baselineAvgDailyMove: 1.10, // score 0.36 <= 1.5
  baselineAvgVolume: 20000,
});
console.log('Result:', case3);
assert(case3.changeScore === 0.36, 'Change score is 0.36');
assert(case3.isVolumeSurge === true, 'isVolumeSurge is true (56k > 2x 20k)');
assert(case3.isMeaningful === true, 'isMeaningful is true due to volume surge');
assert(case3.reason.includes('Unusual volume surge (2.8x avg)'), 'Reason explains volume surge');

// ─────────────────────────────────────────────────────────────
// Test Case 4: Stock with no comparison / newly added
// ─────────────────────────────────────────────────────────────
console.log('\n--- Case 4: Stock With No Prior View Yet ---');
const case4 = calculateMeaningfulChange({
  currentPrice: 2500.00,
  currentVolume: 8000,
  baselinePrice: null, // never viewed
});
console.log('Result:', case4);
assert(case4.rawPctChange === null, 'rawPctChange is null');
assert(case4.changeScore === 0, 'changeScore is 0');
assert(case4.isMeaningful === false, 'isMeaningful is false');
assert(case4.reason === 'No prior view comparison yet', 'Reason shows no prior view message');

// ─────────────────────────────────────────────────────────────
// Test Case 5: Bad data sanitization (negative prices & duplicate timestamps)
// ─────────────────────────────────────────────────────────────
console.log('\n--- Case 5: Data Integrity & Bad Data Discard ---');
const dirtyHistory = [
  { price: 100, volume: 1000, timestamp: '2026-09-01T10:00:00Z' },
  { price: -50, volume: 500, timestamp: '2026-09-01T11:00:00Z' }, // Discard: negative price
  { price: 105, volume: 0, timestamp: '2026-09-01T12:00:00Z' },    // Discard: 0 volume
  { price: 102, volume: 1200, timestamp: '2026-09-01T10:00:00Z' }, // Discard: duplicate timestamp
  { price: 104, volume: 1100, timestamp: '2026-09-02T10:00:00Z' }, // Valid
];
const clean = sanitizeHistory(dirtyHistory);
assert(clean.length === 2, `Sanitized 5 rows down to 2 valid rows (got ${clean.length})`);

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
