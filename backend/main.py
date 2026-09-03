import os
import traceback

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from growwapi import GrowwAPI


# Load environment variables
load_dotenv()


# Create FastAPI application
app = FastAPI(
    title="AI Stock Platform API",
    description="Backend API for AI Stock Analysis",
    version="1.0.0"
)


# ---------------------------------
# CORS
# ---------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------
# GROWW CONNECTION (optional, may be expired)
# ---------------------------------

token = os.getenv("GROWW_ACCESS_TOKEN")

groww = None
groww_token_valid = False

if token:
    try:
        groww = GrowwAPI(token)
        # Probe with a lightweight call to validate the token
        try:
            groww.get_quote(exchange="NSE", segment="CASH", trading_symbol="RELIANCE")
            groww_token_valid = True
            print("GROWW API CLIENT CREATED (token valid)")
        except Exception as probe_err:
            err_str = str(probe_err).lower()
            if "auth" in err_str or "expired" in err_str or "invalid" in err_str:
                print("GROWW TOKEN EXPIRED OR INVALID — using Yahoo Finance as primary source")
            else:
                print(f"GROWW PROBE FAILED: {probe_err} — using Yahoo Finance")
            groww = None
            groww_token_valid = False
    except Exception as e:
        print("GROWW CONNECTION FAILED:", e)

else:
    print("GROWW ACCESS TOKEN NOT FOUND — using Yahoo Finance")


# ---------------------------------
# YAHOO FINANCE — PRIMARY DATA SOURCE
# ---------------------------------

import yfinance as yf
from datetime import datetime, timedelta

# Symbol mapping: frontend symbol → Yahoo Finance ticker
YF_SYMBOL_MAP = {
    # NSE equity (add .NS for Yahoo)
    "RELIANCE": "RELIANCE.NS",
    "TCS": "TCS.NS",
    "INFY": "INFY.NS",
    "HDFCBANK": "HDFCBANK.NS",
    "ICICIBANK": "ICICIBANK.NS",
    "SBIN": "SBIN.NS",
    "WIPRO": "WIPRO.NS",
    "LT": "LT.NS",
    "AXISBANK": "AXISBANK.NS",
    "HINDUNILVR": "HINDUNILVR.NS",
    "BHARTIARTL": "BHARTIARTL.NS",
    "ITC": "ITC.NS",
    "KOTAKBANK": "KOTAKBANK.NS",
    "BAJFINANCE": "BAJFINANCE.NS",
    "MARUTI": "MARUTI.NS",
    "ASIANPAINT": "ASIANPAINT.NS",
    "HCLTECH": "HCLTECH.NS",
    "SUNPHARMA": "SUNPHARMA.NS",
    "TITAN": "TITAN.NS",
    "ULTRACEMCO": "ULTRACEMCO.NS",
    "NESTLEIND": "NESTLEIND.NS",
    "POWERGRID": "POWERGRID.NS",
    "NTPC": "NTPC.NS",
    "ONGC": "ONGC.NS",
    "M&M": "M&M.NS",
    "TECHM": "TECHM.NS",
    "DRREDDY": "DRREDDY.NS",
    "CIPLA": "CIPLA.NS",
    "TATAMOTORS": "TATAMOTORS.NS",
    "TATASTEEL": "TATASTEEL.NS",
    "JSWSTEEL": "JSWSTEEL.NS",
    "INDUSINDBK": "INDUSINDBK.NS",
    "BAJAJFINSV": "BAJAJFINSV.NS",
    "DIVISLAB": "DIVISLAB.NS",
    "GRASIM": "GRASIM.NS",
    "COALINDIA": "COALINDIA.NS",
    "APOLLOHOSP": "APOLLOHOSP.NS",
    "BRITANNIA": "BRITANNIA.NS",
    "EICHERMOT": "EICHERMOT.NS",
    "HEROMOTOCO": "HEROMOTOCO.NS",
    "HINDALCO": "HINDALCO.NS",
    "SBILIFE": "SBILIFE.NS",
    "HDFCLIFE": "HDFCLIFE.NS",
    "BPCL": "BPCL.NS",
    "IOC": "IOC.NS",
    # Indices
    "NIFTY": "^NSEI",
    "NIFTY50": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "FINNIFTY": "^CNXIT",  # closest proxy on Yahoo
    "SENSEX": "^BSESN",
}

# Yahoo Finance interval mapping
YF_INTERVAL_MAP = {
    "1m": ("1d", "1m"),
    "5m": ("5d", "5m"),
    "15m": ("5d", "15m"),
    "30m": ("1mo", "30m"),
    "1h": ("1mo", "1h"),
    "1d": ("6mo", "1d"),
}

# In-memory cache
_cache = {}
CACHE_TTL_SECONDS = {
    "quote": 30,
    "history": 60,
    "intraday": 30,
}


def _yf_symbol(symbol):
    """Convert frontend symbol to Yahoo Finance ticker."""
    s = symbol.upper().strip()
    return YF_SYMBOL_MAP.get(s, f"{s}.NS")


def yf_quote(symbol):
    """Get current quote from Yahoo Finance."""
    key = f"quote:{symbol}"
    now = datetime.utcnow().timestamp()
    if key in _cache:
        ts, val = _cache[key]
        if now - ts < CACHE_TTL_SECONDS["quote"]:
            return val

    try:
        ticker = yf.Ticker(_yf_symbol(symbol))
        hist = ticker.history(period="5d", interval="1d")
        if hist.empty:
            return None

        last_row = hist.iloc[-1]
        prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else float(last_row["Open"])

        ltp = float(last_row["Close"])
        open_p = float(last_row["Open"])
        high = float(last_row["High"])
        low = float(last_row["Low"])
        volume = int(last_row["Volume"])
        change = round(((ltp - prev_close) / prev_close) * 100, 2) if prev_close else 0

        # Try to get intraday tick for "current" price if market is open
        try:
            intraday = ticker.history(period="1d", interval="1m")
            if not intraday.empty:
                ltp = float(intraday["Close"].iloc[-1])
                high = max(high, float(intraday["High"].iloc[-1]))
                low = min(low, float(intraday["Low"].iloc[-1]))
                volume = int(intraday["Volume"].sum())
                change = round(((ltp - prev_close) / prev_close) * 100, 2)
        except Exception:
            pass

        result = {
            "symbol": symbol.upper(),
            "price": round(ltp, 2),
            "open": round(open_p, 2),
            "high": round(high, 2),
            "low": round(low, 2),
            "close": round(ltp, 2),
            "previous_close": round(prev_close, 2),
            "change": change,
            "volume": volume,
            "source": "yahoo",
        }
        _cache[key] = (now, result)
        return result
    except Exception as e:
        print(f"YF QUOTE FAILED for {symbol}: {e}")
        return None


def yf_history(symbol, interval="1d", limit=200):
    """Get historical candles from Yahoo Finance."""
    key = f"history:{symbol}:{interval}:{limit}"
    now = datetime.utcnow().timestamp()
    if key in _cache:
        ts, val = _cache[key]
        if now - ts < CACHE_TTL_SECONDS["history"]:
            return val

    if interval not in YF_INTERVAL_MAP:
        interval = "1d"

    period, yf_interval = YF_INTERVAL_MAP[interval]

    try:
        ticker = yf.Ticker(_yf_symbol(symbol))
        hist = ticker.history(period=period, interval=yf_interval)

        if hist.empty:
            return []

        candles = []
        for ts, row in hist.iterrows():
            t_unix = int(ts.timestamp()) if hasattr(ts, 'timestamp') else int(ts)
            candles.append({
                "t": t_unix,
                "o": round(float(row["Open"]), 2),
                "h": round(float(row["High"]), 2),
                "l": round(float(row["Low"]), 2),
                "c": round(float(row["Close"]), 2),
                "v": int(row["Volume"]),
            })

        # Yahoo returns in reverse for some intervals — sort
        candles.sort(key=lambda x: x["t"])
        candles = candles[-limit:]

        _cache[key] = (now, candles)
        return candles
    except Exception as e:
        print(f"YF HISTORY FAILED for {symbol}: {e}")
        return []


# ---------------------------------
# TECHNICAL INDICATOR HELPERS
# ---------------------------------

def calc_rsi(closes, period=14):
    if not closes or len(closes) <= period:
        return None

    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))

    if len(gains) < period:
        return None

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def calc_ema(closes, period=20):
    if not closes or len(closes) < period:
        return None

    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period

    for price in closes[period:]:
        ema = price * k + ema * (1 - k)

    return round(ema, 2)


def calc_macd(closes):
    if not closes or len(closes) < 26:
        return None, None, "Unknown"

    ema12 = calc_ema(closes, 12)
    ema26 = calc_ema(closes, 26)

    if ema12 is None or ema26 is None:
        return None, None, "Unknown"

    macd_line = ema12 - ema26

    if macd_line > 0:
        signal = "Bullish"
    elif macd_line < 0:
        signal = "Bearish"
    else:
        signal = "Neutral"

    return round(macd_line, 2), round(ema12, 2), signal


def determine_trend(closes):
    if not closes or len(closes) < 2:
        return "Unknown"

    ema = calc_ema(closes, 20)

    if ema is None:
        return "Unknown"

    if closes[-1] > ema:
        return "Bullish"
    elif closes[-1] < ema:
        return "Bearish"
    return "Neutral"


def determine_volume(volume, avg_volume):
    if not volume or not avg_volume:
        return "Unknown"

    ratio = volume / avg_volume

    if ratio > 1.5:
        return "Very High"
    elif ratio > 1.0:
        return "High"
    elif ratio > 0.5:
        return "Average"
    return "Low"


# ---------------------------------
# F&O (FUTURES & OPTIONS) HELPERS
# ---------------------------------

# F&O-eligible NSE underlyings
FO_UNIVERSE = [
    {"symbol": "NIFTY", "name": "NIFTY 50", "lot_size": 75, "tick_size": 0.05},
    {"symbol": "BANKNIFTY", "name": "BANK NIFTY", "lot_size": 30, "tick_size": 0.05},
    {"symbol": "FINNIFTY", "name": "FIN NIFTY", "lot_size": 65, "tick_size": 0.05},
    {"symbol": "RELIANCE", "name": "RELIANCE", "lot_size": 250, "tick_size": 1.0},
    {"symbol": "TCS", "name": "TCS", "lot_size": 150, "tick_size": 1.0},
    {"symbol": "INFY", "name": "INFY", "lot_size": 300, "tick_size": 1.0},
    {"symbol": "HDFCBANK", "name": "HDFC BANK", "lot_size": 550, "tick_size": 1.0},
    {"symbol": "ICICIBANK", "name": "ICICI BANK", "lot_size": 700, "tick_size": 1.0},
    {"symbol": "SBIN", "name": "SBI", "lot_size": 1500, "tick_size": 1.0},
    {"symbol": "TATAMOTORS", "name": "TATA MOTORS", "lot_size": 1500, "tick_size": 1.0},
    {"symbol": "BHARTIARTL", "name": "BHARTI AIRTEL", "lot_size": 500, "tick_size": 1.0},
    {"symbol": "ITC", "name": "ITC", "lot_size": 1600, "tick_size": 1.0},
    {"symbol": "HINDUNILVR", "name": "HINDUSTAN UNILEVER", "lot_size": 300, "tick_size": 1.0},
    {"symbol": "LT", "name": "LARSEN & TOUBRO", "lot_size": 150, "tick_size": 1.0},
    {"symbol": "AXISBANK", "name": "AXIS BANK", "lot_size": 625, "tick_size": 1.0},
    {"symbol": "MARUTI", "name": "MARUTI SUZUKI", "lot_size": 50, "tick_size": 1.0},
    {"symbol": "WIPRO", "name": "WIPRO", "lot_size": 1500, "tick_size": 1.0},
    {"symbol": "BAJFINANCE", "name": "BAJAJ FINANCE", "lot_size": 125, "tick_size": 1.0},
]


def get_fo_meta(symbol):
    for u in FO_UNIVERSE:
        if u["symbol"].upper() == symbol.upper():
            return u
    return {"symbol": symbol.upper(), "name": symbol.upper(), "lot_size": 1, "tick_size": 0.05}


def parse_strike_chain(raw, underlying_ltp):
    """Parse Groww's option chain into a normalized list of strikes."""
    if not raw:
        return []

    # Groww returns a dict; try common shapes
    strikes = []

    if isinstance(raw, dict):
        # Try 'strikes' or 'optionChain' keys
        items = raw.get("strikes") or raw.get("optionChain") or raw.get("data") or []
        if isinstance(items, dict):
            items = list(items.values())

        for it in items:
            try:
                strike_price = float(
                    it.get("strike_price") or it.get("strikePrice") or it.get("strike") or 0
                )
                if strike_price <= 0:
                    continue

                ce = it.get("CE") or it.get("ce") or {}
                pe = it.get("PE") or it.get("pe") or {}

                def num(v, default=0):
                    try:
                        return float(v or 0)
                    except (TypeError, ValueError):
                        return default

                ce_oi = num(ce.get("oi") or ce.get("open_interest"))
                pe_oi = num(pe.get("oi") or pe.get("open_interest"))
                ce_ltp = num(ce.get("ltp") or ce.get("last_price"))
                pe_ltp = num(pe.get("ltp") or pe.get("last_price"))

                # No real history from Groww option chain snapshot — generate demo
                ce_hist = [round(ce_ltp * (0.85 + j * 0.008 + ((j * 13 + 7) % 17 - 8) * 0.005), 2) for j in range(20)]
                pe_hist = [round(pe_ltp * (0.85 + j * 0.008 + ((j * 19 + 3) % 23 - 11) * 0.005), 2) for j in range(20)]

                strikes.append({
                    "strike": strike_price,
                    "ce": {
                        "oi": ce_oi,
                        "change_oi": num(ce.get("change_oi") or ce.get("oi_change")),
                        "volume": num(ce.get("volume")),
                        "iv": num(ce.get("iv") or ce.get("implied_volatility")),
                        "ltp": ce_ltp,
                        "ltp_change_pct": 0,
                        "bid": num(ce.get("bid_price") or ce.get("best_bid_price")),
                        "ask": num(ce.get("ask_price") or ce.get("best_ask_price")),
                        "history": ce_hist,
                        "notional": int(ce_ltp * ce_oi),
                    },
                    "pe": {
                        "oi": pe_oi,
                        "change_oi": num(pe.get("change_oi") or pe.get("oi_change")),
                        "volume": num(pe.get("volume")),
                        "iv": num(pe.get("iv") or pe.get("implied_volatility")),
                        "ltp": pe_ltp,
                        "ltp_change_pct": 0,
                        "bid": num(pe.get("bid_price") or pe.get("best_bid_price")),
                        "ask": num(pe.get("ask_price") or pe.get("best_ask_price")),
                        "history": pe_hist,
                        "notional": int(pe_ltp * pe_oi),
                    },
                })
            except Exception:
                continue

    strikes.sort(key=lambda x: x["strike"])
    return strikes


def classify_buildup(change_oi, ltp_change):
    """Classify OI build-up (Long Build-up, Short Build-up, etc.)."""
    if change_oi > 0 and ltp_change > 0:
        return "Long Build-up"
    if change_oi > 0 and ltp_change < 0:
        return "Short Build-up"
    if change_oi < 0 and ltp_change > 0:
        return "Short Covering"
    if change_oi < 0 and ltp_change < 0:
        return "Long Unwinding"
    return "Neutral"


def compute_pcr(strikes):
    """Put-Call Ratio based on total OI."""
    total_ce_oi = sum(s["ce"]["oi"] for s in strikes)
    total_pe_oi = sum(s["pe"]["oi"] for s in strikes)

    if total_ce_oi == 0:
        return None, total_ce_oi, total_pe_oi

    pcr = total_pe_oi / total_ce_oi

    if pcr > 1.3:
        sentiment = "Bullish"
    elif pcr < 0.7:
        sentiment = "Bearish"
    else:
        sentiment = "Neutral"

    return round(pcr, 2), total_ce_oi, total_pe_oi


def compute_max_pain(strikes):
    """Max Pain = strike with minimum total option seller pain."""
    if not strikes:
        return None

    pain_by_strike = {}

    for s in strikes:
        pain = 0
        for row in strikes:
            strike = row["strike"]
            # CE pain: max(0, strike - current_strike) * CE OI
            ce_pain = max(0, strike - s["strike"]) * row["ce"]["oi"]
            pe_pain = max(0, s["strike"] - strike) * row["pe"]["oi"]
            pain += (ce_pain + pe_pain)
        pain_by_strike[s["strike"]] = pain

    if not pain_by_strike:
        return None

    max_pain_strike = min(pain_by_strike, key=pain_by_strike.get)
    return round(max_pain_strike, 2)


def find_atm_strike(strikes, underlying_ltp):
    """Find strike closest to underlying LTP."""
    if not strikes:
        return None
    return min(strikes, key=lambda s: abs(s["strike"] - underlying_ltp))["strike"]


def build_demo_chain(symbol, spot_price):
    """Generate realistic demo option chain for fallback."""
    meta = get_fo_meta(symbol)
    lot = meta["lot_size"]
    atm = round(spot_price / (lot * 0.5)) * (lot * 0.5)
    # Round ATM to nearest reasonable step
    if meta["tick_size"] >= 1:
        atm = round(atm)
    else:
        atm = round(atm / 50) * 50

    strikes = []
    spread = 10
    n_strikes = 11

    for i in range(-5, 6):
        strike = atm + i * spread
        if meta["tick_size"] >= 1:
            strike = round(strike)

        # Intrinsic value
        ce_intrinsic = max(0, spot_price - strike)
        pe_intrinsic = max(0, strike - spot_price)

        # Distance from ATM (used for OI and IV pattern)
        d = abs(strike - spot_price) / spot_price

        # OI follows a smile — peaks slightly OTM
        base_oi = 50000
        if d < 0.005:  # ATM
            ce_oi = base_oi * 6
            pe_oi = base_oi * 6
        elif d < 0.02:
            ce_oi = base_oi * 4
            pe_oi = base_oi * 4
        else:
            ce_oi = base_oi * 1.5
            pe_oi = base_oi * 1.5

        # Premium via simple intrinsic + time value
        time_value = max(0, 30 * (1 - d * 10))
        ce_ltp = round(ce_intrinsic + time_value + (5 if strike < spot_price else 0), 2)
        pe_ltp = round(pe_intrinsic + time_value + (5 if strike > spot_price else 0), 2)

        # IV
        iv = round(15 + d * 200, 2)

        # Change OI (random-ish but deterministic)
        ce_change = int((strike - atm) * 200 + (1000 if strike < atm else -500))
        pe_change = int((atm - strike) * 200 + (-1000 if strike > atm else 500))

        # Generate mini price history (20 points) for chart
        ce_history = []
        pe_history = []
        base_ce = ce_ltp * 0.85
        base_pe = pe_ltp * 0.85
        for j in range(20):
            drift = 1 + (j / 20) * 0.15
            noise_ce = ((j * 13 + 7) % 17 - 8) * 0.01
            noise_pe = ((j * 19 + 3) % 23 - 11) * 0.01
            ce_history.append(round(max(0.05, base_ce * drift + noise_ce * base_ce), 2))
            pe_history.append(round(max(0.05, base_pe * drift + noise_pe * base_pe), 2))

        # LTP change (for build-up)
        ce_ltp_change = round(((ce_ltp - ce_history[-2]) / ce_history[-2]) * 100, 2) if ce_history[-2] else 0
        pe_ltp_change = round(((pe_ltp - pe_history[-2]) / pe_history[-2]) * 100, 2) if pe_history[-2] else 0

        # Notional value (LTP * OI * lot_size)
        ce_notional = int(ce_ltp * ce_oi * lot)
        pe_notional = int(pe_ltp * pe_oi * lot)

        strikes.append({
            "strike": strike,
            "ce": {
                "oi": int(ce_oi),
                "change_oi": ce_change,
                "volume": int(ce_oi * 0.3),
                "iv": iv,
                "ltp": ce_ltp,
                "ltp_change_pct": ce_ltp_change,
                "bid": max(0, ce_ltp - 0.5),
                "ask": ce_ltp + 0.5,
                "history": ce_history,
                "notional": ce_notional,
            },
            "pe": {
                "oi": int(pe_oi),
                "change_oi": pe_change,
                "volume": int(pe_oi * 0.3),
                "iv": iv,
                "ltp": pe_ltp,
                "ltp_change_pct": pe_ltp_change,
                "bid": max(0, pe_ltp - 0.5),
                "ask": pe_ltp + 0.5,
                "history": pe_history,
                "notional": pe_notional,
            },
        })

    return strikes


def generate_demo_expiries(symbol):
    """Generate weekly + monthly expiry dates relative to today."""
    from datetime import datetime, timedelta
    today = datetime.utcnow()
    expiries = []

    # 4 weekly expiries (Thursdays)
    days_to_thursday = (3 - today.weekday()) % 7
    if days_to_thursday == 0 and today.hour >= 12:
        days_to_thursday = 7

    next_thursday = today + timedelta(days=days_to_thursday)
    for i in range(4):
        exp_date = next_thursday + timedelta(days=i * 7)
        expiries.append({
            "date": exp_date.strftime("%Y-%m-%d"),
            "type": "Weekly",
        })

    # 3 monthly expiries (last Thursday)
    for m in range(1, 4):
        y = today.year + (today.month + m - 1) // 12
        mo = (today.month + m - 1) % 12 + 1
        last_day = 31
        while last_day > 28:
            try:
                last_date = datetime(y, mo, last_day)
                break
            except ValueError:
                last_day -= 1

        offset = (3 - last_date.weekday()) % 7
        last_thursday = last_date - timedelta(days=offset)
        expiries.append({
            "date": last_thursday.strftime("%Y-%m-%d"),
            "type": "Monthly",
        })

    return expiries


def generate_demo_futures(symbol, spot_price):
    """Generate near-month futures data."""
    meta = get_fo_meta(symbol)
    premium = round(spot_price * 0.005, 2)
    return {
        "ltp": round(spot_price + premium, 2),
        "change": round(premium / spot_price * 100, 2),
        "oi": 1250000,
        "volume": 85000,
        "iv": 16.5,
        "lot_size": meta["lot_size"],
        "expiry": (generate_demo_expiries(symbol)[0]["date"] if generate_demo_expiries(symbol) else None),
    }


def get_underlying_spot(symbol):
    """Get spot price for an underlying, using existing /api/stock logic or fallback."""
    try:
        data = get_stock(symbol)
        price = data.get("price")
        return float(price) if price else None
    except Exception:
        return None


# ---------------------------------
# SIGNAL ENGINE (BUY / SELL / HOLD)
# ---------------------------------

def generate_signal(data):
    """Generate Buy / Sell / Hold signal with entry, target, stop-loss, R:R, confidence."""
    price = float(data.get("price") or 0)
    if price <= 0:
        return None

    trend = data.get("trend", "Unknown")
    macd_state = data.get("macd", "Unknown")

    # RSI may come as number or string
    try:
        rsi = float(data.get("rsi"))
    except (TypeError, ValueError):
        rsi = None

    ema = data.get("ema", "Unknown")
    volume_state = data.get("volume", "Unknown")
    support = data.get("support")
    resistance = data.get("resistance")

    try:
        support = float(support) if support not in (None, "N/A") else None
    except (TypeError, ValueError):
        support = None

    try:
        resistance = float(resistance) if resistance not in (None, "N/A") else None
    except (TypeError, ValueError):
        resistance = None

    score = 0
    reasons = []

    # Trend
    if trend == "Bullish":
        score += 2
        reasons.append("Price above 20 EMA (Bullish trend)")
    elif trend == "Bearish":
        score -= 2
        reasons.append("Price below 20 EMA (Bearish trend)")

    # MACD
    if macd_state == "Bullish":
        score += 2
        reasons.append("MACD is Bullish")
    elif macd_state == "Bearish":
        score -= 2
        reasons.append("MACD is Bearish")

    # RSI
    if rsi is not None:
        if rsi < 30:
            score += 2
            reasons.append(f"RSI {rsi} — Oversold (mean-reversion buy zone)")
        elif rsi > 70:
            score -= 2
            reasons.append(f"RSI {rsi} — Overbought (mean-reversion sell zone)")
        elif 50 <= rsi <= 65:
            score += 1
            reasons.append(f"RSI {rsi} — Healthy momentum")
        elif 35 <= rsi < 50:
            score -= 1
            reasons.append(f"RSI {rsi} — Weak momentum")

    # Volume confirmation
    if volume_state in ("High", "Very High"):
        if score > 0:
            score += 1
            reasons.append(f"Volume {volume_state} confirms the move")
        elif score < 0:
            score -= 1
            reasons.append(f"Volume {volume_state} confirms the downside")

    # Decision
    if score >= 3:
        action = "STRONG BUY"
    elif score == 2:
        action = "BUY"
    elif score == 1:
        action = "WEAK BUY"
    elif score == 0:
        action = "HOLD"
    elif score == -1:
        action = "WEAK SELL"
    elif score == -2:
        action = "SELL"
    else:
        action = "STRONG SELL"

    # Confidence (0-100) — based on |score| and indicator agreement
    confidence = min(95, 40 + abs(score) * 12)

    # Risk management: stop-loss and targets
    if action in ("STRONG BUY", "BUY", "WEAK BUY"):
        # Stop below support or 2% below price, whichever is tighter
        if support and support < price:
            stop_loss = round(min(support, price * 0.98), 2)
        else:
            stop_loss = round(price * 0.98, 2)

        risk = price - stop_loss
        # Reward: 2R minimum, capped by resistance
        target1 = round(price + risk * 2, 2)
        target2 = round(price + risk * 3, 2)
        target3 = resistance if resistance and resistance > price else round(price + risk * 4, 2)

        rr_ratio = round((target1 - price) / risk, 2) if risk > 0 else 0

        entry_low = round(price * 0.995, 2)
        entry_high = round(price * 1.005, 2)

        expected_profit_pct = round(((target1 - price) / price) * 100, 2)
        expected_loss_pct = round((risk / price) * 100, 2)

    elif action in ("STRONG SELL", "SELL", "WEAK SELL"):
        if resistance and resistance > price:
            stop_loss = round(max(resistance, price * 1.02), 2)
        else:
            stop_loss = round(price * 1.02, 2)

        risk = stop_loss - price
        target1 = round(price - risk * 2, 2)
        target2 = round(price - risk * 3, 2)
        target3 = support if support and support < price else round(price - risk * 4, 2)

        rr_ratio = round((price - target1) / risk, 2) if risk > 0 else 0

        entry_low = round(price * 0.995, 2)
        entry_high = round(price * 1.005, 2)

        expected_profit_pct = round(((price - target1) / price) * 100, 2)
        expected_loss_pct = round((risk / price) * 100, 2)

    else:  # HOLD
        stop_loss = round(support, 2) if support else round(price * 0.97, 2)
        target1 = round(resistance, 2) if resistance else round(price * 1.03, 2)
        target2 = round(price * 1.05, 2)
        target3 = round(price * 1.08, 2)
        rr_ratio = 1.0
        entry_low = round(price * 0.99, 2)
        entry_high = round(price * 1.01, 2)
        expected_profit_pct = round(((target1 - price) / price) * 100, 2)
        expected_loss_pct = round(((price - stop_loss) / price) * 100, 2)

    return {
        "symbol": data.get("symbol"),
        "action": action,
        "confidence": confidence,
        "score": score,
        "current_price": price,
        "entry_zone": [entry_low, entry_high],
        "stop_loss": stop_loss,
        "targets": {
            "target1": target1,
            "target2": target2,
            "target3": target3,
        },
        "risk_reward_ratio": rr_ratio,
        "expected_profit_pct": expected_profit_pct,
        "expected_loss_pct": expected_loss_pct,
        "reasons": reasons,
        "timeframe": "Swing (1-3 weeks)",
        "disclaimer": "Educational only. Not financial advice. Always use your own risk management.",
    }


def demo_data(symbol):
    base = sum(ord(c) for c in symbol) % 1000
    price = 1000 + base + 50

    return {
        "symbol": symbol,
        "price": price,
        "change": round(((price - 1000) / 1000) * 100, 2),
        "rsi": 56.4,
        "macd": "Bullish",
        "ema": "Above 20 EMA",
        "trend": "Bullish",
        "support": round(price * 0.97, 2),
        "resistance": round(price * 1.03, 2),
        "volume": "High",
        "source": "demo",
    }


# ---------------------------------
# HOME
# ---------------------------------

@app.get("/")
def home():
    return {
        "status": "success",
        "message": "AI Stock Platform Backend is running"
    }


# ---------------------------------
# GROWW STATUS
# ---------------------------------

@app.get("/api/groww/status")
def groww_status():
    if groww is None:
        return {
            "connected": False,
            "message": "Groww client is not available"
        }
    return {
        "connected": True,
        "message": "Groww API client created successfully"
    }


# ---------------------------------
# STOCK ENDPOINT
# ---------------------------------

@app.get("/api/stock/{symbol}")
def get_stock(symbol: str):
    symbol = symbol.upper().strip()

    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol required")

    # Try Groww API if connected
    if groww is not None:
        try:
            # NSE equity exchange assumed
            exchange = "NSE"
            trading_symbol = symbol

            # Try to get the instrument token
            try:
                instrument = groww.get_instrument_by_exchange_and_trading_symbol(
                    exchange, trading_symbol
                )
            except Exception:
                instrument = None

            if instrument is not None:
                # Get quote
                quote = None
                try:
                    quote = groww.get_quote(
                        exchange=exchange,
                        segment=groww.SEGMENT_CASH,
                        trading_symbol=trading_symbol,
                    )
                except Exception:
                    pass

                # Get historical candles for indicators
                closes, volumes = [], []

                try:
                    candles = groww.get_historical_candle_data(
                        trading_symbol=trading_symbol,
                        exchange=exchange,
                        segment=groww.SEGMENT_CASH,
                        interval=groww.CANDLE_INTERVAL_DAY,
                    )

                    for c in candles:
                        closes.append(c.close)
                        volumes.append(c.volume)
                except Exception:
                    pass

                ltp = quote.last_price if quote and hasattr(quote, "last_price") else None
                prev_close = quote.previous_close if quote and hasattr(quote, "previous_close") else None

                # If we have ltp and prev_close we can compute change
                change_pct = 0.0
                if ltp is not None and prev_close not in (None, 0):
                    change_pct = round(((ltp - prev_close) / prev_close) * 100, 2)

                # Calculate indicators from closes (if available)
                rsi = calc_rsi(closes) if closes else None
                macd_line, ema_fast, macd_signal = calc_macd(closes) if closes else (None, None, "Unknown")
                ema20 = calc_ema(closes, 20) if closes else None
                trend = determine_trend(closes) if closes else "Unknown"

                avg_vol = sum(volumes[:-1]) / len(volumes[:-1]) if len(volumes) > 1 else 0
                volume_label = determine_volume(volumes[-1], avg_vol) if volumes else "Unknown"

                # Support / resistance: simple 20-day low/high
                support = round(min(closes[-20:]), 2) if len(closes) >= 2 else None
                resistance = round(max(closes[-20:]), 2) if len(closes) >= 2 else None

                ema_label = "Above 20 EMA" if ema20 is not None and closes and closes[-1] > ema20 else (
                    "Below 20 EMA" if ema20 is not None else "Unknown"
                )

                if ltp is not None:
                    payload = {
                        "symbol": symbol,
                        "price": ltp,
                        "change": change_pct,
                        "rsi": rsi if rsi is not None else "N/A",
                        "macd": macd_signal,
                        "ema": ema_label,
                        "trend": trend,
                        "support": support if support is not None else "N/A",
                        "resistance": resistance if resistance is not None else "N/A",
                        "volume": volume_label,
                        "source": "groww",
                    }
                    sig = generate_signal(payload)
                    if sig:
                        payload["signal"] = sig
                    return payload
        except Exception as e:
            print("GROWW STOCK FETCH FAILED:", e)
            traceback.print_exc()

    # Fallback to demo data
    demo = demo_data(symbol)
    sig = generate_signal(demo)
    if sig:
        demo["signal"] = sig
    return demo


# ---------------------------------
# SCANNER ENDPOINT
# ---------------------------------

@app.get("/api/scanner")
def run_scanner(
    rsi_min: float = 50,
    rsi_max: float = 70,
    macd: str = "Bullish",
    ema_condition: str = "Above 20 EMA",
):
    """Scan a small watchlist of stocks matching criteria."""
    universe = [
        "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
        "SBIN", "WIPRO", "LT", "AXISBANK", "HINDUNILVR",
        "BHARTIARTL", "ITC", "KOTAKBANK", "BAJFINANCE", "MARUTI",
    ]

    results = []

    if groww is not None:
        for sym in universe:
            try:
                data = get_stock(sym)
                results.append(data)
            except Exception:
                continue
    else:
        results = [demo_data(s) for s in universe]

    # Apply filters
    def matches(item):
        try:
            rsi_val = float(item.get("rsi", 0))
        except (TypeError, ValueError):
            return False

        if not (rsi_min <= rsi_val <= rsi_max):
            return False

        if macd and macd.lower() != "any":
            if item.get("macd", "").lower() != macd.lower():
                return False

        if ema_condition and ema_condition.lower() != "any":
            if item.get("ema", "").lower() != ema_condition.lower():
                return False

        return True

    filtered = [r for r in results if matches(r)]

    return {
        "count": len(filtered),
        "results": filtered,
        "filters": {
            "rsi_min": rsi_min,
            "rsi_max": rsi_max,
            "macd": macd,
            "ema_condition": ema_condition,
        },
    }


# ---------------------------------
# SIGNAL ENDPOINT
# ---------------------------------

@app.get("/api/signal/{symbol}")
def get_signal(symbol: str):
    symbol = symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol required")

    data = get_stock(symbol)
    signal = generate_signal(data)

    if signal is None:
        raise HTTPException(status_code=400, detail="Unable to generate signal")

    return {
        "stock": data,
        "signal": signal,
    }


# ---------------------------------
# F&O ENDPOINTS
# ---------------------------------

@app.get("/api/fo/universe")
def fo_universe():
    return {"underlying": FO_UNIVERSE}


@app.get("/api/fo/expiries")
def fo_expiries(symbol: str):
    symbol = symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol required")

    if groww is not None:
        try:
            from datetime import datetime
            now = datetime.utcnow()
            res = groww.get_expiries(
                exchange="NSE",
                underlying_symbol=symbol,
                year=now.year,
                month=now.month,
            )
            expiries = []
            if isinstance(res, dict):
                items = res.get("expiries") or res.get("data") or []
                for e in items:
                    d = str(e)[:10]
                    expiries.append({"date": d, "type": "Listed"})
            if expiries:
                return {"symbol": symbol, "expiries": expiries}
        except Exception as e:
            print("GROWW EXPIRIES FAILED:", e)

    return {"symbol": symbol, "expiries": generate_demo_expiries(symbol)}


@app.get("/api/fo/option-chain")
def fo_option_chain(symbol: str, expiry: str = None):
    symbol = symbol.upper().strip()
    meta = get_fo_meta(symbol)

    if not expiry:
        expiries = generate_demo_expiries(symbol)
        if not expiries:
            raise HTTPException(status_code=400, detail="No expiry available")
        expiry = expiries[0]["date"]

    spot = get_underlying_spot(symbol) or 0
    if spot <= 0:
        spot = 1000

    raw_chain = None

    if groww is not None:
        try:
            raw_chain = groww.get_option_chain(
                exchange="NSE",
                underlying=symbol,
                expiry_date=expiry,
            )
        except Exception as e:
            print("GROWW OPTION CHAIN FAILED:", e)

    strikes = parse_strike_chain(raw_chain, spot)

    if not strikes:
        strikes = build_demo_chain(symbol, spot)

    # Tag ATM/ITM/OTM and compute build-up classification
    atm = find_atm_strike(strikes, spot)
    for s in strikes:
        s["ce_moneyness"] = (
            "ITM" if s["strike"] < spot else ("ATM" if abs(s["strike"] - spot) < meta["tick_size"] * 5 else "OTM")
        )
        s["pe_moneyness"] = (
            "ITM" if s["strike"] > spot else ("ATM" if abs(s["strike"] - spot) < meta["tick_size"] * 5 else "OTM")
        )
        s["ce_buildup"] = classify_buildup(
            s["ce"]["change_oi"],
            1 if s["ce_moneyness"] == "ITM" else -1 if s["ce_moneyness"] == "OTM" else 0,
        )
        s["pe_buildup"] = classify_buildup(
            s["pe"]["change_oi"],
            1 if s["pe_moneyness"] == "ITM" else -1 if s["pe_moneyness"] == "OTM" else 0,
        )

    # Aggregate OI totals
    total_ce_oi = sum(s["ce"]["oi"] for s in strikes)
    total_pe_oi = sum(s["pe"]["oi"] for s in strikes)
    total_ce_change = sum(s["ce"]["change_oi"] for s in strikes)
    total_pe_change = sum(s["pe"]["change_oi"] for s in strikes)
    total_ce_volume = sum(s["ce"]["volume"] for s in strikes)
    total_pe_volume = sum(s["pe"]["volume"] for s in strikes)
    total_ce_notional = sum(s["ce"].get("notional", 0) for s in strikes)
    total_pe_notional = sum(s["pe"].get("notional", 0) for s in strikes)

    pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi else None

    return {
        "symbol": symbol,
        "name": meta["name"],
        "lot_size": meta["lot_size"],
        "tick_size": meta["tick_size"],
        "spot": round(spot, 2),
        "expiry": expiry,
        "atm_strike": atm,
        "strikes": strikes,
        "totals": {
            "ce_oi": total_ce_oi,
            "pe_oi": total_pe_oi,
            "ce_change_oi": total_ce_change,
            "pe_change_oi": total_pe_change,
            "ce_volume": total_ce_volume,
            "pe_volume": total_pe_volume,
            "ce_notional": total_ce_notional,
            "pe_notional": total_pe_notional,
            "pcr": pcr,
        },
        "source": "groww" if raw_chain else "demo",
    }


@app.get("/api/fo/strike-history")
def fo_strike_history(symbol: str, strike: int, side: str = "CE", expiry: str = None):
    """Return per-strike price history for the chart visualization."""
    symbol = symbol.upper().strip()
    side = side.upper()
    if side not in ("CE", "PE"):
        side = "CE"

    # Pull chain to get that strike's history
    chain = fo_option_chain(symbol, expiry)
    target = None
    for s in chain["strikes"]:
        if int(s["strike"]) == int(strike):
            target = s[side.lower()]
            break

    if not target:
        # Generate synthetic history
        spot = chain["spot"]
        meta = get_fo_meta(symbol)
        if side == "CE":
            intrinsic = max(0, spot - strike)
            base = intrinsic + 30
        else:
            intrinsic = max(0, strike - spot)
            base = intrinsic + 30
        base = max(5, base)

        history = []
        price = base * 0.7
        for j in range(60):
            drift = 1 + (j / 60) * 0.3
            noise = ((j * 17 + 11) % 31 - 15) * 0.012
            history.append(round(max(0.05, price * drift + noise * price), 2))
        target = {
            "ltp": base,
            "history": history,
            "oi": 0,
            "change_oi": 0,
            "iv": 18,
            "volume": 0,
        }

    # Generate OHLC candles for the strike
    hist = target.get("history", [])
    if len(hist) < 60:
        # extend
        last = hist[-1] if hist else 50
        while len(hist) < 60:
            noise = ((len(hist) * 17 + 11) % 31 - 15) * 0.012
            hist.append(round(max(0.05, last * (1 + noise)), 2))

    candles = []
    for i, p in enumerate(hist):
        noise = ((i * 23 + 7) % 19 - 9) * 0.008
        o = p * (1 - noise)
        c = p
        h = max(o, c) * (1 + abs(noise) * 0.4)
        l = min(o, c) * (1 - abs(noise) * 0.4)
        candles.append({"t": i, "o": round(o, 2), "h": round(h, 2), "l": round(l, 2), "c": round(c, 2), "v": int(50000 + abs(noise) * 800000)})

    closes = [c["c"] for c in candles]

    return {
        "symbol": symbol,
        "strike": strike,
        "side": side,
        "expiry": chain.get("expiry"),
        "ltp": target.get("ltp"),
        "oi": target.get("oi"),
        "change_oi": target.get("change_oi"),
        "iv": target.get("iv"),
        "volume": target.get("volume"),
        "history": target.get("history", []),
        "candles": candles,
    }


@app.get("/api/fo/oi-distribution")
def fo_oi_distribution(symbol: str, expiry: str = None):
    """OI distribution data for the bar chart view."""
    chain = fo_option_chain(symbol, expiry)
    strikes = chain["strikes"]
    spot = chain["spot"]

    return {
        "symbol": symbol,
        "expiry": chain.get("expiry"),
        "spot": spot,
        "strikes": [
            {
                "strike": s["strike"],
                "ce_oi": s["ce"]["oi"],
                "pe_oi": s["pe"]["oi"],
                "ce_change": s["ce"]["change_oi"],
                "pe_change": s["pe"]["change_oi"],
                "ce_ltp": s["ce"]["ltp"],
                "pe_ltp": s["pe"]["ltp"],
                "ce_iv": s["ce"]["iv"],
                "pe_iv": s["pe"]["iv"],
                "ce_notional": s["ce"].get("notional", 0),
                "pe_notional": s["pe"].get("notional", 0),
            }
            for s in strikes
        ],
    }


@app.get("/api/fo/analysis")
def fo_analysis(symbol: str, expiry: str = None):
    chain = fo_option_chain(symbol, expiry)
    strikes = chain.get("strikes", [])
    spot = chain.get("spot", 0)
    atm = chain.get("atm_strike", 0)

    pcr, ce_oi, pe_oi = compute_pcr(strikes)
    max_pain = compute_max_pain(strikes)

    # Top OI strikes
    top_ce_oi = sorted(strikes, key=lambda s: s["ce"]["oi"], reverse=True)[:3]
    top_pe_oi = sorted(strikes, key=lambda s: s["pe"]["oi"], reverse=True)[:3]

    top_ce_oi_strikes = [s["strike"] for s in top_ce_oi]
    top_pe_oi_strikes = [s["strike"] for s in top_pe_oi]

    resistance = max(top_ce_oi_strikes) if top_ce_oi_strikes else None
    support = min(top_pe_oi_strikes) if top_pe_oi_strikes else None

    # Build narrative
    sentiment = "Neutral"
    if pcr is not None:
        if pcr > 1.3:
            sentiment = "Bullish"
        elif pcr < 0.7:
            sentiment = "Bearish"

    expected_range_low = min(s for s in [support, max_pain] if s) if support and max_pain else None
    expected_range_high = max(s for s in [resistance, max_pain] if s) if resistance and max_pain else None

    recommendation = "HOLD"
    if sentiment == "Bullish" and spot > (max_pain or spot):
        recommendation = "BUY"
    elif sentiment == "Bearish" and spot < (max_pain or spot):
        recommendation = "SELL"

    return {
        "symbol": symbol,
        "expiry": chain.get("expiry"),
        "spot": spot,
        "atm_strike": atm,
        "pcr": pcr,
        "total_ce_oi": ce_oi,
        "total_pe_oi": pe_oi,
        "max_pain": max_pain,
        "resistance": resistance,
        "support": support,
        "sentiment": sentiment,
        "expected_range": {
            "low": expected_range_low,
            "high": expected_range_high,
        },
        "recommendation": recommendation,
        "top_ce_oi_strikes": top_ce_oi_strikes,
        "top_pe_oi_strikes": top_pe_oi_strikes,
    }


@app.get("/api/fo/futures")
def fo_futures(symbol: str):
    symbol = symbol.upper().strip()
    spot = get_underlying_spot(symbol) or 0
    if spot <= 0:
        spot = 1000

    if groww is not None:
        try:
            # No direct futures endpoint in growwapi; estimate
            pass
        except Exception:
            pass

    return {
        "symbol": symbol,
        **generate_demo_futures(symbol, spot),
        "spot": spot,
    }


@app.get("/api/fo/greeks")
def fo_greeks(symbol: str, expiry: str, trading_symbol: str):
    """Proxy to Groww's get_greeks for a specific option contract."""
    symbol = symbol.upper().strip()

    if groww is not None:
        try:
            res = groww.get_greeks(
                exchange="NSE",
                underlying=symbol,
                trading_symbol=trading_symbol,
                expiry=expiry,
            )
            if res:
                return {"symbol": symbol, "trading_symbol": trading_symbol, **res}
        except Exception as e:
            print("GROWW GREEKS FAILED:", e)

    # Demo greeks
    spot = get_underlying_spot(symbol) or 1000
    return {
        "symbol": symbol,
        "trading_symbol": trading_symbol,
        "delta": 0.5,
        "gamma": 0.02,
        "theta": -5.0,
        "vega": 12.0,
        "rho": 1.5,
        "iv": 18.0,
        "spot": spot,
        "source": "demo",
    }


# ---------------------------------
# CHART / TECHNICAL ANALYSIS
# ---------------------------------

INTERVAL_MAP = {
    "1m": ("1minute", 1),
    "5m": ("5minute", 5),
    "15m": ("15minute", 15),
    "30m": ("30minute", 30),
    "1h": ("1hour", 60),
    "1d": ("1day", 1440),
}


def parse_groww_candles(raw):
    """Parse Groww candle response into list of OHLCV dicts."""
    if not raw:
        return []

    candles = []

    if isinstance(raw, dict):
        items = (
            raw.get("candles")
            or raw.get("data")
            or raw.get("candleData")
            or []
        )

        # Some responses nest candles by date
        if isinstance(items, dict):
            for _, v in items.items():
                if isinstance(v, list):
                    items = v
                    break

        for c in items:
            try:
                # Groww's typical keys: timestamp/epoch/open/high/low/close/volume
                # Sometimes nested: { "date": "...", "open": ..., ... }
                if isinstance(c, dict):
                    ts = (
                        c.get("timestamp")
                        or c.get("epoch")
                        or c.get("time")
                        or c.get("date")
                        or 0
                    )
                    try:
                        ts = int(ts)
                    except (TypeError, ValueError):
                        # ISO date string
                        from datetime import datetime
                        try:
                            ts = int(datetime.fromisoformat(str(ts).replace("Z", "")).timestamp())
                        except Exception:
                            ts = 0

                    def num(v, default=0.0):
                        try:
                            return float(v or 0)
                        except (TypeError, ValueError):
                            return default

                    candles.append({
                        "t": ts,
                        "o": num(c.get("open")),
                        "h": num(c.get("high")),
                        "l": num(c.get("low")),
                        "c": num(c.get("close")),
                        "v": num(c.get("volume")),
                    })
            except Exception:
                continue

    candles.sort(key=lambda x: x["t"])
    return candles


def compute_bollinger(closes, period=20, mult=2):
    if not closes or len(closes) < period:
        return [], [], []

    mid, upper, lower = [], [], []
    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1 : i + 1]
        mean = sum(window) / period
        variance = sum((x - mean) ** 2 for x in window) / period
        std = variance ** 0.5
        mid.append(round(mean, 2))
        upper.append(round(mean + mult * std, 2))
        lower.append(round(mean - mult * std, 2))

    # Pad with None so it aligns with full candle array
    pad = [None] * (period - 1)
    return pad + mid, pad + upper, pad + lower


def compute_vwap(candles):
    """Volume-weighted average price from intraday candles."""
    cum_tp_vol = 0
    cum_vol = 0
    out = []
    for cd in candles:
        tp = (cd["h"] + cd["l"] + cd["c"]) / 3
        cum_tp_vol += tp * cd["v"]
        cum_vol += cd["v"]
        out.append(round(cum_tp_vol / cum_vol, 2) if cum_vol > 0 else cd["c"])
    return out


def compute_macd_series(closes):
    """Full MACD series for chart plotting."""
    if not closes or len(closes) < 26:
        return [], [], []

    k12 = 2 / 13
    k26 = 2 / 27
    k9 = 2 / 10

    ema12 = sum(closes[:12]) / 12
    ema26 = sum(closes[:26]) / 26

    macd_line = []
    signal_line = []
    histogram = []

    # Build EMA12 series first
    ema12_series = [ema12]
    for price in closes[12:]:
        ema12 = price * k12 + ema12 * (1 - k12)
        ema12_series.append(ema12)

    # EMA26 series
    ema26_series = [ema26]
    for price in closes[26:]:
        ema26 = price * k26 + ema26 * (1 - k26)
        ema26_series.append(ema26)

    # Align to same length (26 onward)
    aligned_ema12 = [None] * 25 + ema12_series
    aligned_ema26 = [None] * 25 + ema26_series

    # MACD line
    for i in range(len(closes)):
        if aligned_ema12[i] is not None and aligned_ema26[i] is not None:
            macd_line.append(round(aligned_ema12[i] - aligned_ema26[i], 2))
        else:
            macd_line.append(None)

    # Signal line (9-period EMA of MACD)
    valid_macd = [m for m in macd_line if m is not None]
    if len(valid_macd) >= 9:
        sig = sum(valid_macd[:9]) / 9
        sig_series = [None] * (len(macd_line) - len(valid_macd))
        sig_series.append(sig)
        for m in valid_macd[9:]:
            sig = m * k9 + sig * (1 - k9)
            sig_series.append(round(sig, 2))
        signal_line = sig_series

        # Histogram
        for i in range(len(macd_line)):
            if macd_line[i] is not None and i < len(signal_line) and signal_line[i] is not None:
                histogram.append(round(macd_line[i] - signal_line[i], 2))
            else:
                histogram.append(None)
    else:
        signal_line = [None] * len(macd_line)
        histogram = [None] * len(macd_line)

    return macd_line, signal_line, histogram


def compute_atr(candles, period=14):
    """Average True Range for stop-loss calculation."""
    if len(candles) < period + 1:
        return None

    trs = []
    for i in range(1, len(candles)):
        h = candles[i]["h"]
        l = candles[i]["l"]
        pc = candles[i - 1]["c"]
        tr = max(h - l, abs(h - pc), abs(l - pc))
        trs.append(tr)

    if len(trs) < period:
        return None

    atr = sum(trs[:period]) / period
    for t in trs[period:]:
        atr = (atr * (period - 1) + t) / period

    return round(atr, 2)


def compute_chart_signal(candles, ema20, ema50, rsi_val, macd_line, macd_signal, bb_upper, bb_lower):
    """Generate buy/sell signal from full chart data with ATR-based stop."""
    if not candles:
        return None

    last = candles[-1]
    price = last["c"]

    score = 0
    reasons = []

    # EMA alignment (Golden Cross / Death Cross)
    if ema20 and ema50:
        if ema20[-1] is not None and ema50[-1] is not None:
            if ema20[-1] > ema50[-1]:
                score += 2
                reasons.append("EMA20 above EMA50 (Golden Cross / uptrend)")
            else:
                score -= 2
                reasons.append("EMA20 below EMA50 (Death Cross / downtrend)")

    # Price vs EMA20
    if ema20 and ema20[-1] is not None:
        if price > ema20[-1]:
            score += 1
            reasons.append(f"Price ₹{price:.2f} above EMA20 ₹{ema20[-1]:.2f}")
        else:
            score -= 1
            reasons.append(f"Price ₹{price:.2f} below EMA20 ₹{ema20[-1]:.2f}")

    # RSI
    if rsi_val is not None:
        if rsi_val < 30:
            score += 2
            reasons.append(f"RSI {rsi_val} — Oversold (mean-reversion buy)")
        elif rsi_val > 70:
            score -= 2
            reasons.append(f"RSI {rsi_val} — Overbought (mean-reversion sell)")
        elif 50 <= rsi_val <= 65:
            score += 1
            reasons.append(f"RSI {rsi_val} — Healthy momentum")
        elif 35 <= rsi_val < 50:
            score -= 1
            reasons.append(f"RSI {rsi_val} — Weak momentum")

    # MACD histogram
    if macd_line and macd_line[-1] is not None and macd_signal and macd_signal[-1] is not None:
        if macd_line[-1] > macd_signal[-1]:
            score += 2
            reasons.append("MACD above signal line (Bullish momentum)")
        else:
            score -= 2
            reasons.append("MACD below signal line (Bearish momentum)")

    # Bollinger position
    if bb_upper and bb_upper[-1] is not None and bb_lower and bb_lower[-1] is not None:
        if price <= bb_lower[-1]:
            score += 1
            reasons.append("Price at lower Bollinger Band (potential bounce)")
        elif price >= bb_upper[-1]:
            score -= 1
            reasons.append("Price at upper Bollinger Band (potential reversal)")

    # Action
    if score >= 5:
        action = "STRONG BUY"
    elif score == 3 or score == 4:
        action = "BUY"
    elif score == 1 or score == 2:
        action = "WEAK BUY"
    elif score == 0:
        action = "HOLD"
    elif score == -1 or score == -2:
        action = "WEAK SELL"
    elif score == -3 or score == -4:
        action = "SELL"
    else:
        action = "STRONG SELL"

    confidence = min(95, 45 + abs(score) * 10)

    # ATR-based risk management
    atr = compute_atr(candles)
    if atr is None:
        atr = price * 0.02

    if action in ("STRONG BUY", "BUY", "WEAK BUY"):
        stop_loss = round(price - atr * 1.5, 2)
        risk = price - stop_loss
        target1 = round(price + risk * 2, 2)
        target2 = round(price + risk * 3, 2)
        target3 = round(price + risk * 5, 2)
    elif action in ("STRONG SELL", "SELL", "WEAK SELL"):
        stop_loss = round(price + atr * 1.5, 2)
        risk = stop_loss - price
        target1 = round(price - risk * 2, 2)
        target2 = round(price - risk * 3, 2)
        target3 = round(price - risk * 5, 2)
    else:
        stop_loss = round(price - atr, 2)
        target1 = round(price + atr * 1.5, 2)
        target2 = round(price + atr * 2.5, 2)
        target3 = round(price + atr * 4, 2)
        risk = price - stop_loss

    rr_ratio = round((abs(target1 - price)) / risk, 2) if risk > 0 else 0
    entry_low = round(price * 0.998, 2)
    entry_high = round(price * 1.002, 2)

    expected_profit_pct = round(((target1 - price) / price) * 100, 2)
    expected_loss_pct = round((risk / price) * 100, 2)

    # Position sizing recommendation
    # Risk 2% of capital per trade
    capital_for_2pct_risk = round(price * 0.02 / max(risk, 0.01), 2)
    suggested_qty = int(capital_for_2pct_risk) if risk > 0 else 0

    return {
        "action": action,
        "confidence": confidence,
        "score": score,
        "current_price": price,
        "atr": atr,
        "entry_zone": [entry_low, entry_high],
        "stop_loss": stop_loss,
        "targets": {
            "target1": target1,
            "target2": target2,
            "target3": target3,
        },
        "risk_reward_ratio": rr_ratio,
        "expected_profit_pct": expected_profit_pct,
        "expected_loss_pct": expected_loss_pct,
        "risk_per_share": round(risk, 2),
        "suggested_qty_for_2pct_capital_risk": suggested_qty,
        "reasons": reasons,
        "timeframe": "Intraday to Swing (depends on selected interval)",
        "disclaimer": "Educational only. Not financial advice. Manage risk carefully.",
    }


def build_demo_candles(symbol, interval, count=200):
    """Generate realistic demo candles with proper OHLCV and trend."""
    from datetime import datetime, timedelta
    base_data = get_underlying_spot(symbol) or 1500

    interval_minutes = INTERVAL_MAP.get(interval, ("1day", 1440))[1]

    now = datetime.utcnow()
    if interval_minutes >= 1440:
        step = timedelta(days=1)
    elif interval_minutes >= 60:
        step = timedelta(hours=interval_minutes // 60)
    else:
        step = timedelta(minutes=interval_minutes)

    candles = []
    price = base_data * 0.92  # start lower so trend is visible

    # Trend bias based on symbol hash
    trend_bias = (sum(ord(c) for c in symbol) % 7 - 3) * 0.0008  # -0.0024 to +0.0024

    for i in range(count):
        ts = int((now - step * (count - i - 1)).timestamp())

        # Random walk with trend
        noise = ((i * 9301 + 49297) % 233280 / 233280 - 0.5) * 0.015
        drift = trend_bias + 0.0002

        change = drift + noise
        new_price = price * (1 + change)

        # Determine OHLC
        o = round(price, 2)
        c = round(new_price, 2)
        high_extra = abs(noise) * price * 0.4
        low_extra = abs(noise) * price * 0.4
        h = round(max(o, c) + high_extra, 2)
        l = round(min(o, c) - low_extra, 2)

        # Volume
        v = int(50000 + abs(noise) * 800000 + (i % 7) * 12000)

        candles.append({"t": ts, "o": o, "h": h, "l": l, "c": c, "v": v})
        price = new_price

    return candles


# ---------------------------------
# CHART ENDPOINT (Live candles + indicators)
# ---------------------------------

@app.get("/api/chart/{symbol}")
def get_chart(symbol: str, interval: str = "1d", limit: int = 200):
    symbol = symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol required")

    if interval not in INTERVAL_MAP:
        interval = "1d"

    candle_interval, _ = INTERVAL_MAP[interval]
    limit = min(max(limit, 30), 500)

    candles = []
    source = "demo"

    if groww is not None:
        try:
            from datetime import datetime, timedelta
            # Estimate how far back to go based on interval
            minutes_back = INTERVAL_MAP[interval][1] * limit
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(minutes=minutes_back)

            start_str = start_time.strftime("%Y-%m-%d %H:%M:%S")
            end_str = end_time.strftime("%Y-%m-%d %H:%M:%S")

            raw = groww.get_historical_candles(
                exchange="NSE",
                segment="CASH",
                groww_symbol=symbol,
                start_time=start_str,
                end_time=end_str,
                candle_interval=candle_interval,
            )

            parsed = parse_groww_candles(raw)
            if parsed and len(parsed) >= 30:
                candles = parsed[-limit:]
                source = "groww"
        except Exception as e:
            print("GROWW CANDLES FAILED:", e)

    if not candles:
        candles = build_demo_candles(symbol, interval, limit)

    closes = [c["c"] for c in candles]

    # Compute indicators
    ema20_full = calc_ema_series(closes, 20)
    ema50_full = calc_ema_series(closes, 50)
    bb_mid, bb_upper, bb_lower = compute_bollinger(closes, 20, 2)
    rsi_full = calc_rsi_series(closes, 14)
    macd_line, macd_signal, macd_hist = compute_macd_series(closes)
    vwap_series = compute_vwap(candles) if interval in ("1m", "5m", "15m", "30m", "1h") else [None] * len(candles)

    # Current values
    current_rsi = next((v for v in reversed(rsi_full) if v is not None), None)
    current_macd_hist = next((v for v in reversed(macd_hist) if v is not None), None)
    current_ema20 = next((v for v in reversed(ema20_full) if v is not None), None)
    current_ema50 = next((v for v in reversed(ema50_full) if v is not None), None)

    # Generate signal
    signal = compute_chart_signal(
        candles, ema20_full, ema50_full, current_rsi,
        macd_line, macd_signal, bb_upper, bb_lower,
    )

    # Recent price action summary
    last = candles[-1]
    prev = candles[-2] if len(candles) > 1 else last
    change = round(((last["c"] - prev["c"]) / prev["c"]) * 100, 2) if prev["c"] else 0

    period_high = max(c["h"] for c in candles[-20:]) if len(candles) >= 20 else last["h"]
    period_low = min(c["l"] for c in candles[-20:]) if len(candles) >= 20 else last["l"]
    avg_volume = sum(c["v"] for c in candles[-20:]) / min(20, len(candles))

    return {
        "symbol": symbol,
        "interval": interval,
        "source": source,
        "candles": candles,
        "indicators": {
            "ema20": ema20_full,
            "ema50": ema50_full,
            "bb_mid": bb_mid,
            "bb_upper": bb_upper,
            "bb_lower": bb_lower,
            "rsi": rsi_full,
            "macd_line": macd_line,
            "macd_signal": macd_signal,
            "macd_hist": macd_hist,
            "vwap": vwap_series,
        },
        "current": {
            "price": last["c"],
            "open": last["o"],
            "high": last["h"],
            "low": last["l"],
            "volume": last["v"],
            "change_pct": change,
            "rsi": current_rsi,
            "macd_hist": current_macd_hist,
            "ema20": current_ema20,
            "ema50": current_ema50,
            "vwap": vwap_series[-1] if vwap_series else None,
            "period_high": period_high,
            "period_low": period_low,
            "avg_volume": round(avg_volume, 0),
        },
        "signal": signal,
    }


def calc_ema_series(closes, period):
    """Compute full EMA series for charting."""
    if not closes or len(closes) < period:
        return [None] * len(closes)

    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    out = [None] * (period - 1) + [round(ema, 2)]

    for price in closes[period:]:
        ema = price * k + ema * (1 - k)
        out.append(round(ema, 2))

    return out


def calc_rsi_series(closes, period=14):
    """Compute full RSI series for sub-panel."""
    if not closes or len(closes) <= period:
        return [None] * len(closes)

    series = [None] * len(closes)
    gains, losses = [], []

    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))

    if len(gains) < period:
        return series

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    rs = avg_gain / avg_loss if avg_loss > 0 else 100
    series[period] = round(100 - (100 / (1 + rs)), 2)

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            rs = 100
        else:
            rs = avg_gain / avg_loss
        series[i + 1] = round(100 - (100 / (1 + rs)), 2)

    return series


# ---------------------------------
# AI ASSISTANT ENDPOINT
# ---------------------------------

# Curated NSE stock universe to detect tickers in user questions
TICKER_UNIVERSE = {
    "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "WIPRO",
    "LT", "AXISBANK", "HINDUNILVR", "BHARTIARTL", "ITC", "KOTAKBANK",
    "BAJFINANCE", "MARUTI", "ASIANPAINT", "HCLTECH", "SUNPHARMA", "TITAN",
    "ULTRACEMCO", "NESTLEIND", "POWERGRID", "NTPC", "ONGC", "M&M",
    "TECHM", "DRREDDY", "CIPLA", "TATAMOTORS", "TATASTEEL", "JSWSTEEL",
    "INDUSINDBK", "BAJAJFINSV", "DIVISLAB", "GRASIM", "COALINDIA",
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "BRITANNIA", "EICHERMOT",
    "HEROMOTOCO", "HINDALCO", "SBILIFE", "HDFCLIFE", "BPCL", "IOC",
}

STOPWORDS = {
    "I", "A", "THE", "IS", "ARE", "WAS", "WERE", "BE", "BUY", "SELL",
    "HOLD", "NOW", "TODAY", "TOMORROW", "AND", "OR", "FOR", "TO", "OF",
    "ON", "IN", "AT", "BY", "WITH", "FROM", "THIS", "THAT", "IT",
    "MY", "YOUR", "DO", "CAN", "COULD", "SHOULD", "WOULD", "WILL",
    "SHALL", "MAY", "MIGHT", "MUST", "HAVE", "HAS", "HAD", "NOT",
    "YES", "NO", "PLEASE", "TELL", "ME", "ABOUT", "WHAT", "WHICH",
    "HOW", "WHEN", "WHERE", "WHY", "WHO", "ANALYZE", "ANALYSIS",
    "STOCK", "SHARE", "PRICE", "MARKET", "TREND", "RSI", "MACD",
    "EMA", "GOOD", "BAD", "BEST", "WORST", "TODAY", "LONG", "SHORT",
}


def detect_ticker(question):
    """Detect a stock ticker in a user question, preferring known NSE symbols."""
    upper_q = question.upper()
    # Strip punctuation for matching
    clean = "".join(c if c.isalnum() or c.isspace() else " " for c in upper_q)
    words = clean.split()

    # First pass: known tickers
    for w in words:
        if w in TICKER_UNIVERSE:
            return w

    # Second pass: any uppercase alpha token with 3+ chars, not a stopword
    for w in words:
        if len(w) >= 3 and w.isalpha() and w not in STOPWORDS:
            return w

    return None


@app.post("/api/ai/ask")
def ai_ask(payload: dict):
    """Simple rule-based AI assistant for stock questions."""
    q = (payload.get("question") or "").strip()

    if not q:
        raise HTTPException(status_code=400, detail="Question required")

    candidate = detect_ticker(q)

    if candidate:
        try:
            data = get_stock(candidate)
            signal = generate_signal(data)
            price = data.get("price")
            trend = data.get("trend")
            rsi = data.get("rsi")
            macd = data.get("macd")

            answer_lines = [
                f"{candidate} is trading at ₹{price} with a {trend} trend.",
                f"RSI: {rsi} | MACD: {macd}.",
            ]

            if signal:
                action = signal["action"]
                confidence = signal["confidence"]
                t1 = signal["targets"]["target1"]
                sl = signal["stop_loss"]
                entry = signal["entry_zone"]
                rr = signal["risk_reward_ratio"]
                profit = signal["expected_profit_pct"]
                loss = signal["expected_loss_pct"]

                answer_lines.append(
                    f"\nRecommendation: {action} (confidence {confidence}%)."
                )
                answer_lines.append(
                    f"Entry zone: ₹{entry[0]} - ₹{entry[1]} | Stop-loss: ₹{sl}"
                )
                answer_lines.append(
                    f"Target 1: ₹{t1} (~{profit}% profit, R:R {rr}) | Risk: ~{loss}%"
                )

                if signal["reasons"]:
                    answer_lines.append("Reasons: " + "; ".join(signal["reasons"][:3]))

            answer_lines.append(
                "\nEducational only — not financial advice. Use proper risk management."
            )

            return {
                "answer": " ".join(answer_lines),
                "stock": data,
                "signal": signal,
            }
        except Exception:
            pass

    q_lower = q.lower()

    if "rsi" in q_lower:
        answer = (
            "RSI (Relative Strength Index) measures momentum on a 0-100 scale. "
            "Above 70 is overbought and below 30 is oversold."
        )
    elif "macd" in q_lower:
        answer = (
            "MACD (Moving Average Convergence Divergence) shows the relationship "
            "between two moving averages. A bullish MACD suggests upward momentum."
        )
    elif "ema" in q_lower:
        answer = (
            "EMA (Exponential Moving Average) gives more weight to recent prices. "
            "Price above 20 EMA is generally considered bullish."
        )
    elif "support" in q_lower or "resistance" in q_lower:
        answer = (
            "Support is a price level where a stock tends to stop falling, "
            "and resistance is where it tends to stop rising."
        )
    elif "trend" in q_lower:
        answer = (
            "Trend indicates the overall direction of price movement: "
            "Bullish (up), Bearish (down), or Neutral (sideways)."
        )
    else:
        answer = (
            "I can help with stock analysis. Try asking about a specific stock "
            "(e.g. 'Analyze RELIANCE') or about indicators like RSI, MACD, EMA, "
            "support, resistance, or trend."
        )

    return {"answer": answer, "stock": None}


# ---------------------------------
# MARKET OVERVIEW ENDPOINT
# ---------------------------------

@app.get("/api/markets")
def market_overview():
    indices = [
        {"symbol": "NIFTY", "name": "NIFTY 50"},
        {"symbol": "BANKNIFTY", "name": "BANK NIFTY"},
        {"symbol": "SENSEX", "name": "SENSEX"},
    ]

    results = []

    for idx in indices:
        data = demo_data(idx["symbol"])
        results.append({
            "name": idx["name"],
            "symbol": idx["symbol"],
            "price": data["price"],
            "change": data["change"],
        })

    return {"indices": results}