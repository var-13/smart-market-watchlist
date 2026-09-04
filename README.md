# Smart Market Watchlist

🌐 **[Live Demo](https://smart-market-watchlist-klvd.onrender.com/)** ·

A contextual stock watchlist designed around how retail investors actually process market shifts. Traditional watchlists flash uncontextualized green and red percentages, leaving users to guess whether a 2% move is routine noise or an exceptional event. This project builds an end-to-end platform that computes baseline volatility for each asset and alerts users only when price action or trading volume breaks out of historical norms.

| Resource | Link / Detail | Status |
|---|---|---|
| Live Product | [smart-market-watchlist-klvd.onrender.com](https://smart-market-watchlist-klvd.onrender.com) | Online |
| Source Code | [github.com/var-13/smart-market-watchlist](https://github.com/var-13/smart-market-watchlist) | Public |
| Automated Tests | 17 unit & resilience test cases | 100% Passing |
| Tech Architecture | React 18 · Node.js Express · SQLite (WAL mode) | Production Build |

## 100-Word Product Pitch

Inspired by Groww's core philosophy—making finance simple, responsible, and transparent—I built the Smart Market Watchlist to replace raw market noise with actionable context. Most retail investors struggle to interpret whether a daily percentage move matters. By pairing each stock with its 7-day volatility baseline and volume metrics, the system calculates a normalized change_score since the user's last visit. Built end-to-end with React and Node.js/SQLite, it delivers plain-English explanations, dual live/simulated feeds, and persistent visit tracking. It empowers everyday investors to focus only on what truly deserves their attention.

## Full Tech Stack

![Smart Market Watchlist Architecture](./assets/watchlist_architecture.svg)

