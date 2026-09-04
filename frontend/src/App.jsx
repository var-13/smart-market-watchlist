import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Zap, 
  Flame, 
  Trash2, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  Activity, 
  Eye, 
  Layers,
  AlertCircle
} from 'lucide-react';

const ALL_SYMBOLS = [
  { symbol: 'TCS', name: 'Tata Consultancy Services' },
  { symbol: 'INFY', name: 'Infosys Limited' },
  { symbol: 'RELIANCE', name: 'Reliance Industries' },
  { symbol: 'HDFC', name: 'HDFC Bank Limited' },
  { symbol: 'WIPRO', name: 'Wipro Limited' },
];

const API_BASE = import.meta.env.VITE_API_BASE || (
  typeof window !== 'undefined' && window.location.port === '3000'
    ? 'http://localhost:5000'
    : ''
);

export default function App() {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [ackNotice, setAckNotice] = useState('');
  const initialViewedCalled = useRef(false);

  // Fetch watchlist data
  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/watchlist`);
      const json = await res.json();
      if (json.success) {
        setWatchlist(json.data);
        setSecondsAgo(0);
        setErrorMsg('');
      } else {
        setErrorMsg(json.error || 'Failed to fetch watchlist');
      }
    } catch (err) {
      console.error('Error fetching watchlist:', err);
      setErrorMsg('Could not connect to backend server on port 5000.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Mark all viewed
  const markAllViewed = async (isAuto = false) => {
    try {
      const res = await fetch(`${API_BASE}/watchlist/viewed`, { method: 'POST' });
      const json = await res.json();
      if (json.success && !isAuto) {
        setAckNotice('Baseline updated to current prices.');
        setTimeout(() => setAckNotice(''), 4000);
        await fetchWatchlist();
      }
    } catch (err) {
      console.error('Error marking viewed:', err);
    }
  };

  // Initial load: Fetch watchlist and trigger /viewed endpoint as specified
  useEffect(() => {
    const init = async () => {
      await fetchWatchlist();
      if (!initialViewedCalled.current) {
        initialViewedCalled.current = true;
        // Call viewed on page load
        await markAllViewed(true);
      }
    };
    init();
  }, [fetchWatchlist]);

  // Polling every 10 seconds to sync with the price simulator
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWatchlist();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchWatchlist]);

  // Seconds ago timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Add stock handler
  const handleAddStock = async (symToAdd) => {
    const symbol = (symToAdd || selectedSymbol).trim().toUpperCase();
    if (!symbol) return;

    setActionLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`${API_BASE}/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      const json = await res.json();

      if (json.success) {
        setSelectedSymbol('');
        await fetchWatchlist();
      } else {
        setErrorMsg(json.error || 'Failed to add stock');
      }
    } catch (err) {
      setErrorMsg('Network error while adding stock.');
    } finally {
      setActionLoading(false);
    }
  };

  // Remove stock handler
  const handleRemoveStock = async (symbol) => {
    setActionLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`${API_BASE}/watchlist/${symbol}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (json.success) {
        await fetchWatchlist();
      } else {
        setErrorMsg(json.error || 'Failed to remove stock');
      }
    } catch (err) {
      setErrorMsg('Network error while removing stock.');
    } finally {
      setActionLoading(false);
    }
  };

  // Identify symbols not yet in watchlist for Quick-Add chips
  const watchlistSymbols = new Set(watchlist.map(item => item.symbol));
  const availableToAdd = ALL_SYMBOLS.filter(s => !watchlistSymbols.has(s.symbol));

  // Compute meaningful changes for the summary section
  const meaningfulMovers = watchlist.filter(item => item.is_meaningful);

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <nav className="navbar">
        <div className="nav-content">
          <div className="brand-group">
            <div className="brand-logo">G</div>
            <h1 className="brand-title">Smart Market Watchlist</h1>
            <span className="brand-badge">Groww Insights</span>
          </div>

          <div className="nav-actions">
            <div className="freshness-indicator">
              <span className="pulse-dot" />
              <span>
                {secondsAgo < 5
                  ? 'Just updated'
                  : secondsAgo < 60
                  ? `Updated ${secondsAgo}s ago`
                  : secondsAgo < 3600
                  ? `Updated ${Math.floor(secondsAgo / 60)}m ago`
                  : `Updated ${Math.floor(secondsAgo / 3600)}h ago`}
              </span>
            </div>
            <button 
              className="btn-refresh" 
              onClick={fetchWatchlist} 
              title="Refresh Watchlist"
            >
              <RefreshCw size={13} /> Refresh
            </button>
            <div className="user-chip">
              <div className="user-avatar">A</div>
              <span>Trader Alex</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Error Notification Banner */}
        {errorMsg && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fee2e2',
            color: '#b91c1c',
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Ack Notice */}
        {ackNotice && (
          <div style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #d1fae5',
            color: '#047857',
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px'
          }}>
            <CheckCircle2 size={16} />
            <span>{ackNotice}</span>
          </div>
        )}

        {/* "Since You Last Checked" Summary Section */}
        <section className="summary-card">
          <div className="summary-header">
            <div className="summary-title-row">
              <Eye size={18} color="#4447ff" />
              <h2 className="summary-title">Since You Last Checked</h2>
            </div>
            <button 
              className="btn-ack" 
              onClick={() => markAllViewed(false)}
              title="Reset baseline prices to current live prices"
            >
              <CheckCircle2 size={14} /> Mark all as viewed
            </button>
          </div>

          <p className="summary-desc">
            {meaningfulMovers.length > 0 ? (
              <>
                <strong>{meaningfulMovers.length} stock{meaningfulMovers.length > 1 ? 's' : ''}</strong> had meaningful changes beyond normal market noise:
              </>
            ) : (
              'All watchlist stocks are trading within their typical historical volatility ranges.'
            )}
          </p>

          {meaningfulMovers.length > 0 ? (
            <div className="summary-highlights">
              {meaningfulMovers.map(stock => (
                <div key={stock.symbol} className="highlight-pill">
                  {stock.is_volume_surge ? <Flame size={14} color="#ea580c" /> : <Zap size={14} color="#d97706" />}
                  <strong>{stock.symbol}</strong>: {stock.reason}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', marginBottom: '8px' }}>
              No unusual spikes detected. Prices and volumes are within standard 7-day bounds.
            </div>
          )}
        </section>

        {/* Add Stock & Controls Card */}
        <section className="controls-card">
          <div className="add-stock-form">
            <select
              className="stock-select"
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              disabled={actionLoading || availableToAdd.length === 0}
            >
              <option value="">
                {availableToAdd.length === 0 ? 'All available stocks added' : 'Select a stock to add...'}
              </option>
              {availableToAdd.map(item => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} — {item.name}
                </option>
              ))}
            </select>
            <button 
              className="btn-primary"
              onClick={() => handleAddStock()}
              disabled={!selectedSymbol || actionLoading}
            >
              <Plus size={16} /> Add Stock
            </button>
          </div>

          {/* Quick-add chips for non-watchlist stocks */}
          {availableToAdd.length > 0 && (
            <div className="quick-add-row">
              <span className="quick-add-label">Quick Add:</span>
              {availableToAdd.map(item => (
                <button
                  key={item.symbol}
                  className="quick-chip"
                  onClick={() => handleAddStock(item.symbol)}
                  disabled={actionLoading}
                >
                  +{item.symbol}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Watchlist Section */}
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="#1e293b" />
            <h3 className="section-title">Your Watchlist ({watchlist.length})</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Prominent freshness indicator anchored to the watchlist */}
            <span style={{
              fontSize: '12px',
              color: secondsAgo < 15 ? '#00b386' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 500,
            }}>
              <RefreshCw size={12} />
              {secondsAgo < 5
                ? 'Just updated'
                : secondsAgo < 60
                ? `Updated ${secondsAgo}s ago`
                : secondsAgo < 3600
                ? `Updated ${Math.floor(secondsAgo / 60)}m ago`
                : 'Last update was a while ago'}
            </span>
            <span className="sort-info">Sorted by Change Score</span>
          </div>
        </div>

        {/* Watchlist Card List */}
        {loading ? (
          <div className="empty-state">
            <Activity className="empty-icon animate-spin" />
            <p>Loading your market watchlist...</p>
          </div>
        ) : watchlist.length === 0 ? (
          <div className="empty-state">
            <Layers className="empty-icon" />
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
              Your watchlist is empty
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
              You haven't added any stocks yet. Use the <strong>Quick Add</strong> chips or the dropdown above
              to start tracking <strong>TCS, INFY, RELIANCE, HDFC</strong>, or <strong>WIPRO</strong>.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {ALL_SYMBOLS.map(s => (
                <button
                  key={s.symbol}
                  className="quick-chip"
                  onClick={() => handleAddStock(s.symbol)}
                  disabled={actionLoading}
                  style={{ fontSize: '13px', padding: '5px 14px' }}
                >
                  + {s.symbol}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="watchlist-cards-list">
            {watchlist.map((stock) => {
              const symInfo = ALL_SYMBOLS.find(s => s.symbol === stock.symbol);
              const isUp = stock.pct_change > 0;
              const isDown = stock.pct_change < 0;
              const isZeroOrNull = stock.pct_change === 0 || stock.pct_change === null;

              return (
                <div 
                  key={stock.symbol} 
                  className={`stock-card ${stock.is_meaningful ? 'meaningful-highlight' : ''}`}
                >
                  {/* Left: Symbol, Company name, Added time */}
                  <div className="stock-left">
                    <div className="symbol-row">
                      <span className="symbol-name">{stock.symbol}</span>
                      {stock.source && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: stock.source === 'live' ? '#ecfdf5' : '#fef9c3',
                          color: stock.source === 'live' ? '#059669' : '#b45309',
                          border: `1px solid ${stock.source === 'live' ? '#a7f3d0' : '#fde68a'}`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px',
                        }}>
                          {stock.source === 'live' ? '● Live' : '○ Sim'}
                        </span>
                      )}
                    </div>
                    <span className="company-name">{symInfo?.name || 'Stock Asset'}</span>
                    <span className="added-time">
                      Added: {new Date(stock.added_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Middle: Badges & Explainable Reason */}
                  <div className="stock-middle">
                    <div className="badge-row">
                      {stock.is_meaningful && (
                        <span className="meaningful-badge">
                          {stock.is_volume_surge ? <Flame size={12} /> : <Zap size={12} />}
                          {stock.is_volume_surge && stock.change_score > 1.5 
                            ? 'Meaningful & Surge' 
                            : stock.is_volume_surge 
                              ? 'Volume Surge' 
                              : 'Meaningful Move'}
                        </span>
                      )}
                      {stock.change_score > 0 && (
                        <span className="score-badge">
                          Score: {stock.change_score}x
                        </span>
                      )}
                    </div>
                    <p className="stock-reason">{stock.reason}</p>
                  </div>

                  {/* Right: Current Price, % Change, Remove Button */}
                  <div className="stock-right">
                    <div className="price-column">
                      <span className="current-price">
                        {stock.current_price !== null 
                          ? `₹${Number(stock.current_price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </span>

                      <span className={`pct-chip ${isUp ? 'up' : isDown ? 'down' : 'neutral'}`}>
                        {isUp && <TrendingUp size={13} />}
                        {isDown && <TrendingDown size={13} />}
                        {isZeroOrNull && <Minus size={13} />}
                        {stock.pct_change !== null 
                          ? `${isUp ? '+' : ''}${stock.pct_change.toFixed(2)}%`
                          : 'New'}
                      </span>
                    </div>

                    <button 
                      className="btn-remove" 
                      onClick={() => handleRemoveStock(stock.symbol)}
                      title={`Remove ${stock.symbol} from watchlist`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
