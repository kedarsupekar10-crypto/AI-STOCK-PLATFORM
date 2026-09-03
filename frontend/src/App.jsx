import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = "https://ai-stock-platform-h91p.onrender.com";
function App() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showLogin, setShowLogin] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || null;
    } catch {
      return null;
    }
  });

  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("recentSearches")) || [];
    } catch {
      return [];
    }
  });

  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("watchlist")) || [];
    } catch {
      return [];
    }
  });

  // AI chat state
  const [chatMessages, setChatMessages] = useState([
    { role: "ai", text: "Hi! Ask me about any stock or technical indicator." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Scanner state
  const [scannerResults, setScannerResults] = useState(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerFilters, setScannerFilters] = useState({
    rsi_min: 50,
    rsi_max: 70,
    macd: "Bullish",
    ema: "Above 20 EMA",
  });

  // Markets
  const [markets, setMarkets] = useState([]);

  // F&O state
  const [foUnderlying, setFoUnderlying] = useState("NIFTY");
  const [foUniverse, setFoUniverse] = useState([]);
  const [foExpiries, setFoExpiries] = useState([]);
  const [foExpiry, setFoExpiry] = useState("");
  const [foChain, setFoChain] = useState(null);
  const [foAnalysis, setFoAnalysis] = useState(null);
  const [foFutures, setFoFutures] = useState(null);
  const [foLoading, setFoLoading] = useState(false);
  const [foError, setFoError] = useState("");
  const [foView, setFoView] = useState("chain"); // chain | analysis | futures | greeks
  const [foGreekSymbol, setFoGreekSymbol] = useState("");
  const [foGreeks, setFoGreeks] = useState(null);

  // Chain Chart state
  const [chainChartData, setChainChartData] = useState(null);
  const [chainChartLoading, setChainChartLoading] = useState(false);
  const [selectedStrike, setSelectedStrike] = useState(null);
  const [selectedSide, setSelectedSide] = useState("CE");
  const [strikeHistory, setStrikeHistory] = useState(null);
  const [strikeLoading, setStrikeLoading] = useState(false);

  // Live chart state
  const [chartSymbol, setChartSymbol] = useState("RELIANCE");
  const [chartInterval, setChartInterval] = useState("1d");
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [chartOverlays, setChartOverlays] = useState({
    ema20: true,
    ema50: true,
    bb: true,
    vwap: false,
    signals: true,
  });
  const chartCanvasRef = { current: null };
  const rsiCanvasRef = { current: null };
  const volCanvasRef = { current: null };

  useEffect(() => {
    fetch(`${API_BASE}/api/markets`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.indices) setMarkets(d.indices);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  const searchStock = async () => {
    const stockSymbol = symbol.trim().toUpperCase();
    if (!stockSymbol) return;

    setLoading(true);
    setError("");
    setStock(null);

    try {
      const response = await fetch(`${API_BASE}/api/stock/${stockSymbol}`);

      if (!response.ok) {
        throw new Error("Unable to get stock data");
      }

      const data = await response.json();
      setStock(data);

      const updatedSearches = [
        stockSymbol,
        ...recentSearches.filter((item) => item !== stockSymbol),
      ].slice(0, 5);
      setRecentSearches(updatedSearches);
      localStorage.setItem("recentSearches", JSON.stringify(updatedSearches));
    } catch (err) {
      setError(
        "Cannot connect to backend. Make sure FastAPI is running on port 8000."
      );
    } finally {
      setLoading(false);
    }
  };

  const addToWatchlist = () => {
    if (!stock) return;
    const sym = stock.symbol;
    if (watchlist.find((w) => w.symbol === sym)) return;
    setWatchlist([
      ...watchlist,
      { symbol: sym, price: stock.price, change: stock.change },
    ]);
  };

  const removeFromWatchlist = (sym) => {
    setWatchlist(watchlist.filter((w) => w.symbol !== sym));
  };

  const sendChat = async () => {
    const q = chatInput.trim();
    if (!q || chatLoading) return;

    setChatMessages((m) => [...m, { role: "user", text: q }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setChatMessages((m) => [
        ...m,
        {
          role: "ai",
          text: data.answer || "Sorry, I couldn't process that.",
          signal: data.signal || null,
        },
      ]);
    } catch {
      setChatMessages((m) => [
        ...m,
        {
          role: "ai",
          text: "Cannot connect to backend. Please make sure the server is running.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const runScanner = async () => {
    setScannerLoading(true);
    try {
      const params = new URLSearchParams({
        rsi_min: scannerFilters.rsi_min,
        rsi_max: scannerFilters.rsi_max,
        macd: scannerFilters.macd,
        ema_condition: scannerFilters.ema,
      });
      const res = await fetch(`${API_BASE}/api/scanner?${params}`);
      const data = await res.json();
      setScannerResults(data);
    } catch {
      setScannerResults({ count: 0, results: [], error: "Backend unavailable" });
    } finally {
      setScannerLoading(false);
    }
  };

  // F&O handlers
  const loadFoUniverse = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/fo/universe`);
      const data = await res.json();
      setFoUniverse(data.underlying || []);
    } catch {
      setFoUniverse([]);
    }
  };

  const loadFoExpiries = async (sym) => {
    try {
      const res = await fetch(`${API_BASE}/api/fo/expiries?symbol=${sym}`);
      const data = await res.json();
      const list = data.expiries || [];
      setFoExpiries(list);
      if (list.length && !list.find((e) => e.date === foExpiry)) {
        setFoExpiry(list[0].date);
      }
      return list;
    } catch {
      setFoExpiries([]);
      return [];
    }
  };

  const loadFoChain = async () => {
    if (!foUnderlying) return;
    setFoLoading(true);
    setFoError("");
    try {
      const url = `${API_BASE}/api/fo/option-chain?symbol=${foUnderlying}${
        foExpiry ? `&expiry=${foExpiry}` : ""
      }`;
      const res = await fetch(url);
      const data = await res.json();
      setFoChain(data);
    } catch {
      setFoError("Cannot load option chain");
      setFoChain(null);
    } finally {
      setFoLoading(false);
    }
  };

  const loadFoAnalysis = async () => {
    if (!foUnderlying) return;
    try {
      const url = `${API_BASE}/api/fo/analysis?symbol=${foUnderlying}${
        foExpiry ? `&expiry=${foExpiry}` : ""
      }`;
      const res = await fetch(url);
      setFoAnalysis(await res.json());
    } catch {
      setFoAnalysis(null);
    }
  };

  const loadFoFutures = async () => {
    if (!foUnderlying) return;
    try {
      const res = await fetch(`${API_BASE}/api/fo/futures?symbol=${foUnderlying}`);
      setFoFutures(await res.json());
    } catch {
      setFoFutures(null);
    }
  };

  const loadFoGreeks = async () => {
    if (!foUnderlying || !foExpiry || !foGreekSymbol) return;
    try {
      const url = `${API_BASE}/api/fo/greeks?symbol=${foUnderlying}&expiry=${foExpiry}&trading_symbol=${encodeURIComponent(foGreekSymbol)}`;
      const res = await fetch(url);
      setFoGreeks(await res.json());
    } catch {
      setFoGreeks(null);
    }
  };

  const loadChainChart = async () => {
    if (!foUnderlying) return;
    setChainChartLoading(true);
    try {
      const url = `${API_BASE}/api/fo/oi-distribution?symbol=${foUnderlying}${
        foExpiry ? `&expiry=${foExpiry}` : ""
      }`;
      const res = await fetch(url);
      const data = await res.json();
      setChainChartData(data);
    } catch {
      setChainChartData(null);
    } finally {
      setChainChartLoading(false);
    }
  };

  const loadStrikeHistory = async (strike, side) => {
    setStrikeLoading(true);
    try {
      const url = `${API_BASE}/api/fo/strike-history?symbol=${foUnderlying}&strike=${strike}&side=${side}${
        foExpiry ? `&expiry=${foExpiry}` : ""
      }`;
      const res = await fetch(url);
      const data = await res.json();
      setStrikeHistory(data);
    } catch {
      setStrikeHistory(null);
    } finally {
      setStrikeLoading(false);
    }
  };

  const loadAllFO = async () => {
    if (!foUnderlying) return;
    setFoLoading(true);
    setFoError("");
    await loadFoExpiries(foUnderlying);
    setFoLoading(false);
    await Promise.all([loadFoChain(), loadFoAnalysis(), loadFoFutures(), loadChainChart()]);
  };

  // Live chart
  const loadChart = async (sym, interval) => {
    const s = sym || chartSymbol;
    const i = interval || chartInterval;
    setChartLoading(true);
    setChartError("");
    try {
      const res = await fetch(`${API_BASE}/api/chart/${s}?interval=${i}&limit=200`);
      const data = await res.json();
      setChartData(data);
    } catch {
      setChartError("Cannot load chart data");
      setChartData(null);
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    loadFoUniverse();
    loadAllFO();
    loadChart("RELIANCE", "1d");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {/* NAVBAR */}
      <header className="navbar">
        <div className="logo">
          AI<span>Stock</span>
        </div>

        <nav>
          <a href="#markets">Markets</a>
          <a href="#chart">Live Chart</a>
          <a href="#analysis">Analysis</a>
          <a href="#scanner">Scanner</a>
          <a href="#fo">F&O</a>
          <a href="#ai">AI Assistant</a>
          <a href="#watchlist">Watchlist</a>
          <a href="#pricing">Pricing</a>
        </nav>

        <div className="nav-buttons">
          {user ? (
            <span className="user-pill">
              <span className="user-dot" />
              {user.name}
              <button
                className="logout-btn"
                onClick={() => setUser(null)}
                title="Logout"
              >
                ×
              </button>
            </span>
          ) : (
            <button className="login-btn" onClick={() => setShowLogin(true)}>
              Login
            </button>
          )}

          <button
            className="start-btn"
            onClick={() => {
              document.getElementById("analysis")?.scrollIntoView({
                behavior: "smooth",
              });
            }}
          >
            Get Started
          </button>
        </div>
      </header>

      {/* LOGIN MODAL */}
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onLogin={(u) => {
            setUser(u);
            setShowLogin(false);
          }}
        />
      )}

      {/* HERO */}
      <section className="hero">
        <div className="hero-content">
          <div className="badge">AI-POWERED STOCK ANALYSIS</div>
          <h1>
            Smarter
            <span> Stock Analysis</span>
          </h1>
          <p>
            Analyze stocks using technical indicators, market trends and
            AI-powered insights.
          </p>
          <div className="hero-buttons">
            <a href="#analysis" className="primary-btn">
              Analyze a Stock
            </a>
            <a href="#markets" className="secondary-btn">
              Explore Markets
            </a>
          </div>
          <div className="hero-stats">
            <div>
              <strong>15+</strong>
              <span>Indicators</span>
            </div>
            <div>
              <strong>Live</strong>
              <span>Market Data</span>
            </div>
            <div>
              <strong>AI</strong>
              <span>Powered Insights</span>
            </div>
          </div>
        </div>
        <div className="hero-glow" />
      </section>

      {/* MARKETS */}
      <section id="markets">
        <div className="section-title">
          <p>MARKET OVERVIEW</p>
          <h2>Indian Markets</h2>
        </div>

        <div className="market-grid">
          {(markets.length ? markets : [
            { name: "NIFTY 50", symbol: "NIFTY", price: 24500, change: 0.45 },
            { name: "BANK NIFTY", symbol: "BANKNIFTY", price: 55000, change: 0.72 },
            { name: "SENSEX", symbol: "SENSEX", price: 80000, change: 0.51 },
          ]).map((m) => (
            <div className="market-card" key={m.symbol}>
              <h3>{m.name}</h3>
              <div className="market-price">
                ₹{Number(m.price).toLocaleString("en-IN")}
              </div>
              <div className={`market-status ${m.change >= 0 ? "up" : "down"}`}>
                {m.change >= 0 ? "▲" : "▼"} {Math.abs(m.change)}%
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* STOCK ANALYSIS */}
      <section id="analysis" className="stock-analysis">
        <div className="section-title">
          <p>AI STOCK ANALYSIS</p>
          <h2>Analyze Any Stock</h2>
        </div>

        <div className="stock-search">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Enter stock symbol e.g. RELIANCE"
            onKeyDown={(e) => {
              if (e.key === "Enter") searchStock();
            }}
          />
          <button onClick={searchStock}>
            {loading ? "Loading..." : "Analyze"}
          </button>
        </div>

        {recentSearches.length > 0 && (
          <div className="recent-searches">
            <h3>Recent Searches</h3>
            <div className="recent-search-list">
              {recentSearches.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setSymbol(item);
                    setTimeout(searchStock, 50);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="analysis-result">
            <div className="analysis-summary">
              <h3>Connection Error</h3>
              <p>{error}</p>
            </div>
          </div>
        )}

        {stock && !loading && (
          <div className="analysis-result">
            <div className="stock-header">
              <div>
                <span>STOCK</span>
                <h2>{stock.symbol}</h2>
                {stock.source && (
                  <small className="source-tag">via {stock.source}</small>
                )}
              </div>

              <div className="stock-price">
                <span>PRICE</span>
                <strong>₹{stock.price}</strong>
                <small className={stock.change >= 0 ? "up" : "down"}>
                  {stock.change >= 0 ? "▲" : "▼"} {Math.abs(stock.change)}%
                </small>
              </div>
            </div>

            <div className="indicator-grid">
              <Indicator label="RSI" value={stock.rsi} />
              <Indicator label="MACD" value={stock.macd} />
              <Indicator label="EMA" value={stock.ema} />
              <Indicator label="TREND" value={stock.trend} />
              <Indicator label="SUPPORT" value={`₹${stock.support}`} />
              <Indicator label="RESISTANCE" value={`₹${stock.resistance}`} />
              <Indicator label="VOLUME" value={stock.volume} />
              <Indicator label="CHANGE" value={`${stock.change >= 0 ? "+" : ""}${stock.change}%`} />
            </div>

            <div className="analysis-summary">
              <h3>AI Analysis</h3>
              <p>
                {stock.symbol} is currently showing a{" "}
                <strong>{stock.trend}</strong> trend. RSI is{" "}
                <strong>{stock.rsi}</strong>, MACD is{" "}
                <strong>{stock.macd}</strong>, and price is{" "}
                <strong>{stock.ema}</strong>. Support ₹{stock.support} /
                Resistance ₹{stock.resistance}.
              </p>
            </div>

            {stock.signal && <SignalCard signal={stock.signal} />}

            <div className="analysis-actions">
              <button className="secondary-btn" onClick={addToWatchlist}>
                + Add to Watchlist
              </button>
              <button
                className="primary-btn"
                onClick={() => {
                  document.getElementById("watchlist")?.scrollIntoView({
                    behavior: "smooth",
                  });
                }}
              >
                View Watchlist
              </button>
            </div>
          </div>
        )}
      </section>

      {/* FEATURES */}
      <section className="features">
        <div className="section-title">
          <p>POWERFUL TOOLS</p>
          <h2>Everything You Need</h2>
        </div>
        <div className="feature-grid">
          <FeatureCard icon="📊" title="Technical Analysis" desc="RSI, MACD, EMA, support, resistance and volume analysis." />
          <FeatureCard icon="🤖" title="AI Assistant" desc="Ask questions about stocks, markets and technical indicators." />
          <FeatureCard icon="🔍" title="Stock Scanner" desc="Find stocks based on technical conditions and market trends." />
        </div>
      </section>

      {/* SCANNER */}
      <section id="scanner">
        <div className="scanner-content">
          <div>
            <div className="section-label">STOCK SCANNER</div>
            <h2>Find Trading Opportunities</h2>
            <p>
              Scan stocks using multiple technical conditions. Adjust filters
              and run a live scan against our universe.
            </p>
          </div>

          <div className="scanner-box">
            <div className="condition">
              <span>RSI Range</span>
              <span>
                <input
                  type="number"
                  className="scanner-input"
                  value={scannerFilters.rsi_min}
                  onChange={(e) =>
                    setScannerFilters({
                      ...scannerFilters,
                      rsi_min: Number(e.target.value),
                    })
                  }
                  style={{ width: 60 }}
                />
                {" - "}
                <input
                  type="number"
                  className="scanner-input"
                  value={scannerFilters.rsi_max}
                  onChange={(e) =>
                    setScannerFilters({
                      ...scannerFilters,
                      rsi_max: Number(e.target.value),
                    })
                  }
                  style={{ width: 60 }}
                />
              </span>
            </div>

            <div className="condition">
              <span>MACD</span>
              <select
                className="scanner-input"
                value={scannerFilters.macd}
                onChange={(e) =>
                  setScannerFilters({ ...scannerFilters, macd: e.target.value })
                }
              >
                <option>Bullish</option>
                <option>Bearish</option>
                <option>Neutral</option>
                <option value="Any">Any</option>
              </select>
            </div>

            <div className="condition">
              <span>EMA</span>
              <select
                className="scanner-input"
                value={scannerFilters.ema}
                onChange={(e) =>
                  setScannerFilters({ ...scannerFilters, ema: e.target.value })
                }
              >
                <option>Above 20 EMA</option>
                <option>Below 20 EMA</option>
                <option value="Any">Any</option>
              </select>
            </div>

            <button className="run-btn" onClick={runScanner} disabled={scannerLoading}>
              {scannerLoading ? "Scanning..." : "Run Scanner"}
            </button>

            {scannerResults && (
              <div className="scanner-results">
                <p className="scanner-summary">
                  Found <strong>{scannerResults.count}</strong> matching stocks
                </p>
                <div className="scanner-list">
                  {scannerResults.results.map((r) => (
                    <div className="scanner-item" key={r.symbol}>
                      <strong>{r.symbol}</strong>
                      <span>₹{r.price}</span>
                      <small className={r.change >= 0 ? "up" : "down"}>
                        {r.change >= 0 ? "+" : ""}{r.change}%
                      </small>
                    </div>
                  ))}
                  {scannerResults.results.length === 0 && (
                    <p className="empty">No stocks match these filters.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* WATCHLIST */}
      <section id="watchlist" className="watchlist">
        <div className="section-title">
          <p>YOUR PORTFOLIO</p>
          <h2>Watchlist</h2>
        </div>

        {watchlist.length === 0 ? (
          <p className="empty">
            Your watchlist is empty. Analyze a stock and add it to track here.
          </p>
        ) : (
          <div className="watchlist-grid">
            {watchlist.map((w) => (
              <div className="watchlist-card" key={w.symbol}>
                <div className="watchlist-head">
                  <strong>{w.symbol}</strong>
                  <button
                    className="remove-btn"
                    onClick={() => removeFromWatchlist(w.symbol)}
                  >
                    ×
                  </button>
                </div>
                <div className="watchlist-price">₹{w.price}</div>
                <small className={w.change >= 0 ? "up" : "down"}>
                  {w.change >= 0 ? "▲" : "▼"} {Math.abs(w.change)}%
                </small>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* F&O CHAIN */}
      <section id="fo" className="fo-section">
        <div className="section-title">
          <p>FUTURES & OPTIONS</p>
          <h2>F&O Chain & Analysis</h2>
        </div>

        <div className="fo-controls">
          <div className="fo-control">
            <label>Underlying</label>
            <div className="fo-underlying-grid">
              {(foUniverse.length ? foUniverse : [
                { symbol: "NIFTY" }, { symbol: "BANKNIFTY" }, { symbol: "RELIANCE" }, { symbol: "TCS" },
              ]).map((u) => (
                <button
                  key={u.symbol}
                  className={`fo-underlying-btn ${foUnderlying === u.symbol ? "active" : ""}`}
                  onClick={() => {
                    setFoUnderlying(u.symbol);
                    setFoChain(null);
                    setFoAnalysis(null);
                    setFoFutures(null);
                  }}
                >
                  {u.symbol}
                </button>
              ))}
            </div>
          </div>

          <div className="fo-control">
            <label>Expiry</label>
            <select
              className="fo-select"
              value={foExpiry}
              onChange={(e) => setFoExpiry(e.target.value)}
            >
              {foExpiries.length === 0 && <option value="">No expiries</option>}
              {foExpiries.map((e) => (
                <option key={e.date} value={e.date}>
                  {e.date} ({e.type})
                </option>
              ))}
            </select>
          </div>

          <div className="fo-control">
            <label>&nbsp;</label>
            <div className="fo-action-row">
              <button className="primary-btn" onClick={loadAllFO} disabled={foLoading}>
                {foLoading ? "Loading..." : "Load Chain"}
              </button>
              <button className="secondary-btn" onClick={loadFoChain} disabled={foLoading || !foExpiry}>
                Refresh
              </button>
              <button className="secondary-btn" onClick={loadFoAnalysis} disabled={foLoading}>
                Analyze OI
              </button>
              <button className="secondary-btn" onClick={loadFoFutures}>
                Futures
              </button>
            </div>
          </div>
        </div>

        <div className="fo-tabs">
          <button
            className={`fo-tab ${foView === "chain" ? "active" : ""}`}
            onClick={() => setFoView("chain")}
          >
            Option Chain
          </button>
          <button
            className={`fo-tab ${foView === "analysis" ? "active" : ""}`}
            onClick={() => setFoView("analysis")}
          >
            OI Analysis
          </button>
          <button
            className={`fo-tab ${foView === "futures" ? "active" : ""}`}
            onClick={() => setFoView("futures")}
          >
            Futures
          </button>
          <button
            className={`fo-tab ${foView === "greeks" ? "active" : ""}`}
            onClick={() => setFoView("greeks")}
          >
            Greeks
          </button>
          <button
            className={`fo-tab ${foView === "chainchart" ? "active" : ""}`}
            onClick={() => {
              setFoView("chainchart");
              if (!chainChartData) loadChainChart();
            }}
          >
            Chain Chart
          </button>
        </div>

        {foError && <p className="empty">{foError}</p>}

        {/* CHAIN VIEW */}
        {foView === "chain" && foChain && (
          <div className="fo-chain-card">
            <div className="fo-chain-head">
              <div>
                <h3>{foChain.name || foChain.symbol} Option Chain</h3>
                <small>
                  Expiry: {foChain.expiry} | Lot: {foChain.lot_size} | Source: {foChain.source}
                </small>
              </div>
              <div className="fo-spot">
                <span>SPOT</span>
                <strong>₹{foChain.spot}</strong>
                <small>ATM: {foChain.atm_strike}</small>
              </div>
            </div>

            <div className="fo-table-wrap">
              <table className="fo-table">
                <thead>
                  <tr>
                    <th colSpan="4" className="fo-ce-head">CALLS (CE)</th>
                    <th className="fo-strike-head">STRIKE</th>
                    <th colSpan="4" className="fo-pe-head">PUTS (PE)</th>
                  </tr>
                  <tr>
                    <th>OI</th>
                    <th>Chg OI</th>
                    <th>Volume</th>
                    <th>IV</th>
                    <th>Price</th>
                    <th>OI</th>
                    <th>Chg OI</th>
                    <th>Volume</th>
                    <th>IV</th>
                  </tr>
                </thead>
                <tbody>
                  {foChain.strikes.map((s) => {
                    const isAtm = Math.abs(s.strike - foChain.atm_strike) < 1;
                    return (
                      <tr key={s.strike} className={isAtm ? "fo-atm-row" : ""}>
                        <td className={`fo-oi ${s.ce.oi > 100000 ? "fo-oi-high" : ""}`}>
                          {s.ce.oi.toLocaleString("en-IN")}
                        </td>
                        <td className={s.ce.change_oi >= 0 ? "up" : "down"}>
                          {s.ce.change_oi > 0 ? "+" : ""}
                          {s.ce.change_oi.toLocaleString("en-IN")}
                        </td>
                        <td>{s.ce.volume.toLocaleString("en-IN")}</td>
                        <td>{s.ce.iv}%</td>
                        <td className="fo-strike">
                          <strong>{s.strike}</strong>
                          <small>{isAtm ? "ATM" : s.ce_moneyness}</small>
                        </td>
                        <td className={`fo-oi ${s.pe.oi > 100000 ? "fo-oi-high" : ""}`}>
                          {s.pe.oi.toLocaleString("en-IN")}
                        </td>
                        <td className={s.pe.change_oi >= 0 ? "up" : "down"}>
                          {s.pe.change_oi > 0 ? "+" : ""}
                          {s.pe.change_oi.toLocaleString("en-IN")}
                        </td>
                        <td>{s.pe.volume.toLocaleString("en-IN")}</td>
                        <td>{s.pe.iv}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="fo-legend">
              <span><i className="dot dot-green" /> Long Build-up (OI↑ Price↑)</span>
              <span><i className="dot dot-red" /> Short Build-up (OI↑ Price↓)</span>
              <span><i className="dot dot-blue" /> Short Covering (OI↓ Price↑)</span>
              <span><i className="dot dot-yellow" /> Long Unwinding (OI↓ Price↓)</span>
            </div>
          </div>
        )}

        {/* ANALYSIS VIEW */}
        {foView === "analysis" && (
          <div className="fo-analysis-card">
            {!foAnalysis ? (
              <p className="empty">Click "Analyze OI" to compute Max Pain, PCR and OI concentration.</p>
            ) : (
              <>
                <div className={`fo-recommendation ${foAnalysis.recommendation.toLowerCase()}`}>
                  <div>
                    <span>OI RECOMMENDATION</span>
                    <h3>{foAnalysis.recommendation}</h3>
                  </div>
                  <div>
                    <span>SENTIMENT</span>
                    <strong>{foAnalysis.sentiment}</strong>
                  </div>
                </div>

                <div className="fo-stats-grid">
                  <FoStat label="PCR (OI)" value={foAnalysis.pcr} sub="Put/Call ratio" />
                  <FoStat label="MAX PAIN" value={`₹${foAnalysis.max_pain}`} sub="Expiry magnet" />
                  <FoStat label="RESISTANCE" value={foAnalysis.resistance ? `₹${foAnalysis.resistance}` : "-"} sub="Highest CE OI" />
                  <FoStat label="SUPPORT" value={foAnalysis.support ? `₹${foAnalysis.support}` : "-"} sub="Highest PE OI" />
                  <FoStat label="TOTAL CE OI" value={foAnalysis.total_ce_oi.toLocaleString("en-IN")} sub="Call open interest" />
                  <FoStat label="TOTAL PE OI" value={foAnalysis.total_pe_oi.toLocaleString("en-IN")} sub="Put open interest" />
                  <FoStat label="EXPECTED RANGE" value={
                    foAnalysis.expected_range.low && foAnalysis.expected_range.high
                      ? `₹${foAnalysis.expected_range.low} – ₹${foAnalysis.expected_range.high}`
                      : "-"
                  } sub="Based on OI walls" />
                  <FoStat label="ATM STRIKE" value={foAnalysis.atm_strike} sub="At the money" />
                </div>

                <div className="fo-oi-walls">
                  <div>
                    <span>Top Call OI (Resistance)</span>
                    <div className="fo-oi-row">
                      {foAnalysis.top_ce_oi_strikes.map((s) => (
                        <div key={s} className="fo-oi-bar ce-bar" style={{ width: `${30 + Math.random() * 60}%` }}>
                          ₹{s}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span>Top Put OI (Support)</span>
                    <div className="fo-oi-row">
                      {foAnalysis.top_pe_oi_strikes.map((s) => (
                        <div key={s} className="fo-oi-bar pe-bar" style={{ width: `${30 + Math.random() * 60}%` }}>
                          ₹{s}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* FUTURES VIEW */}
        {foView === "futures" && (
          <div className="fo-futures-card">
            {!foFutures ? (
              <p className="empty">Click "Futures" to load near-month futures data.</p>
            ) : (
              <>
                <h3>{foFutures.symbol} Futures (Near Month)</h3>
                <div className="fo-stats-grid">
                  <FoStat label="FUTURES LTP" value={`₹${foFutures.ltp}`} sub="Last traded price" />
                  <FoStat label="CHANGE" value={`${foFutures.change >= 0 ? "+" : ""}${foFutures.change}%`} sub="vs underlying" />
                  <FoStat label="OPEN INTEREST" value={foFutures.oi.toLocaleString("en-IN")} sub="Contracts open" />
                  <FoStat label="VOLUME" value={foFutures.volume.toLocaleString("en-IN")} sub="Today" />
                  <FoStat label="IMPLIED VOLATILITY" value={`${foFutures.iv}%`} sub="Annualized" />
                  <FoStat label="LOT SIZE" value={foFutures.lot_size} sub="Units per lot" />
                  <FoStat label="EXPIRY" value={foFutures.expiry} sub="Contract expiry" />
                  <FoStat label="SPOT" value={`₹${foFutures.spot}`} sub="Underlying spot" />
                </div>

                <div className="fo-premium-box">
                  <div>
                    <span>BASIS</span>
                    <strong>₹{(foFutures.ltp - foFutures.spot).toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>PREMIUM</span>
                    <strong>
                      {(((foFutures.ltp - foFutures.spot) / foFutures.spot) * 100).toFixed(3)}%
                    </strong>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* GREEKS VIEW */}
        {foView === "greeks" && (
          <div className="fo-greeks-card">
            <h3>Option Greeks Calculator</h3>
            <p>Enter the Groww trading symbol for a specific option contract.</p>

            <div className="fo-greek-form">
              <input
                placeholder="e.g. NIFTY26SEP14450CE"
                value={foGreekSymbol}
                onChange={(e) => setFoGreekSymbol(e.target.value.toUpperCase())}
              />
              <button className="primary-btn" onClick={loadFoGreeks}>
                Fetch Greeks
              </button>
            </div>

            {foGreeks && (
              <div className="fo-stats-grid">
                <FoStat label="DELTA (Δ)" value={foGreeks.delta ?? "-"} sub="Price sensitivity" />
                <FoStat label="GAMMA (Γ)" value={foGreeks.gamma ?? "-"} sub="Delta sensitivity" />
                <FoStat label="THETA (Θ)" value={foGreeks.theta ?? "-"} sub="Time decay" />
                <FoStat label="VEGA (ν)" value={foGreeks.vega ?? "-"} sub="IV sensitivity" />
                <FoStat label="RHO (ρ)" value={foGreeks.rho ?? "-"} sub="Rate sensitivity" />
                <FoStat label="IV" value={foGreeks.iv != null ? `${foGreeks.iv}%` : "-"} sub="Implied volatility" />
                <FoStat label="TRADING SYMBOL" value={foGreeks.trading_symbol} sub="Contract" />
                <FoStat label="SOURCE" value={foGreeks.source || "live"} sub="Data source" />
              </div>
            )}
          </div>
        )}

        {/* CHAIN CHART VIEW */}
        {foView === "chainchart" && (
          <ChainChartView
            chainChartData={chainChartData}
            chainChartLoading={chainChartLoading}
            onRefresh={loadChainChart}
            foUnderlying={foUnderlying}
            selectedStrike={selectedStrike}
            setSelectedStrike={setSelectedStrike}
            selectedSide={selectedSide}
            setSelectedSide={setSelectedSide}
            strikeHistory={strikeHistory}
            strikeLoading={strikeLoading}
            onStrikeSelect={(strike, side) => {
              setSelectedStrike(strike);
              setSelectedSide(side);
              loadStrikeHistory(strike, side);
            }}
          />
        )}
      </section>

      {/* LIVE CHART */}
      <section id="chart" className="chart-section">
        <div className="section-title">
          <p>LIVE TRADING CHART</p>
          <h2>Candlestick Chart & Indicators</h2>
        </div>

        <ChartView
          chartData={chartData}
          chartSymbol={chartSymbol}
          setChartSymbol={setChartSymbol}
          chartInterval={chartInterval}
          setChartInterval={setChartInterval}
          chartOverlays={chartOverlays}
          setChartOverlays={setChartOverlays}
          chartLoading={chartLoading}
          chartError={chartError}
          onLoad={loadChart}
          onAddWatchlist={(s) => {
            if (!watchlist.find((w) => w.symbol === s.symbol)) {
              setWatchlist([...watchlist, { symbol: s.symbol, price: s.price, change: 0 }]);
            }
          }}
        />
      </section>

      {/* AI */}
      <section id="ai">
        <div className="ai-box">
          <div className="ai-text">
            <div className="section-label">AI ASSISTANT</div>
            <h2>Your AI Market Assistant</h2>
            <p>
              Ask questions about stocks, indicators and market trends. Try
              "Analyze RELIANCE" or "What is RSI?".
            </p>
          </div>

          <div className="chat-box">
            <div className="chat-messages">
              {chatMessages.map((m, i) => (
                <div key={i} className={`chat-message ${m.role}`}>
                  {m.text}
                  {m.signal && <InlineSignal signal={m.signal} />}
                </div>
              ))}
              {chatLoading && <div className="chat-message ai">Thinking...</div>}
            </div>

            <div className="chat-input">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendChat();
                }}
                placeholder="Ask about a stock..."
              />
              <button onClick={sendChat} disabled={chatLoading}>
                Send
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="pricing">
        <div className="section-title">
          <p>PRICING</p>
          <h2>Choose Your Plan</h2>
        </div>
        <div className="pricing-grid">
          <PriceCard name="Free" price="₹0" desc="Basic stock analysis" cta="Start Free" />
          <PriceCard name="Pro" price="₹499" desc="Advanced AI analysis" cta="Get Pro" popular />
          <PriceCard name="Premium" price="₹999" desc="Advanced market tools" cta="Get Premium" />
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-logo">
          AI<span>Stock</span>
        </div>
        <p>AI-powered stock market analysis platform.</p>
        <div className="footer-links">
          <a href="#markets">Markets</a>
          <a href="#analysis">Analysis</a>
          <a href="#scanner">Scanner</a>
          <a href="#ai">AI Assistant</a>
          <a href="#watchlist">Watchlist</a>
        </div>
        <p className="copyright">
          © 2026 AIStock. For educational purposes only.
        </p>
      </footer>
    </div>
  );
}

function Indicator({ label, value }) {
  return (
    <div className="indicator-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

function PriceCard({ name, price, desc, cta, popular }) {
  return (
    <div className={`price-card ${popular ? "popular" : ""}`}>
      {popular && <div className="popular-label">MOST POPULAR</div>}
      <h3>{name}</h3>
      <div className="price">{price}</div>
      <p>{desc}</p>
      <button>{cta}</button>
    </div>
  );
}

function LoginModal({ onClose, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState("login");

  const submit = (e) => {
    e.preventDefault();
    if (!email || !password) return;
    const u = {
      email,
      name: name || email.split("@")[0],
    };
    onLogin(u);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <h2>{mode === "login" ? "Welcome Back" : "Create Account"}</h2>
        <p className="modal-sub">
          {mode === "login"
            ? "Login to save your watchlist across sessions."
            : "Sign up to track stocks and get AI insights."}
        </p>

        <form onSubmit={submit} className="modal-form">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="primary-btn">
            {mode === "login" ? "Login" : "Sign Up"}
          </button>
        </form>

        <p className="modal-switch">
          {mode === "login" ? (
            <>
              New here?{" "}
              <a onClick={() => setMode("signup")}>Create an account</a>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <a onClick={() => setMode("login")}>Login</a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function InlineSignal({ signal }) {
  const action = signal.action || "HOLD";
  const isBuy = action.includes("BUY");
  const isSell = action.includes("SELL");
  const tone = isBuy ? "buy" : isSell ? "sell" : "hold";
  const t1 = signal.targets?.target1;
  const sl = signal.stop_loss;
  const entry = signal.entry_zone || [];

  return (
    <div className={`inline-signal ${tone}`}>
      <div className="inline-signal-head">
        <strong>{action}</strong>
        <span className="inline-confidence">{signal.confidence}% confidence</span>
      </div>
      <div className="inline-signal-rows">
        <div>
          <span>Entry</span>
          <strong>₹{entry[0]} – ₹{entry[1]}</strong>
        </div>
        <div>
          <span>Stop</span>
          <strong className="down">₹{sl}</strong>
        </div>
        <div>
          <span>Target 1</span>
          <strong className="up">₹{t1}</strong>
        </div>
        <div>
          <span>R:R</span>
          <strong>1 : {signal.risk_reward_ratio}</strong>
        </div>
      </div>
    </div>
  );
}

function FoStat({ label, value, sub }) {
  return (
    <div className="fo-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

const INTERVAL_LABELS = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "1d": "1D",
};

function ChainChartView({
  chainChartData,
  chainChartLoading,
  onRefresh,
  foUnderlying,
  selectedStrike,
  setSelectedStrike,
  selectedSide,
  setSelectedSide,
  strikeHistory,
  strikeLoading,
  onStrikeSelect,
}) {
  const oiBarRef = useRef(null);
  const strikeChartRef = useRef(null);

  useEffect(() => {
    if (!chainChartData || !oiBarRef.current) return;
    drawOIBars(oiBarRef.current, chainChartData);
  }, [chainChartData]);

  useEffect(() => {
    if (!strikeHistory || !strikeChartRef.current) return;
    drawStrikeChart(strikeChartRef.current, strikeHistory);
  }, [strikeHistory]);

  const symbol = chainChartData?.symbol || foUnderlying;
  const spot = chainChartData?.spot || 0;
  const strikes = chainChartData?.strikes || [];

  return (
    <div className="chain-chart-wrap">
      <div className="chain-chart-header">
        <div>
          <h3>{symbol} — Chain Visualization</h3>
          <small>
            Spot ₹{spot} • Click any CE/PE cell to view that strike's price history
          </small>
        </div>
        <button className="secondary-btn" onClick={onRefresh} disabled={chainChartLoading}>
          {chainChartLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {!chainChartData && <p className="empty">Loading OI distribution...</p>}

      {chainChartData && (
        <>
          <div className="chain-chart-section">
            <div className="chain-chart-section-head">
              <h4>Open Interest Distribution</h4>
              <div className="chain-chart-legend">
                <span><i className="dot dot-red" /> Calls (CE) — resistance</span>
                <span><i className="dot dot-green" /> Puts (PE) — support</span>
                <span><i className="dot dot-blue" /> Spot price</span>
              </div>
            </div>
            <canvas ref={oiBarRef} className="oi-bar-canvas" />
          </div>

          <div className="chain-chart-section">
            <div className="chain-chart-section-head">
              <h4>Strike Chain — CE & PE with Price Chart (click to drill)</h4>
            </div>

            <div className="chain-viz-table">
              <div className="chain-viz-row chain-viz-head">
                <div className="cv-col cv-strike">Strike</div>
                <div className="cv-col cv-ce">Call (CE)</div>
                <div className="cv-col cv-pe">Put (PE)</div>
              </div>

              {strikes.map((s) => (
                <div key={s.strike} className={`chain-viz-row ${selectedStrike === s.strike ? "active-row" : ""}`}>
                  <div className="cv-col cv-strike">
                    <strong>{s.strike}</strong>
                    <small>₹{(Math.abs(s.strike - spot)).toFixed(0)} {s.strike > spot ? "OTM" : s.strike < spot ? "ITM" : "ATM"}</small>
                  </div>

                  <button
                    className={`cv-col cv-ce ${selectedStrike === s.strike && selectedSide === "CE" ? "active" : ""}`}
                    onClick={() => onStrikeSelect(s.strike, "CE")}
                  >
                    <div className="cv-price">₹{s.ce_ltp}</div>
                    <div className="cv-oi-row">
                      <span className="cv-oi">OI {formatOI(s.ce_oi)}</span>
                      <span className={`cv-change ${s.ce_change >= 0 ? "up" : "down"}`}>
                        {s.ce_change >= 0 ? "+" : ""}{formatOI(s.ce_change)}
                      </span>
                    </div>
                    <MiniSparkline data={generateSpark(s.strike, s.ce_ltp, "CE", s.ce_change)} color="#ef4444" />
                    <div className="cv-meta">IV {s.ce_iv}% · Vol {formatOI(Math.round(s.ce_oi * 0.3))}</div>
                  </button>

                  <button
                    className={`cv-col cv-pe ${selectedStrike === s.strike && selectedSide === "PE" ? "active" : ""}`}
                    onClick={() => onStrikeSelect(s.strike, "PE")}
                  >
                    <div className="cv-price">₹{s.pe_ltp}</div>
                    <div className="cv-oi-row">
                      <span className="cv-oi">OI {formatOI(s.pe_oi)}</span>
                      <span className={`cv-change ${s.pe_change >= 0 ? "up" : "down"}`}>
                        {s.pe_change >= 0 ? "+" : ""}{formatOI(s.pe_change)}
                      </span>
                    </div>
                    <MiniSparkline data={generateSpark(s.strike, s.pe_ltp, "PE", s.pe_change)} color="#4ade80" />
                    <div className="cv-meta">IV {s.pe_iv}% · Vol {formatOI(Math.round(s.pe_oi * 0.3))}</div>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {selectedStrike !== null && (
            <div className="chain-chart-section">
              <div className="chain-chart-section-head">
                <h4>
                  {symbol} {selectedStrike} {selectedSide} — Price History
                </h4>
                <div className="strike-side-toggle">
                  <button
                    className={selectedSide === "CE" ? "active" : ""}
                    onClick={() => onStrikeSelect(selectedStrike, "CE")}
                  >
                    CE (Call)
                  </button>
                  <button
                    className={selectedSide === "PE" ? "active" : ""}
                    onClick={() => onStrikeSelect(selectedStrike, "PE")}
                  >
                    PE (Put)
                  </button>
                </div>
              </div>

              {!strikeHistory && strikeLoading && <p className="empty">Loading strike history...</p>}

              {strikeHistory && (
                <>
                  <div className="strike-chart-meta">
                    <div>
                      <span>LTP</span>
                      <strong>₹{strikeHistory.ltp}</strong>
                    </div>
                    <div>
                      <span>OI</span>
                      <strong>{strikeHistory.oi.toLocaleString("en-IN")}</strong>
                    </div>
                    <div>
                      <span>Change OI</span>
                      <strong className={strikeHistory.change_oi >= 0 ? "up" : "down"}>
                        {strikeHistory.change_oi >= 0 ? "+" : ""}{strikeHistory.change_oi.toLocaleString("en-IN")}
                      </strong>
                    </div>
                    <div>
                      <span>IV</span>
                      <strong>{strikeHistory.iv}%</strong>
                    </div>
                    <div>
                      <span>Volume</span>
                      <strong>{strikeHistory.volume.toLocaleString("en-IN")}</strong>
                    </div>
                  </div>

                  <canvas ref={strikeChartRef} className="strike-chart-canvas" />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniSparkline({ data, color }) {
  if (!data || data.length === 0) return null;
  const w = 90;
  const h = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg className="mini-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function generateSpark(strike, ltp, side, change) {
  const out = [];
  let p = ltp * (1 - Math.sign(change || 0) * 0.15 - 0.05);
  const dir = change >= 0 ? 1 : -1;
  for (let i = 0; i < 14; i++) {
    const noise = ((i * 11 + strike) % 17 - 8) * 0.015;
    p = p * (1 + dir * 0.012 + noise);
    out.push(Math.max(0.05, p));
  }
  return out;
}

function drawOIBars(canvas, data) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const strikes = data.strikes;
  if (!strikes.length) return;

  const padding = { top: 30, right: 70, bottom: 30, left: 10 };
  const cw = w - padding.left - padding.right;
  const ch = h - padding.top - padding.bottom;
  const maxOI = Math.max(...strikes.flatMap((s) => [s.ce_oi, s.pe_oi]));
  const xStep = cw / strikes.length;
  const barGroupW = xStep * 0.7;
  const barW = barGroupW / 2;

  ctx.fillStyle = "#94a6bb";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Open Interest by Strike", padding.left, 16);

  strikes.forEach((s, i) => {
    const xCenter = padding.left + i * xStep + xStep / 2;
    const ceH = (s.ce_oi / maxOI) * ch;
    const peH = (s.pe_oi / maxOI) * ch;
    ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
    ctx.fillRect(xCenter - barGroupW / 2, padding.top + ch - ceH, barW, ceH);
    ctx.fillStyle = "rgba(74, 222, 128, 0.7)";
    ctx.fillRect(xCenter, padding.top + ch - peH, barW, peH);

    ctx.fillStyle = "#d6e1ef";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(s.strike.toString(), xCenter, h - 8);
    ctx.font = "9px sans-serif";
    ctx.fillStyle = "#ef4444";
    ctx.fillText(formatOI(s.ce_oi), xCenter - barGroupW / 4, padding.top + ch - ceH - 3);
    ctx.fillStyle = "#4ade80";
    ctx.fillText(formatOI(s.pe_oi), xCenter + barGroupW / 4, padding.top + ch - peH - 3);
  });

  const spot = data.spot;
  if (spot > 0) {
    let spotX = padding.left + cw / 2;
    for (let i = 0; i < strikes.length - 1; i++) {
      const a = strikes[i].strike;
      const b = strikes[i + 1].strike;
      if (spot >= a && spot <= b) {
        const t = (spot - a) / (b - a);
        spotX = padding.left + i * xStep + xStep / 2 + t * xStep - xStep / 2;
        break;
      }
    }
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(spotX, padding.top);
    ctx.lineTo(spotX, padding.top + ch);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#22d3ee";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`SPOT ${spot}`, spotX, padding.top - 8);
  }
}

function formatOI(n) {
  if (n >= 10000000) return (n / 10000000).toFixed(1) + "Cr";
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function drawStrikeChart(canvas, data) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const candles = data.candles;
  if (!candles || !candles.length) return;

  const padding = { top: 20, right: 70, bottom: 25, left: 10 };
  const cw = w - padding.left - padding.right;
  const ch = h - padding.top - padding.bottom;

  let minP = Math.min(...candles.map((c) => c.l));
  let maxP = Math.max(...candles.map((c) => c.h));
  const padP = (maxP - minP) * 0.05;
  minP -= padP;
  maxP += padP;

  const xStep = cw / candles.length;
  const candleW = Math.max(2, xStep * 0.6);
  const xFor = (i) => padding.left + i * xStep + xStep / 2;
  const yFor = (p) => padding.top + ((maxP - p) / (maxP - minP)) * ch;

  ctx.strokeStyle = "rgba(45, 60, 80, 0.3)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#94a6bb";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  for (let i = 0; i <= 4; i++) {
    const p = minP + ((maxP - minP) * i) / 4;
    const y = yFor(p);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillText(p.toFixed(2), w - padding.right + 5, y + 3);
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const x = xFor(i);
    const isGreen = c.c >= c.o;
    const color = isGreen ? "#4ade80" : "#ef4444";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yFor(c.h));
    ctx.lineTo(x, yFor(c.l));
    ctx.stroke();
    const bodyTop = yFor(Math.max(c.o, c.c));
    const bodyBottom = yFor(Math.min(c.o, c.c));
    const bodyHeight = Math.max(1, bodyBottom - bodyTop);
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyHeight);
  }

  ctx.fillStyle = "#94a6bb";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  const labelStep = Math.ceil(candles.length / 6);
  for (let i = 0; i < candles.length; i += labelStep) {
    const x = xFor(i);
    ctx.fillText(`T${i + 1}`, x, h - 8);
  }

  const last = candles[candles.length - 1];
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, yFor(last.c));
  ctx.lineTo(w - padding.right, yFor(last.c));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`LTP ₹${last.c}`, w - padding.right - 6, yFor(last.c) - 4);
}

const QUICK_SYMBOLS = [
  "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
  "SBIN", "TATAMOTORS", "ITC", "BHARTIARTL", "WIPRO",
  "NIFTY", "BANKNIFTY",
];

function ChartView({
  chartData,
  chartSymbol,
  setChartSymbol,
  chartInterval,
  setChartInterval,
  chartOverlays,
  setChartOverlays,
  chartLoading,
  chartError,
  onLoad,
  onAddWatchlist,
}) {
  const chartRef = useRef(null);
  const rsiRef = useRef(null);
  const volRef = useRef(null);
  const [hover, setHover] = useState(null);

  // Draw chart whenever data changes
  useEffect(() => {
    if (!chartData || !chartRef.current) return;
    drawCandlestickChart(chartRef.current, chartData, chartOverlays);
    drawRSIPanel(rsiRef.current, chartData);
    drawVolumePanel(volRef.current, chartData);
  }, [chartData, chartOverlays]);

  const handleLoad = () => onLoad(chartSymbol, chartInterval);

  const handleSymbolInput = (e) => {
    if (e.key === "Enter") handleLoad();
  };

  return (
    <div className="chart-wrap">
      <div className="chart-controls">
        <div className="chart-control-group">
          <label>Symbol</label>
          <div className="chart-symbol-row">
            <input
              className="chart-symbol-input"
              value={chartSymbol}
              onChange={(e) => setChartSymbol(e.target.value.toUpperCase())}
              onKeyDown={handleSymbolInput}
              placeholder="e.g. RELIANCE"
            />
            <button className="primary-btn chart-load-btn" onClick={handleLoad} disabled={chartLoading}>
              {chartLoading ? "Loading..." : "Load"}
            </button>
          </div>
        </div>

        <div className="chart-control-group">
          <label>Timeframe</label>
          <div className="chart-intervals">
            {Object.entries(INTERVAL_LABELS).map(([k, label]) => (
              <button
                key={k}
                className={`chart-interval-btn ${chartInterval === k ? "active" : ""}`}
                onClick={() => {
                  setChartInterval(k);
                  onLoad(chartSymbol, k);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-control-group">
          <label>Overlays</label>
          <div className="chart-overlays">
            <label className="chart-overlay-toggle">
              <input
                type="checkbox"
                checked={chartOverlays.ema20}
                onChange={(e) => setChartOverlays({ ...chartOverlays, ema20: e.target.checked })}
              />
              <span style={{ color: "#22d3ee" }}>EMA 20</span>
            </label>
            <label className="chart-overlay-toggle">
              <input
                type="checkbox"
                checked={chartOverlays.ema50}
                onChange={(e) => setChartOverlays({ ...chartOverlays, ema50: e.target.checked })}
              />
              <span style={{ color: "#fbbf24" }}>EMA 50</span>
            </label>
            <label className="chart-overlay-toggle">
              <input
                type="checkbox"
                checked={chartOverlays.bb}
                onChange={(e) => setChartOverlays({ ...chartOverlays, bb: e.target.checked })}
              />
              <span style={{ color: "#a78bfa" }}>Bollinger</span>
            </label>
            <label className="chart-overlay-toggle">
              <input
                type="checkbox"
                checked={chartOverlays.vwap}
                onChange={(e) => setChartOverlays({ ...chartOverlays, vwap: e.target.checked })}
              />
              <span style={{ color: "#f472b6" }}>VWAP</span>
            </label>
            <label className="chart-overlay-toggle">
              <input
                type="checkbox"
                checked={chartOverlays.signals}
                onChange={(e) => setChartOverlays({ ...chartOverlays, signals: e.target.checked })}
              />
              <span style={{ color: "#4ade80" }}>Buy/Sell Levels</span>
            </label>
          </div>
        </div>
      </div>

      <div className="chart-quick-symbols">
        <span>Quick:</span>
        {QUICK_SYMBOLS.map((s) => (
          <button
            key={s}
            className={`chart-quick ${chartSymbol === s ? "active" : ""}`}
            onClick={() => {
              setChartSymbol(s);
              onLoad(s, chartInterval);
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {chartError && <p className="empty">{chartError}</p>}

      {chartData && (
        <>
          <div className="chart-header">
            <div className="chart-title-block">
              <h3>{chartData.symbol}</h3>
              <span className={`chart-change ${chartData.current.change_pct >= 0 ? "up" : "down"}`}>
                ₹{chartData.current.price.toFixed(2)}
                {" "}({chartData.current.change_pct >= 0 ? "+" : ""}{chartData.current.change_pct}%)
              </span>
            </div>
            <div className="chart-meta">
              <span>O <strong>{chartData.current.open}</strong></span>
              <span>H <strong>{chartData.current.high}</strong></span>
              <span>L <strong>{chartData.current.low}</strong></span>
              <span>V <strong>{Math.round(chartData.current.volume).toLocaleString("en-IN")}</strong></span>
              <span>RSI <strong>{chartData.current.rsi ?? "-"}</strong></span>
            </div>
          </div>

          <div className="chart-canvas-wrap">
            <canvas
              ref={chartRef}
              className="chart-canvas"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const candles = chartData.candles;
                const cw = rect.width;
                const cw_chart = cw - 60;
                const candleWidth = cw_chart / candles.length;
                const idx = Math.floor((x - 10) / candleWidth);
                if (idx >= 0 && idx < candles.length) {
                  setHover({ idx, candle: candles[idx] });
                }
              }}
              onMouseLeave={() => setHover(null)}
            />
            {hover && (
              <div className="chart-hover-info">
                <strong>{new Date(hover.candle.t * 1000).toLocaleString()}</strong>
                <span>O: {hover.candle.o}</span>
                <span>H: {hover.candle.h}</span>
                <span>L: {hover.candle.l}</span>
                <span>C: {hover.candle.c}</span>
                <span>V: {Math.round(hover.candle.v).toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>

          <div className="chart-sub-panel">
            <div className="chart-sub-label">RSI (14)</div>
            <canvas ref={rsiRef} className="chart-sub-canvas" />
          </div>

          <div className="chart-sub-panel">
            <div className="chart-sub-label">VOLUME</div>
            <canvas ref={volRef} className="chart-sub-canvas" />
          </div>

          {chartData.signal && (
            <ChartSignalCard signal={chartData.signal} chartData={chartData} onAddWatchlist={onAddWatchlist} />
          )}
        </>
      )}
    </div>
  );
}

function ChartSignalCard({ signal, chartData, onAddWatchlist }) {
  const action = signal.action || "HOLD";
  const isBuy = action.includes("BUY");
  const isSell = action.includes("SELL");
  const tone = isBuy ? "buy" : isSell ? "sell" : "hold";
  const t1 = signal.targets?.target1;
  const t2 = signal.targets?.target2;
  const t3 = signal.targets?.target3;
  const entry = signal.entry_zone || [];
  const reasons = signal.reasons || [];

  const profitShares = 100;
  const profitT1 = ((t1 - signal.current_price) * profitShares).toFixed(2);
  const profitT2 = ((t2 - signal.current_price) * profitShares).toFixed(2);
  const profitT3 = ((t3 - signal.current_price) * profitShares).toFixed(2);
  const lossAmt = ((signal.current_price - signal.stop_loss) * profitShares).toFixed(2);

  return (
    <div className={`signal-card ${tone}`}>
      <div className="signal-head">
        <div className="signal-action-wrap">
          <span className="signal-label">LIVE SIGNAL · {chartData.interval.toUpperCase()}</span>
          <h3 className="signal-action">{action}</h3>
        </div>
        <div className="signal-confidence">
          <div className="confidence-ring">
            <svg viewBox="0 0 36 36">
              <circle className="ring-bg" cx="18" cy="18" r="16" />
              <circle
                className="ring-fg"
                cx="18"
                cy="18"
                r="16"
                strokeDasharray={`${signal.confidence}, 100`}
              />
            </svg>
            <strong>{signal.confidence}%</strong>
          </div>
          <span>Confidence</span>
        </div>
      </div>

      <div className="signal-grid">
        <div className="signal-stat">
          <span>CURRENT PRICE</span>
          <strong>₹{signal.current_price.toFixed(2)}</strong>
        </div>
        <div className="signal-stat entry">
          <span>ENTRY ZONE</span>
          <strong>₹{entry[0]} – ₹{entry[1]}</strong>
        </div>
        <div className="signal-stat stop">
          <span>STOP LOSS</span>
          <strong>₹{signal.stop_loss.toFixed(2)}</strong>
          <small>−{signal.expected_loss_pct}%</small>
        </div>
        <div className="signal-stat target">
          <span>TARGET 1</span>
          <strong>₹{t1.toFixed(2)}</strong>
          <small className="up">+{signal.expected_profit_pct}%</small>
        </div>
        <div className="signal-stat target">
          <span>TARGET 2</span>
          <strong>₹{t2.toFixed(2)}</strong>
          <small className="up">+{(((t2 - signal.current_price) / signal.current_price) * 100).toFixed(2)}%</small>
        </div>
        <div className="signal-stat target">
          <span>TARGET 3</span>
          <strong>₹{t3.toFixed(2)}</strong>
          <small className="up">+{(((t3 - signal.current_price) / signal.current_price) * 100).toFixed(2)}%</small>
        </div>
        <div className="signal-stat">
          <span>RISK : REWARD</span>
          <strong>1 : {signal.risk_reward_ratio}</strong>
        </div>
        <div className="signal-stat">
          <span>ATR (Volatility)</span>
          <strong>₹{signal.atr?.toFixed(2) || "-"}</strong>
        </div>
      </div>

      <div className="profit-calc">
        <h4>Accurate Profit Calculator (per 100 shares)</h4>
        <div className="profit-grid">
          <div className="profit-item profit">
            <span>If hits T1</span>
            <strong className="up">₹{profitT1}</strong>
            <small>+{signal.expected_profit_pct}%</small>
          </div>
          <div className="profit-item profit">
            <span>If hits T2</span>
            <strong className="up">₹{profitT2}</strong>
            <small>+{(((t2 - signal.current_price) / signal.current_price) * 100).toFixed(2)}%</small>
          </div>
          <div className="profit-item profit">
            <span>If hits T3</span>
            <strong className="up">₹{profitT3}</strong>
            <small>+{(((t3 - signal.current_price) / signal.current_price) * 100).toFixed(2)}%</small>
          </div>
          <div className="profit-item loss">
            <span>If hits Stop</span>
            <strong className="down">−₹{lossAmt}</strong>
            <small>−{signal.expected_loss_pct}%</small>
          </div>
        </div>
      </div>

      <div className="position-sizing">
        <span>Position sizing (2% capital risk rule):</span>
        <strong>{signal.suggested_qty_for_2pct_capital_risk} shares</strong>
        <small>based on ₹{signal.risk_per_share?.toFixed(2)} risk per share</small>
      </div>

      {reasons.length > 0 && (
        <div className="signal-reasons">
          <span>WHY THIS SIGNAL</span>
          <ul>
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="analysis-actions">
        <button className="secondary-btn" onClick={() => onAddWatchlist({ symbol: chartData.symbol, price: signal.current_price, change: chartData.current.change_pct })}>
          + Add to Watchlist
        </button>
      </div>

      <p className="signal-disclaimer">{signal.disclaimer}</p>
    </div>
  );
}

// ============== CANVAS DRAWING HELPERS ==============

function setupCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, w: rect.width, h: rect.height };
}

function drawCandlestickChart(canvas, data, overlays) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const candles = data.candles;
  if (!candles.length) return;

  const padding = { top: 20, right: 70, bottom: 30, left: 10 };
  const cw = w - padding.left - padding.right;
  const ch = h - padding.top - padding.bottom;

  // Price range
  let minP = Math.min(...candles.map((c) => c.l));
  let maxP = Math.max(...candles.map((c) => c.h));

  // Extend range for overlays
  const ind = data.indicators;
  if (overlays.bb) {
    if (ind.bb_upper) {
      const upperVals = ind.bb_upper.filter((v) => v !== null);
      const lowerVals = ind.bb_lower.filter((v) => v !== null);
      if (upperVals.length) maxP = Math.max(maxP, ...upperVals);
      if (lowerVals.length) minP = Math.min(minP, ...lowerVals);
    }
  }

  const pad = (maxP - minP) * 0.05;
  minP -= pad;
  maxP += pad;

  const xStep = cw / candles.length;
  const candleW = Math.max(2, xStep * 0.7);

  const yFor = (price) => padding.top + ((maxP - price) / (maxP - minP)) * ch;
  const xFor = (i) => padding.left + i * xStep + xStep / 2;

  // Grid + price labels
  ctx.strokeStyle = "rgba(45, 60, 80, 0.3)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#94a6bb";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";

  for (let i = 0; i <= 5; i++) {
    const price = minP + ((maxP - minP) * i) / 5;
    const y = yFor(price);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillText(price.toFixed(2), w - padding.right + 5, y + 4);
  }

  // Bollinger Bands
  if (overlays.bb && ind.bb_upper) {
    const drawBand = (arr, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === null) continue;
        const x = xFor(i);
        const y = yFor(arr[i]);
        if (i === 0 || arr[i - 1] === null) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawBand(ind.bb_upper, "rgba(167, 139, 250, 0.6)");
    drawBand(ind.bb_mid, "rgba(167, 139, 250, 0.4)");
    drawBand(ind.bb_lower, "rgba(167, 139, 250, 0.6)");
    ctx.setLineDash([]);
  }

  // EMA lines
  if (overlays.ema20 && ind.ema20) {
    drawLine(ctx, ind.ema20, xFor, yFor, "#22d3ee", 1.5);
  }
  if (overlays.ema50 && ind.ema50) {
    drawLine(ctx, ind.ema50, xFor, yFor, "#fbbf24", 1.5);
  }
  if (overlays.vwap && ind.vwap) {
    drawLine(ctx, ind.vwap, xFor, yFor, "#f472b6", 1.2);
  }

  // Candles
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const x = xFor(i);
    const isGreen = c.c >= c.o;
    const color = isGreen ? "#4ade80" : "#ef4444";

    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    // Wick
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yFor(c.h));
    ctx.lineTo(x, yFor(c.l));
    ctx.stroke();

    // Body
    const bodyTop = yFor(Math.max(c.o, c.c));
    const bodyBottom = yFor(Math.min(c.o, c.c));
    const bodyHeight = Math.max(1, bodyBottom - bodyTop);
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyHeight);
  }

  // Buy/Sell levels
  if (overlays.signals && data.signal) {
    const sig = data.signal;
    const drawLevel = (price, color, label) => {
      const y = yFor(price);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.fillRect(padding.left, y - 9, 70, 18);
      ctx.fillStyle = "#07111f";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, padding.left + 35, y + 3);
    };

    if (sig.action.includes("BUY")) {
      drawLevel(sig.stop_loss, "#ef4444", `SL ${sig.stop_loss}`);
      drawLevel(sig.targets.target1, "#4ade80", `T1 ${sig.targets.target1}`);
      drawLevel(sig.targets.target2, "#4ade80", `T2 ${sig.targets.target2}`);
      drawLevel(sig.targets.target3, "#22c55e", `T3 ${sig.targets.target3}`);
    } else if (sig.action.includes("SELL")) {
      drawLevel(sig.stop_loss, "#ef4444", `SL ${sig.stop_loss}`);
      drawLevel(sig.targets.target1, "#4ade80", `T1 ${sig.targets.target1}`);
    } else {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HOLD", w / 2, 20);
    }
  }

  // X-axis time labels
  ctx.fillStyle = "#94a6bb";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  const labelStep = Math.ceil(candles.length / 8);
  for (let i = 0; i < candles.length; i += labelStep) {
    const x = xFor(i);
    const d = new Date(candles[i].t * 1000);
    let label;
    if (data.interval === "1d" || data.interval === "1h") {
      label = `${d.getMonth() + 1}/${d.getDate()}`;
    } else {
      label = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    ctx.fillText(label, x, h - 8);
  }
}

function drawLine(ctx, arr, xFor, yFor, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === null) continue;
    const x = xFor(i);
    const y = yFor(arr[i]);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function drawRSIPanel(canvas, data) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const rsi = data.indicators.rsi;
  if (!rsi || !rsi.length) return;

  const padding = { top: 5, right: 70, bottom: 5, left: 10 };
  const cw = w - padding.left - padding.right;
  const ch = h - padding.top - padding.bottom;
  const xStep = cw / rsi.length;
  const xFor = (i) => padding.left + i * xStep + xStep / 2;

  // Reference lines
  ctx.strokeStyle = "rgba(45, 60, 80, 0.4)";
  ctx.lineWidth = 1;
  [30, 50, 70].forEach((level) => {
    const y = padding.top + ((100 - level) / 100) * ch;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = level === 70 ? "#ef4444" : level === 30 ? "#4ade80" : "#94a6bb";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(level.toString(), w - padding.right + 5, y + 3);
  });

  // RSI line
  ctx.strokeStyle = "#a78bfa";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < rsi.length; i++) {
    if (rsi[i] === null) continue;
    const y = padding.top + ((100 - rsi[i]) / 100) * ch;
    if (!started) {
      ctx.moveTo(xFor(i), y);
      started = true;
    } else {
      ctx.lineTo(xFor(i), y);
    }
  }
  ctx.stroke();
}

function drawVolumePanel(canvas, data) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const candles = data.candles;
  if (!candles.length) return;

  const padding = { top: 5, right: 70, bottom: 5, left: 10 };
  const cw = w - padding.left - padding.right;
  const ch = h - padding.top - padding.bottom;
  const xStep = cw / candles.length;
  const candleW = Math.max(2, xStep * 0.7);
  const maxV = Math.max(...candles.map((c) => c.v));

  const xFor = (i) => padding.left + i * xStep + xStep / 2;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const isGreen = c.c >= c.o;
    const color = isGreen ? "rgba(74, 222, 128, 0.6)" : "rgba(239, 68, 68, 0.6)";
    const barH = (c.v / maxV) * ch;
    const x = xFor(i);
    ctx.fillStyle = color;
    ctx.fillRect(x - candleW / 2, padding.top + ch - barH, candleW, barH);
  }
}

function SignalCard({ signal }) {
  const action = signal.action || "HOLD";
  const isBuy = action.includes("BUY");
  const isSell = action.includes("SELL");
  const tone = isBuy ? "buy" : isSell ? "sell" : "hold";

  const t1 = signal.targets?.target1;
  const t2 = signal.targets?.target2;
  const t3 = signal.targets?.target3;
  const entry = signal.entry_zone || [];
  const reasons = signal.reasons || [];

  return (
    <div className={`signal-card ${tone}`}>
      <div className="signal-head">
        <div className="signal-action-wrap">
          <span className="signal-label">RECOMMENDATION</span>
          <h3 className="signal-action">{action}</h3>
        </div>
        <div className="signal-confidence">
          <div className="confidence-ring">
            <svg viewBox="0 0 36 36">
              <circle className="ring-bg" cx="18" cy="18" r="16" />
              <circle
                className="ring-fg"
                cx="18"
                cy="18"
                r="16"
                strokeDasharray={`${signal.confidence}, 100`}
              />
            </svg>
            <strong>{signal.confidence}%</strong>
          </div>
          <span>Confidence</span>
        </div>
      </div>

      <div className="signal-grid">
        <div className="signal-stat">
          <span>CURRENT PRICE</span>
          <strong>₹{signal.current_price}</strong>
        </div>
        <div className="signal-stat entry">
          <span>ENTRY ZONE</span>
          <strong>
            ₹{entry[0]} – ₹{entry[1]}
          </strong>
        </div>
        <div className="signal-stat stop">
          <span>STOP LOSS</span>
          <strong>₹{signal.stop_loss}</strong>
          <small>−{signal.expected_loss_pct}%</small>
        </div>
        <div className="signal-stat target">
          <span>TARGET 1</span>
          <strong>₹{t1}</strong>
          <small className="up">+{signal.expected_profit_pct}%</small>
        </div>
        <div className="signal-stat target">
          <span>TARGET 2</span>
          <strong>₹{t2}</strong>
        </div>
        <div className="signal-stat target">
          <span>TARGET 3</span>
          <strong>₹{t3}</strong>
        </div>
        <div className="signal-stat">
          <span>RISK : REWARD</span>
          <strong>1 : {signal.risk_reward_ratio}</strong>
        </div>
        <div className="signal-stat">
          <span>TIMEFRAME</span>
          <strong>{signal.timeframe}</strong>
        </div>
      </div>

      {reasons.length > 0 && (
        <div className="signal-reasons">
          <span>WHY</span>
          <ul>
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="signal-disclaimer">{signal.disclaimer}</p>
    </div>
  );
}

export default App;