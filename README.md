# Smart Market Watchlist — Groww CODE 2026

A production-grade, end-to-end stock watchlist designed for Groww's engineering build challenge. Rather than overwhelming users with raw red and green percentages, it algorithmically detects and explains **meaningful changes** relative to each asset's historical volatility since their last visit.

---

## 100-Word Product Pitch

> Standard watchlists display raw price fluctuations, forcing investors to mentally calculate what actually matters. The Smart Market Watchlist cuts through market noise by defining "meaningful change" mathematically: normalizing price delta against each stock's 7-day volatility baseline (`change_score = |% move| / avg_daily_move`) combined with volume surge detection (>2x volume). Built with a Node.js/SQLite backend and React frontend styled after Groww’s clean fintech aesthetic, it features atomic transaction processing, dual live Yahoo Finance ingestion with automatic offline simulation fallback, multi-tier data sanitization, and session-aware baseline tracking. It transforms passive ticker monitoring into actionable, explainable intelligence.

---

## How It Meets Groww's Challenge Requirements

| Challenge Requirement | How Our Solution Solves It |
|---|---|
| **Create & manage a watchlist** | Add/remove stocks with instant UI updates, quick-add chips, and persistence. |
| **View latest market information** | Live NSE stock quotes via Yahoo Finance (`TCS.NS`, `INFY.NS`, `RELIANCE.NS`, `HDFCBANK.NS`, `WIPRO.NS`) with live volume and price movements. |
| **Return later and see what has changed** | Persistent `last_viewed` session tracking captures exact price baselines per user visit, displaying what moved specifically *since your last check*. |
| **What counts as "meaningful change"** | Volatility-relative normalization (`change_score > 1.5x` typical daily movement) + volume surges (>2x typical volume), rather than an arbitrary static % threshold. |
| **Information surfaced** | Explainable plain-English reason strings (*"Up 3.2% — 2.1x its usual daily move"*), visual priority badges, and sorting by change significance. |
| **State persistence across sessions** | SQLite database with Write-Ahead Logging (WAL) and foreign keys, persisted in `backend/data/market.db`. |
| **Handling stale / delayed / conflicting data** | Two-tier data validation (SQL + JS) filtering non-positive prices, non-positive volumes, and duplicate timestamps. Automatic per-symbol fallback to local simulation if external API calls fail or timeout. |
| **System scalability & simplicity** | Decoupled pure calculation engine (100% unit-tested, 0 external dependencies), atomic batch database transactions, indexed history queries. |

---

## Technical Architecture & Rubric Alignment

### 1. Engineering Depth
- **Architecture**: Decoupled 3-tier architecture (Ingestion/Simulator &rarr; Express REST API &rarr; React SPA).
- **Storage**: SQLite configured with `PRAGMA journal_mode = WAL` for non-blocking concurrent reads during tick writes, wrapped in atomic transactions so API queries never read a half-written tick.
- **Pure Function Engine**: The meaningful change formula (`calculateMeaningfulChange`) is completely decoupled from HTTP and SQL, allowing deterministic testing across arbitrary fixtures.

### 2. Product & Problem Interpretation
- A 2% move in a utility or mega-cap banking stock (HDFC) is massive news; a 2% move in a high-beta stock is normal daily noise. A static threshold (e.g. `> 3%`) fails investors.
- Our algorithm normalizes the move by the stock's own 7-day average daily price movement:
  $$\text{change\_score} = \frac{|\text{\% change since last viewed}|}{\text{average daily move}}$$
- Stocks are dynamically sorted by `change_score DESC` so the biggest outliers appear first.

### 3. Edge Cases & Resilience
- **Dual Data Source with Auto-Fallback**: Yahoo Finance is queried concurrently with an 8-second hard timeout. If any symbol fails or times out, the local simulator provides continuous fallback ticks for that specific symbol without interrupting the pipeline.
- **Data Sanitization**: Both database queries and application logic enforce strict filters: `price > 0`, `volume > 0`, non-NaN checks, and deduplication of timestamps.
- **Zero History Resilience**: If a stock has no history or baseline yet, the system returns safe defaults (`change_score: 0`, `"No prior view comparison yet"`) without crashing.

### 4. Code Quality & Simplicity
- Clean, idiomatic JavaScript (ES Modules).
- Zero unnecessary heavyweight microservices or bloated dependencies.
- Comprehensive automated test coverage included out-of-the-box.

### 5. Originality & Thoughtfulness
- **Explainability**: Every badge has a clear natural-language rationale explaining *why* it is highlighted.
- **Groww Design Language**: Clean card-based fintech layout, emerald-green up/rose-red down indicators, subtle Groww-indigo accents, and live data status pills (`● LIVE` / `○ SIM`).

---

## Quickstart Guide

### Prerequisites
- Node.js (v18+ recommended)
- npm

### 1. Backend Setup

```powershell
cd backend
npm install
npm run db:init
```

*(Optional Recommended for Demo)* Pre-seed 7 days of historical price context:
```powershell
node simulator.js --seed-history --once
```

### 2. Running the System (3 Terminals)

**Terminal 1 — API Server:**
```powershell
cd backend
npm start
# Server starts at http://localhost:5000
```

**Terminal 2 — Data Provider (Choose Live or Simulated):**

*Option A — Live Yahoo Finance NSE Quotes with Auto-Fallback:*
```powershell
cd backend
npm run live
# Fetches live quotes every 30s; falls back to simulator on ticker timeout
```

*Option B — Standalone Simulator:*
```powershell
cd backend
npm run simulator
# Ticks simulated random walk every 10s
```

**Terminal 3 — Frontend:**
```powershell
cd frontend
npm install
npm run dev
# Frontend runs at http://localhost:3000
```

---

## Automated Verification & Test Commands

Run the comprehensive test suites directly from the `backend/` directory:

```powershell
cd backend

# 1. Meaningful change algorithm unit tests (17 assertions)
node test-meaningful-change.js

# 2. Yahoo Finance live data provider & fallback resilience tests
node test-live-provider.js

# 3. API endpoints end-to-end verification
node test-api-e2e.js
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/watchlist` | Returns user watchlist enriched with `current_price`, `change_score`, `is_meaningful`, `reason`, and `source` ('live'/'simulated'), sorted by significance |
| `POST` | `/watchlist` | Add a stock `{ "symbol": "TCS" }` |
| `DELETE` | `/watchlist/:symbol` | Remove a stock from the watchlist |
| `POST` | `/watchlist/viewed` | Update `last_viewed` baseline for all stocks (called automatically on page visit) |
| `POST` | `/watchlist/:symbol/viewed` | Update `last_viewed` baseline for a specific stock |
| `GET` | `/api/health` | Health check endpoint returning uptime and server timestamp |
