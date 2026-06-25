import dotenv from "dotenv";
dotenv.config({ override: true });

import express from "express";
import cors from "cors";
import axios from "axios";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { TRACKED_STOCKS } from "./config/stocks.js";
import {
  buildWalletSnapshot,
  getAllStrategyTickers,
  getTradeIntervalMs,
  initializeTradingState,
  restartStrategies,
  resetTradingState,
  runTradingCycle,
  updateTradingMarketStatus,
  updateTradingSettingsAndTickerLists,
} from "./services/paperTradingEngine.js";
import { getMarketStatus } from "./services/marketHours.js";

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR || path.resolve(__dirname, "../frontend/dist");
const SERVE_FRONTEND = process.env.SERVE_FRONTEND !== "false";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const DEFAULT_TICKERS = TRACKED_STOCKS.filter((stock) => stock.enabled).map((stock) => stock.ticker);
const DEFAULT_STOCK_META = TRACKED_STOCKS.filter((stock) => stock.enabled);

function getActiveTickers() {
  return getAllStrategyTickers();
}

function getStockMeta(tickers = getActiveTickers()) {
  return tickers.map((ticker) => {
    const meta = DEFAULT_STOCK_META.find((stock) => stock.ticker === ticker) || {};
    return {
      ticker,
      name: meta.name || ticker,
      sector: meta.sector || "Custom",
      enabled: true,
    };
  });
}

const QUOTE_CACHE_MS = Number(process.env.QUOTE_CACHE_MS || 5 * 60 * 1000);
const NEWS_CACHE_MS = Number(process.env.NEWS_CACHE_MS || 15 * 60 * 1000);
const REQUEST_DELAY_MS = Number(process.env.FINNHUB_REQUEST_DELAY_MS || 250);
const CLOSED_QUOTE_CACHE_MS = Number(
  process.env.CLOSED_MARKET_QUOTE_CACHE_MS || process.env.CLOSED_QUOTE_CACHE_MS || 60 * 60 * 1000
);
let lastAfterCloseDisplayRefreshDate = null;

let quoteCache = {
  quotes: {},
  lastUpdated: null,
  refreshPromise: null,
  lastError: null,
  marketStatus: null,
};

let newsCache = {
  news: [],
  lastUpdated: null,
  refreshPromise: null,
  lastError: null,
};

app.use(cors());
app.use(express.json());

initializeTradingState(DEFAULT_TICKERS);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFresh(isoString, maxAgeMs) {
  if (!isoString) return false;
  const timestamp = new Date(isoString).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < maxAgeMs;
}

function currentMarketStatus() {
  return getMarketStatus(new Date());
}

function walletSnapshot(livePrices = quoteCache.quotes) {
  const marketStatus = currentMarketStatus();
  const tickers = getActiveTickers();

  return buildWalletSnapshot({
    tickers,
    stockMeta: getStockMeta(tickers),
    livePrices,
    marketStatus,
  });
}

function marketClosedResponseMessage(marketStatus) {
  return `${marketStatus.reason} Simulated buy/sell cycles are paused until the next regular session${marketStatus.nextRegularOpen ? ` at ${marketStatus.nextRegularOpen}` : ""}. Display quotes can still update from the latest available close/quote.`;
}

function normalizeFinnhubQuote(ticker, data = {}) {
  return {
    ticker,
    price: Number(data.c || 0),
    change: Number(data.d || 0),
    percentChange: Number(data.dp || 0),
    high: Number(data.h || 0),
    low: Number(data.l || 0),
    open: Number(data.o || 0),
    previousClose: Number(data.pc || 0),
    timestamp: Number(data.t || 0),
    fetchedAt: new Date().toISOString(),
  };
}

function placeholderRating(changePct) {
  if (changePct >= 1.5) return "Buy";
  if (changePct <= -1.5) return "Sell";
  return "Hold";
}

function fiveMinuteSignalRating(direction) {
  if (direction === "up") return "Buy";
  if (direction === "down") return "Sell";
  return "Hold";
}

function makeFallbackLine(price) {
  return Array.from({ length: 30 }, (_, i) => ({
    label: i + 1,
    price: Number(price || 0),
  }));
}

async function getFinnhubQuote(ticker) {
  if (!FINNHUB_API_KEY) {
    throw new Error("Missing FINNHUB_API_KEY environment variable. Use backend/.env locally or Railway Variables in production.");
  }

  const response = await axios.get("https://finnhub.io/api/v1/quote", {
    params: {
      symbol: ticker,
      token: FINNHUB_API_KEY,
    },
  });

  return normalizeFinnhubQuote(ticker, response.data);
}

async function refreshQuoteCache({ force = false, allowWhenClosed = false } = {}) {
  const marketStatus = currentMarketStatus();
  quoteCache.marketStatus = marketStatus;
  updateTradingMarketStatus(marketStatus);

  if (!marketStatus.isOpen && !allowWhenClosed) {
    quoteCache.lastError = null;
    return {
      ...quoteCache,
      marketStatus,
      marketClosed: true,
      marketClosedMessage: marketClosedResponseMessage(marketStatus),
    };
  }

  const effectiveCacheMs = marketStatus.isOpen ? QUOTE_CACHE_MS : CLOSED_QUOTE_CACHE_MS;

  if (!force && isFresh(quoteCache.lastUpdated, effectiveCacheMs) && Object.keys(quoteCache.quotes).length) {
    return {
      ...quoteCache,
      marketStatus,
      marketClosed: !marketStatus.isOpen,
      marketClosedMessage: !marketStatus.isOpen ? marketClosedResponseMessage(marketStatus) : null,
    };
  }

  if (quoteCache.refreshPromise) {
    return quoteCache.refreshPromise;
  }

  quoteCache.refreshPromise = (async () => {
    if (!FINNHUB_API_KEY) {
      quoteCache.lastError = "Missing FINNHUB_API_KEY environment variable. Use backend/.env locally or Railway Variables in production.";
      quoteCache.refreshPromise = null;
      return quoteCache;
    }

    const nextQuotes = { ...quoteCache.quotes };
    const errors = [];

    for (const ticker of getActiveTickers()) {
      try {
        const quote = await getFinnhubQuote(ticker);
        if (quote.price > 0) {
          nextQuotes[ticker] = quote;
        }
      } catch (error) {
        errors.push(`${ticker}: ${error.response?.data?.error || error.message}`);
      }

      if (REQUEST_DELAY_MS > 0) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    quoteCache = {
      quotes: nextQuotes,
      lastUpdated: new Date().toISOString(),
      refreshPromise: null,
      lastError: errors.length ? errors.join("; ") : null,
      marketStatus,
      marketClosed: !marketStatus.isOpen,
      marketClosedMessage: !marketStatus.isOpen ? marketClosedResponseMessage(marketStatus) : null,
    };

    return quoteCache;
  })();

  return quoteCache.refreshPromise;
}

async function getRecentFinnhubNews(ticker, limit = 8) {
  if (!FINNHUB_API_KEY) return [];

  const today = new Date();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const from = weekAgo.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  const response = await axios.get("https://finnhub.io/api/v1/company-news", {
    params: {
      symbol: ticker,
      from,
      to,
      token: FINNHUB_API_KEY,
    },
  });

  return Array.isArray(response.data) ? response.data.slice(0, limit) : [];
}

async function refreshNewsCache({ force = false } = {}) {
  if (!force && isFresh(newsCache.lastUpdated, NEWS_CACHE_MS)) {
    return newsCache;
  }

  if (newsCache.refreshPromise) {
    return newsCache.refreshPromise;
  }

  newsCache.refreshPromise = (async () => {
    if (!FINNHUB_API_KEY) {
      newsCache.lastError = "Missing FINNHUB_API_KEY in backend/.env";
      newsCache.refreshPromise = null;
      return newsCache;
    }

    const errors = [];
    const news = [];

    for (const ticker of getActiveTickers().slice(0, 5)) {
      try {
        const articles = await getRecentFinnhubNews(ticker, 1);
        const item = articles[0];

        if (item) {
          news.push({
            source: item.source || "Finnhub",
            time: item.datetime
              ? new Date(item.datetime * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Now",
            title: item.headline,
            tickers: [ticker],
            sentiment: "Neutral",
            link: item.url,
          });
        }
      } catch (error) {
        errors.push(`${ticker}: ${error.response?.data?.error || error.message}`);
      }

      if (REQUEST_DELAY_MS > 0) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    newsCache = {
      news,
      lastUpdated: new Date().toISOString(),
      refreshPromise: null,
      lastError: errors.length ? errors.join("; ") : null,
    };

    return newsCache;
  })();

  return newsCache.refreshPromise;
}

async function getRealChartData(ticker) {
  if (!TWELVE_DATA_API_KEY) return [];

  const response = await axios.get("https://api.twelvedata.com/time_series", {
    params: {
      symbol: ticker,
      interval: "5min",
      outputsize: 60,
      apikey: TWELVE_DATA_API_KEY,
    },
  });

  const payload = response.data;

  if (payload.status === "error" || !Array.isArray(payload.values)) {
    console.log(`Twelve Data chart failed for ${ticker}:`, payload.message || payload);
    return [];
  }

  return payload.values
    .reverse()
    .map((point, index) => ({
      label: index + 1,
      price: Number(point.close),
      datetime: point.datetime,
    }))
    .filter((point) => Number.isFinite(point.price));
}

async function runScheduledTradingCycle(reason = "interval") {
  const marketStatus = currentMarketStatus();
  updateTradingMarketStatus(marketStatus);

  if (!marketStatus.isOpen) {
    const afterCloseDate = marketStatus.session === "after-close"
      ? String(marketStatus.currentEasternTime || "").slice(0, 10)
      : null;
    const shouldForceAfterCloseDisplayRefresh = Boolean(
      afterCloseDate && lastAfterCloseDisplayRefreshDate !== afterCloseDate
    );

    const displayQuotes = await refreshQuoteCache({
      force: shouldForceAfterCloseDisplayRefresh,
      allowWhenClosed: true,
    });

    if (shouldForceAfterCloseDisplayRefresh && displayQuotes.lastUpdated) {
      lastAfterCloseDisplayRefreshDate = afterCloseDate;
    }

    return {
      status: "market_closed",
      message: marketClosedResponseMessage(marketStatus),
      marketStatus,
      quoteCache: {
        lastUpdated: displayQuotes.lastUpdated,
        quoteCount: Object.keys(displayQuotes.quotes || {}).length,
        lastError: displayQuotes.lastError,
      },
      actions: [],
      skipped: getActiveTickers().map((ticker) => ({ ticker, reason: marketStatus.reason })),
    };
  }

  const quotes = await refreshQuoteCache({ force: true, allowWhenClosed: false });

  return runTradingCycle({
    tickers: getActiveTickers(),
    reason,
    getQuote: async (ticker) => quotes.quotes[ticker],
  });
}

setTimeout(() => {
  runScheduledTradingCycle("startup").then((result) => {
    console.log(result.message || "Startup trading cycle completed.");
  });
}, 2500);

setInterval(() => {
  runScheduledTradingCycle("5-minute interval").then((result) => {
    console.log(result.message || "Trading cycle completed.");
  });
}, getTradeIntervalMs());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    backend: "running",
    trackedStocks: getActiveTickers().length,
    hasFinnhubKey: Boolean(FINNHUB_API_KEY),
    hasTwelveDataKey: Boolean(TWELVE_DATA_API_KEY),
    hasOpenAiKey: Boolean(OPENAI_API_KEY),
    quoteCache: {
      lastUpdated: quoteCache.lastUpdated,
      quoteCount: Object.keys(quoteCache.quotes).length,
      cacheMinutes: QUOTE_CACHE_MS / 60000,
      lastError: quoteCache.lastError,
    },
    marketStatus: currentMarketStatus(),
    paperTrading: walletSnapshot().meta,
    time: new Date().toISOString(),
  });
});

app.get("/api/test-finnhub", async (req, res) => {
  try {
    const data = await getFinnhubQuote("AAPL");

    res.json({
      status: "ok",
      symbol: "AAPL",
      currentPrice: data.price,
      change: data.change,
      percentChange: data.percentChange,
      high: data.high,
      low: data.low,
      open: data.open,
      previousClose: data.previousClose,
      timestamp: data.timestamp,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Finnhub request failed",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/api/test-twelve-data", async (req, res) => {
  try {
    if (!TWELVE_DATA_API_KEY) {
      return res.status(500).json({
        status: "error",
        message: "Missing TWELVE_DATA_API_KEY in .env",
      });
    }

    const data = await getRealChartData("AAPL");

    res.json({
      status: data.length ? "ok" : "error",
      symbol: "AAPL",
      points: data.length,
      preview: data.slice(0, 5),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Twelve Data request failed",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/api/test-openai", async (req, res) => {
  try {
    if (!openai) {
      return res.status(500).json({
        status: "error",
        message: "Missing OPENAI_API_KEY in .env. The app can still run with rule-based analysis.",
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You are a financial AI assistant testing connectivity.",
        },
        {
          role: "user",
          content: "Say: OpenAI stock analysis backend is connected successfully.",
        },
      ],
    });

    res.json({
      status: "ok",
      reply: response.choices[0].message.content,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "OpenAI request failed",
      details: error.message,
    });
  }
});

app.get("/api/chart/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker?.toUpperCase();

    if (!ticker) {
      return res.status(400).json({
        status: "error",
        message: "Missing ticker",
      });
    }

    if (!TWELVE_DATA_API_KEY) {
      return res.status(500).json({
        status: "error",
        message: "Missing TWELVE_DATA_API_KEY in .env",
      });
    }

    const data = await getRealChartData(ticker);

    res.json({
      status: data.length ? "ok" : "fallback",
      ticker,
      chartSource: data.length ? "Twelve Data" : "Fallback",
      data: data.length ? data : makeFallbackLine(0),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Chart request failed",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/api/market-dashboard", async (req, res) => {
  try {
    const [quoteData, newsData] = await Promise.all([
      refreshQuoteCache({ force: false, allowWhenClosed: true }),
      refreshNewsCache({ force: false }),
    ]);

    const activeTickers = getActiveTickers();
    const activeStockMeta = getStockMeta(activeTickers);

    const walletSnapshot = buildWalletSnapshot({
      tickers: activeTickers,
      stockMeta: activeStockMeta,
      livePrices: quoteData.quotes,
      marketStatus: quoteData.marketStatus || currentMarketStatus(),
    });

    const signalsByTicker = Object.fromEntries(
      walletSnapshot.priceSignals.map((signal) => [signal.ticker, signal])
    );

    const stocks = activeTickers.map((ticker) => {
      const meta = activeStockMeta.find((stock) => stock.ticker === ticker) || {};
      const quote = quoteData.quotes[ticker] || {};
      const signal = signalsByTicker[ticker] || {};
      const price = Number(quote.price || signal.price || 0);
      const dailyChangeAmount = Number(quote.change || 0);
      const dailyChangePct = Number(quote.percentChange || 0);
      const rating = signal.direction && signal.direction !== "waiting"
        ? fiveMinuteSignalRating(signal.direction)
        : placeholderRating(dailyChangePct);

      return {
        ticker,
        name: meta.name || ticker,
        sector: meta.sector || "Unknown",
        rating,
        price,
        changeAmount: dailyChangeAmount,
        changePct: dailyChangePct,
        open: Number(quote.open || 0),
        high: Number(quote.high || 0),
        low: Number(quote.low || 0),
        previousClose: Number(quote.previousClose || 0),
        quoteFetchedAt: quote.fetchedAt || null,
        fiveMinuteDirection: signal.direction || "waiting",
        fiveMinuteChangePct: signal.changePercent || 0,
        volume: "Cached quote",
        confidence: Math.min(95, Math.max(45, Math.round(60 + Math.abs(dailyChangePct) * 8))),
        rationale:
          signal.note || "Rule-based dashboard rating from cached quote data. No real orders are placed.",
        data: makeFallbackLine(price),
        chartSource: "Separate chart endpoint",
      };
    });

    res.json({
      status: "ok",
      provider: "Finnhub quotes cached for display; paper trading is limited to regular U.S. market hours",
      stocks,
      news: newsData.news || [],
      trackedStocks: activeStockMeta,
      quoteCache: {
        lastUpdated: quoteData.lastUpdated,
        quoteCount: Object.keys(quoteData.quotes).length,
        cacheMinutes: QUOTE_CACHE_MS / 60000,
        lastError: quoteData.lastError,
        marketClosed: Boolean(quoteData.marketClosed),
        marketClosedMessage: quoteData.marketClosedMessage || null,
      },
      marketStatus: quoteData.marketStatus || currentMarketStatus(),
      lastUpdated: quoteData.lastUpdated || new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Dashboard request failed",
      details: error.response?.data || error.message,
    });
  }
});

function ruleBasedAnalysis(ticker, quote, signal) {
  const direction = signal?.direction || "waiting";
  const rating = direction === "up" ? "Buy" : direction === "down" ? "Sell" : "Hold";

  return {
    rating,
    confidence: direction === "waiting" || direction === "baseline" ? 50 : 68,
    summary:
      direction === "up"
        ? `${ticker} moved up compared with the previous 5-minute baseline. The paper-trading engine treats this as a simulated buy signal.`
        : direction === "down"
        ? `${ticker} moved down compared with the previous 5-minute baseline. The paper-trading engine treats this as a simulated sell signal.`
        : `${ticker} does not yet have a strong 5-minute signal. The simulator will wait for the next cycle.`,
    bullishFactors: direction === "up" ? ["Positive 5-minute price movement"] : [],
    bearishFactors: direction === "down" ? ["Negative 5-minute price movement"] : [],
    riskLevel: Math.abs(Number(quote?.percentChange || 0)) > 3 ? "High" : "Medium",
  };
}

app.get("/api/analyze/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker?.toUpperCase();

    if (!ticker) {
      return res.status(400).json({
        status: "error",
        message: "Missing ticker",
      });
    }

    const quoteData = await refreshQuoteCache({ force: false, allowWhenClosed: true });
    const walletSnapshot = buildWalletSnapshot({ tickers: getActiveTickers(), stockMeta: getStockMeta(), livePrices: quoteData.quotes, marketStatus: quoteData.marketStatus || currentMarketStatus() });
    const signal = walletSnapshot.priceSignals.find((item) => item.ticker === ticker);
    const quote = quoteData.quotes[ticker];

    if (!openai) {
      return res.json({
        status: "ok",
        ticker,
        currentPrice: quote?.price || 0,
        percentChange: quote?.percentChange || 0,
        analysis: ruleBasedAnalysis(ticker, quote, signal),
        analyzedAt: new Date().toISOString(),
        source: "Rule-based fallback because OPENAI_API_KEY is not set",
      });
    }

    const articles = await getRecentFinnhubNews(ticker, 8);

    const headlines = articles.map((item, index) => `${index + 1}. ${item.headline}`).join("\n");

    const prompt = `
You are an expert stock market analyst. This is for an educational paper-trading simulator only, not real financial advice.

Analyze this stock using:
- recent news headlines
- today's price movement
- the simulator's latest 5-minute price signal

Ticker: ${ticker}
Current price: ${quote?.price || 0}
Daily percent change: ${quote?.percentChange || 0}%
5-minute signal: ${signal?.direction || "waiting"}
5-minute note: ${signal?.note || "No signal yet"}

Recent headlines:
${headlines || "No recent headlines found."}

Return ONLY valid JSON in this exact format:

{
  "rating": "Buy",
  "confidence": 78,
  "summary": "Short paragraph.",
  "bullishFactors": ["factor 1", "factor 2"],
  "bearishFactors": ["risk 1", "risk 2"],
  "riskLevel": "Low"
}

Rules:
- rating must be Buy, Hold, or Sell
- confidence must be 1-100
- riskLevel must be Low, Medium, or High
- return ONLY JSON
`;

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "You are a professional institutional equity analyst. Never imply real trading advice.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = aiResponse.choices[0].message.content;

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = ruleBasedAnalysis(ticker, quote, signal);
    }

    res.json({
      status: "ok",
      ticker,
      currentPrice: quote?.price || 0,
      percentChange: quote?.percentChange || 0,
      analysis: parsed,
      analyzedAt: new Date().toISOString(),
      source: "OpenAI + Finnhub",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Analysis failed",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/api/wallet", async (req, res) => {
  try {
    const quoteData = await refreshQuoteCache({ force: false, allowWhenClosed: true });

    res.json(
      buildWalletSnapshot({
        tickers: getActiveTickers(),
        stockMeta: getStockMeta(),
        livePrices: quoteData.quotes,
        marketStatus: quoteData.marketStatus || currentMarketStatus(),
      })
    );
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to load wallet",
      details: error.message,
    });
  }
});

app.get("/api/viewer", async (req, res) => {
  try {
    const quoteData = await refreshQuoteCache({ force: false, allowWhenClosed: true });

    res.json(
      buildWalletSnapshot({
        tickers: getActiveTickers(),
        stockMeta: getStockMeta(),
        livePrices: quoteData.quotes,
        marketStatus: quoteData.marketStatus || currentMarketStatus(),
      })
    );
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to load public viewer",
      details: error.message,
    });
  }
});

app.get("/api/market-status", (req, res) => {
  res.json({
    status: "ok",
    marketStatus: currentMarketStatus(),
  });
});

function collectIncomingTickers(input = {}) {
  const values = [
    ...(Array.isArray(input.strategy1Tickers) ? input.strategy1Tickers : []),
    ...(Array.isArray(input.strategy2Tickers) ? input.strategy2Tickers : []),
  ];

  const seen = new Set();
  const tickers = [];

  for (const value of values) {
    const ticker = String(value || "").trim().toUpperCase().replace(/^\$/, "");
    if (!ticker || seen.has(ticker) || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) continue;
    seen.add(ticker);
    tickers.push(ticker);
  }

  return tickers;
}

async function prepareLivePricesForSettings(input = {}) {
  const marketStatus = currentMarketStatus();
  const livePrices = { ...quoteCache.quotes };
  const incomingTickers = collectIncomingTickers(input);

  // Ticker replacement/settings can use the latest available quote even when the market is closed.
  // Trading cycles are still blocked outside regular market hours.
  const missing = incomingTickers.filter((ticker) => !livePrices[ticker]?.price);

  for (const ticker of missing) {
    try {
      const quote = await getFinnhubQuote(ticker);
      if (quote.price > 0) {
        livePrices[ticker] = quote;
      }
    } catch (error) {
      console.log(`Ticker settings quote lookup failed for ${ticker}:`, error.response?.data?.error || error.message);
    }

    if (REQUEST_DELAY_MS > 0) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  quoteCache.quotes = { ...quoteCache.quotes, ...livePrices };
  quoteCache.lastUpdated = quoteCache.lastUpdated || new Date().toISOString();
  return livePrices;
}

app.post("/api/wallet/settings", async (req, res) => {
  try {
    const livePrices = await prepareLivePricesForSettings(req.body || {});
    const result = updateTradingSettingsAndTickerLists(req.body || {}, { livePrices });

    res.json({
      ...walletSnapshot(livePrices),
      tickerChanges: result.changes,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to update wallet settings",
      details: error.message,
    });
  }
});

app.post("/api/trading/run-cycle", async (req, res) => {
  try {
    const marketStatus = currentMarketStatus();
    updateTradingMarketStatus(marketStatus);

    if (!marketStatus.isOpen) {
      return res.json({
        status: "market_closed",
        message: marketClosedResponseMessage(marketStatus),
        marketStatus,
        actions: [],
        skipped: getActiveTickers().map((ticker) => ({ ticker, reason: marketStatus.reason })),
        wallet: walletSnapshot(quoteCache.quotes),
      });
    }

    const quotes = await refreshQuoteCache({ force: true, allowWhenClosed: false });
    const result = await runTradingCycle({
      tickers: getActiveTickers(),
      reason: req.body?.reason || "manual button",
      force: Boolean(req.body?.force),
      getQuote: async (ticker) => quotes.quotes[ticker],
    });

    res.json({
      ...result,
      wallet: buildWalletSnapshot({
        tickers: getActiveTickers(),
        stockMeta: getStockMeta(),
        livePrices: quotes.quotes,
        marketStatus: quotes.marketStatus || marketStatus,
      }),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to run trading cycle",
      details: error.message,
    });
  }
});

// Backward-compatible route from the old version. It now runs one simulator cycle.
app.post("/api/wallet/initial-buy", async (req, res) => {
  try {
    const marketStatus = currentMarketStatus();
    updateTradingMarketStatus(marketStatus);

    if (!marketStatus.isOpen) {
      return res.json({
        status: "market_closed",
        message: marketClosedResponseMessage(marketStatus),
        actions: [],
        wallet: walletSnapshot(quoteCache.quotes),
      });
    }

    const quotes = await refreshQuoteCache({ force: true, allowWhenClosed: false });
    const result = await runTradingCycle({
      tickers: getActiveTickers(),
      reason: "legacy initial-buy route",
      getQuote: async (ticker) => quotes.quotes[ticker],
    });

    res.json({
      status: result.status,
      message: "Paper trading engine initialized/checked.",
      actions: result.actions,
      wallet: buildWalletSnapshot({
        tickers: getActiveTickers(),
        stockMeta: getStockMeta(),
        livePrices: quotes.quotes,
        marketStatus: quotes.marketStatus || marketStatus,
      }),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to initialize paper wallets",
      details: error.message,
    });
  }
});

app.post("/api/wallet/restart", (req, res) => {
  try {
    const strategyIds = Array.isArray(req.body?.strategyIds) ? req.body.strategyIds : [];
    const resetBaselines = Boolean(req.body?.resetBaselines);

    const result = restartStrategies({
      strategyIds,
      tickers: getActiveTickers(),
      settingsInput: req.body?.settings || req.body || {},
      resetBaselines,
    });

    res.json({
      status: "ok",
      message:
        result.restarted.length === 2
          ? "Both paper wallets restarted with the saved restart-menu settings. Strategy 2 will evenly split its starting value on the next valid quote cycle."
          : `Restarted ${result.restarted.join(", ")}.`,
      restarted: result.restarted,
      wallet: walletSnapshot(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to restart paper wallets",
      details: error.message,
    });
  }
});

app.post("/api/wallet/reset", (req, res) => {
  resetTradingState(DEFAULT_TICKERS);

  res.json({
    status: "ok",
    message: "Both paper wallets reset to defaults. Strategy 1 buy amount is $1 and Strategy 2 starts with $1,000 split evenly across the watchlist.",
    wallet: walletSnapshot(),
  });
});

app.use("/api", (req, res) => {
  res.status(404).json({
    status: "error",
    message: "API route not found",
  });
});

if (SERVE_FRONTEND && fs.existsSync(FRONTEND_DIST_DIR)) {
  app.use(express.static(FRONTEND_DIST_DIR));

  app.get("*", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST_DIR, "index.html"));
  });
} else if (SERVE_FRONTEND) {
  console.log(`Frontend build not found at ${FRONTEND_DIST_DIR}. API-only mode is active.`);
}

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Tracking up to ${getActiveTickers().length} unique strategy symbols with a ${getTradeIntervalMs() / 60000}-minute paper-trading cycle.`);
  console.log(`Paper wallet data directory: ${process.env.PAPER_TRADING_DATA_DIR || "backend/data or container data directory"}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Closing HTTP server.`);
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
