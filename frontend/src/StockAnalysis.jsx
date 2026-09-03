import { useState } from "react";

function StockAnalysis() {
  const [symbol, setSymbol] = useState("");
  const [stock, setStock] = useState(null);

  const analyzeStock = () => {
    if (!symbol.trim()) {
      return;
    }

    setStock({
      symbol: symbol.toUpperCase(),
      price: "₹2,450.50",
      change: "+1.42%",
      rsi: "56.4",
      macd: "Bullish",
      ema: "Above 20 EMA",
      trend: "Bullish",
      support: "₹2,380",
      resistance: "₹2,520",
      volume: "High",
    });
  };

  return (
    <section className="stock-analysis">

      <div className="section-title">
        <p>STOCK ANALYSIS</p>
        <h2>Analyze Any Stock</h2>
      </div>

      <div className="stock-search">

        <input
          type="text"
          placeholder="Enter stock symbol e.g. RELIANCE"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              analyzeStock();
            }
          }}
        />

        <button onClick={analyzeStock}>
          Analyze
        </button>

      </div>

      {stock && (
        <div className="analysis-result">

          <div className="stock-header">
            <div>
              <span>Stock</span>
              <h2>{stock.symbol}</h2>
            </div>

            <div className="stock-price">
              <span>Current Price</span>
              <strong>{stock.price}</strong>
              <small>{stock.change}</small>
            </div>
          </div>

          <div className="indicator-grid">

            <div className="indicator-card">
              <span>RSI</span>
              <strong>{stock.rsi}</strong>
            </div>

            <div className="indicator-card">
              <span>MACD</span>
              <strong>{stock.macd}</strong>
            </div>

            <div className="indicator-card">
              <span>EMA</span>
              <strong>{stock.ema}</strong>
            </div>

            <div className="indicator-card">
              <span>Trend</span>
              <strong>{stock.trend}</strong>
            </div>

            <div className="indicator-card">
              <span>Support</span>
              <strong>{stock.support}</strong>
            </div>

            <div className="indicator-card">
              <span>Resistance</span>
              <strong>{stock.resistance}</strong>
            </div>

            <div className="indicator-card">
              <span>Volume</span>
              <strong>{stock.volume}</strong>
            </div>

          </div>

          <div className="analysis-summary">

            <h3>AI Analysis Preview</h3>

            <p>
              {stock.symbol} is showing a currently bullish
              technical setup based on the sample indicators.
              This is demonstration data only.
            </p>

          </div>

        </div>
      )}

    </section>
  );
}

export default StockAnalysis;