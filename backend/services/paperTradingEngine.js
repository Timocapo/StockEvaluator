import fs from "fs";
import path from "path";

const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
const DATA_DIR = process.env.PAPER_TRADING_DATA_DIR || DEFAULT_DATA_DIR;
const STATE_FILE = path.join(DATA_DIR, "paperWallets.json");

export const STRATEGY_1_ID = "momentumInputBuys";
export const STRATEGY_2_ID = "initialSplitReentry";

const STATE_VERSION = 5;

export const MAX_TICKERS_PER_STRATEGY = 30;
export const MAX_TOTAL_UNIQUE_TICKERS = 60;

const DEFAULT_SETTINGS = {
  strategy1BuyAmount: 1,
  strategy2StartingValue: 1000,
  strategy1Tickers: [],
  strategy2Tickers: [],
  tradeIntervalMinutes: 5,
  baselineResetAfterMinutes: 15,
  marketHoursOnly: true,
  maxTradeHistory: 1200,
  maxEquityHistory: 1200,
};

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return structuredClone(value);
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}


export function normalizeTickerSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^\$/, "");
}

export function validateTickerSymbol(value) {
  const ticker = normalizeTickerSymbol(value);

  if (!ticker) {
    return { ok: false, ticker, message: "Ticker cannot be blank." };
  }

  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
    return {
      ok: false,
      ticker,
      message: `${ticker} is not a valid ticker format. Use symbols like AAPL, GM, BRK.B, or BF.B.`,
    };
  }

  return { ok: true, ticker };
}

export function sanitizeTickerList(values = [], fallback = [], max = MAX_TICKERS_PER_STRATEGY) {
  const source = Array.isArray(values) && values.length ? values : fallback;
  const output = [];
  const seen = new Set();
  const invalid = [];

  for (const raw of source || []) {
    const value = typeof raw === "object" ? raw?.ticker : raw;
    const ticker = normalizeTickerSymbol(value);

    if (!ticker) continue;

    const validation = validateTickerSymbol(ticker);
    if (!validation.ok) {
      invalid.push(validation.message);
      continue;
    }

    if (seen.has(validation.ticker)) continue;
    seen.add(validation.ticker);
    output.push(validation.ticker);

    if (output.length >= max) break;
  }

  if (!output.length && Array.isArray(fallback) && fallback.length) {
    return sanitizeTickerList(fallback, [], max);
  }

  return output;
}

export function normalizeTickerSlots(values = [], fallback = [], max = MAX_TICKERS_PER_STRATEGY) {
  const fallbackSlots = Array.isArray(fallback) ? fallback : [];
  const source = Array.isArray(values) && values.length ? values : fallbackSlots;
  const slots = Array.from({ length: max }, (_, index) => {
    const raw = source[index];
    const ticker = normalizeTickerSymbol(typeof raw === "object" ? raw?.ticker : raw);
    if (!ticker) return "";
    return validateTickerSymbol(ticker).ok ? ticker : "";
  });

  // If the saved file has an empty slot list from an older/failed initialization,
  // fall back to the default project ticker list.
  if (!slots.some(Boolean) && fallbackSlots.some((value) => normalizeTickerSymbol(value))) {
    return normalizeTickerSlots(fallbackSlots, [], max);
  }

  // Keep stable slot positions, but remove later duplicates from saved state.
  const seen = new Set();
  return slots.map((ticker) => {
    if (!ticker) return "";
    if (seen.has(ticker)) return "";
    seen.add(ticker);
    return ticker;
  });
}

export function validateTickerList(values = [], label = "Strategy") {
  const source = Array.isArray(values) ? values : [];
  const slots = Array.from({ length: MAX_TICKERS_PER_STRATEGY }, (_, index) => {
    const raw = source[index];
    return normalizeTickerSymbol(typeof raw === "object" ? raw?.ticker : raw);
  });
  const seen = new Set();
  const errors = [];
  const tickers = [];

  if (source.length > MAX_TICKERS_PER_STRATEGY) {
    errors.push(`${label} can have at most ${MAX_TICKERS_PER_STRATEGY} ticker slots.`);
  }

  for (let index = 0; index < slots.length; index += 1) {
    const ticker = slots[index];
    if (!ticker) continue;

    const validation = validateTickerSymbol(ticker);
    if (!validation.ok) {
      errors.push(`Slot #${index + 1}: ${validation.message}`);
      slots[index] = "";
      continue;
    }

    if (seen.has(validation.ticker)) {
      errors.push(`${label} has ${validation.ticker} more than once.`);
      continue;
    }

    seen.add(validation.ticker);
    tickers.push(validation.ticker);
    slots[index] = validation.ticker;
  }

  if (!tickers.length) {
    errors.push(`${label} must have at least one ticker.`);
  }

  return { ok: errors.length === 0, slots, tickers, errors };
}

export function getStrategyTickers(strategyId) {
  const settings = tradingState?.settings || {};

  if (strategyId === STRATEGY_1_ID) {
    return sanitizeTickerList(settings.strategy1Tickers, []);
  }

  if (strategyId === STRATEGY_2_ID) {
    return sanitizeTickerList(settings.strategy2Tickers, []);
  }

  return [];
}

export function getAllStrategyTickers() {
  const combined = [
    ...getStrategyTickers(STRATEGY_1_ID),
    ...getStrategyTickers(STRATEGY_2_ID),
  ];

  return sanitizeTickerList(combined, [], MAX_TOTAL_UNIQUE_TICKERS);
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(6));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function defaultStrategy(id, tickers = [], settings = DEFAULT_SETTINGS) {
  if (id === STRATEGY_1_ID) {
    return {
      id: STRATEGY_1_ID,
      name: "Strategy 1: Input Momentum Buys",
      shortName: "$1 Up / Sell Down",
      description:
        "Every 5-minute cycle, add the selected buy amount as new fake input money, buy that amount when a stock rises, and sell the entire stock position when it falls.",
      startingCash: 0,
      inputCash: 0,
      cash: 0,
      reservedCashByTicker: {},
      pendingReplacementBuys: {},
      initializedTickers: [],
      holdings: {},
      tradeHistory: [],
      totalTradeVolume: 0,
      equityHistory: [{ timestamp: nowIso(), value: 0 }],
    };
  }

  const startingCash = toPositiveNumber(settings.strategy2StartingValue, DEFAULT_SETTINGS.strategy2StartingValue);

  return {
    id: STRATEGY_2_ID,
    name: "Strategy 2: Initial Split + Reentry",
    shortName: "$1,000 Split / Rebuy",
    description:
      "Start with one fixed fake bankroll, split it evenly across all tracked stocks, hold on flat/up moves, sell on down moves, and rebuy with that stock's reserved sale cash only after it rises again.",
    startingCash,
    inputCash: startingCash,
    cash: startingCash,
    reservedCashByTicker: {},
    pendingReplacementBuys: {},
    initializedTickers: [],
    holdings: {},
    tradeHistory: [],
    totalTradeVolume: 0,
    equityHistory: [{ timestamp: nowIso(), value: startingCash }],
  };
}

function makeDefaultState(tickers = []) {
  const defaultTickers = sanitizeTickerList(tickers, []);
  const defaultSlots = normalizeTickerSlots(defaultTickers, []);
  const settings = {
    ...clone(DEFAULT_SETTINGS),
    strategy1Tickers: defaultSlots,
    strategy2Tickers: defaultSlots,
  };

  return {
    version: STATE_VERSION,
    settings,
    meta: {
      createdAt: nowIso(),
      lastCycleAt: null,
      nextCycleAt: null,
      cycleCount: 0,
      lastCycleReason: null,
      lastRestartAt: null,
      lastRestartReason: null,
      lastError: null,
      isRunning: false,
      lastMarketStatus: null,
    },
    priceMemory: {},
    strategies: {
      [STRATEGY_1_ID]: defaultStrategy(STRATEGY_1_ID, tickers, settings),
      [STRATEGY_2_ID]: defaultStrategy(STRATEGY_2_ID, tickers, settings),
    },
  };
}

export let tradingState = loadTradingState([]);

export function getTradingSettings() {
  return tradingState.settings;
}

export function getTradeIntervalMs() {
  const minutes = toPositiveNumber(
    tradingState.settings?.tradeIntervalMinutes,
    DEFAULT_SETTINGS.tradeIntervalMinutes
  );
  return minutes * 60 * 1000;
}

export function loadTradingState(tickers = []) {
  try {
    ensureDataDir();

    if (!fs.existsSync(STATE_FILE)) {
      const freshState = makeDefaultState(tickers);
      fs.writeFileSync(STATE_FILE, JSON.stringify(freshState, null, 2));
      return freshState;
    }

    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeState(parsed, tickers);
  } catch (error) {
    console.error("Failed to load paper trading state:", error.message);
    return makeDefaultState(tickers);
  }
}

export function initializeTradingState(tickers = []) {
  tradingState = normalizeState(loadTradingState(tickers), tickers);
  saveTradingState();
  return tradingState;
}


export function updateTradingMarketStatus(marketStatus) {
  tradingState.meta.lastMarketStatus = marketStatus || null;
  saveTradingState();
  return tradingState;
}

export function saveTradingState() {
  try {
    ensureDataDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(tradingState, null, 2));
  } catch (error) {
    console.error("Failed to save paper trading state:", error.message);
  }
}

function migrateLegacyStateIfNeeded(state, tickers) {
  const previousVersion = Number(state?.version || 1);

  if (previousVersion >= STATE_VERSION) {
    return state;
  }

  if (previousVersion === 3 || previousVersion === 4) {
    state.version = STATE_VERSION;
    state.settings = {
      ...clone(DEFAULT_SETTINGS),
      ...(state.settings || {}),
      marketHoursOnly: state.settings?.marketHoursOnly !== false,
    };
    state.meta = {
      ...(state.meta || {}),
      migratedFromVersion: previousVersion,
      migratedAt: nowIso(),
      lastRestartReason: state.meta?.lastRestartReason || "Migrated to v5 with editable per-strategy ticker lists.",
    };
    return state;
  }

  const migrated = makeDefaultState(tickers);

  migrated.settings = {
    ...migrated.settings,
    ...(state.settings || {}),
    strategy1BuyAmount: 1,
    strategy2StartingValue: 1000,
  };

  migrated.meta = {
    ...migrated.meta,
    migratedFromVersion: previousVersion,
    migratedAt: nowIso(),
    lastRestartAt: nowIso(),
    lastRestartReason:
      "Migrated to the v3 accounting model with separate input money, market gain, and even Strategy 2 split allocation.",
  };

  // The old v2 wallet used preloaded cash for Strategy 1 and a per-stock Strategy 2 amount.
  // Resetting strategies during migration keeps the new input-vs-market-gain math honest.
  migrated.priceMemory = {};
  migrated.strategies = {
    [STRATEGY_1_ID]: defaultStrategy(STRATEGY_1_ID, tickers, migrated.settings),
    [STRATEGY_2_ID]: defaultStrategy(STRATEGY_2_ID, tickers, migrated.settings),
  };

  return migrated;
}

function normalizeState(input, tickers = []) {
  let state = input && typeof input === "object" ? input : makeDefaultState(tickers);
  state = migrateLegacyStateIfNeeded(state, tickers);

  state.version = STATE_VERSION;
  state.settings = {
    ...clone(DEFAULT_SETTINGS),
    ...(state.settings || {}),
  };

  state.settings.strategy1BuyAmount = Math.min(
    10000,
    toPositiveNumber(state.settings.strategy1BuyAmount, DEFAULT_SETTINGS.strategy1BuyAmount)
  );
  state.settings.strategy2StartingValue = Math.min(
    1000000,
    toPositiveNumber(
      state.settings.strategy2StartingValue ?? state.settings.strategy2StartingCash,
      DEFAULT_SETTINGS.strategy2StartingValue
    )
  );
  state.settings.strategy1Tickers = normalizeTickerSlots(state.settings.strategy1Tickers, tickers);
  state.settings.strategy2Tickers = normalizeTickerSlots(state.settings.strategy2Tickers, tickers);
  state.settings.tradeIntervalMinutes = toPositiveNumber(
    state.settings.tradeIntervalMinutes,
    DEFAULT_SETTINGS.tradeIntervalMinutes
  );
  state.settings.baselineResetAfterMinutes = Math.min(
    1440,
    toPositiveNumber(state.settings.baselineResetAfterMinutes, DEFAULT_SETTINGS.baselineResetAfterMinutes)
  );
  state.settings.marketHoursOnly = state.settings.marketHoursOnly !== false;

  delete state.settings.strategy2InitialAllocation;
  delete state.settings.strategy2StartingCash;
  delete state.settings.strategy1StartingCash;

  state.meta = {
    createdAt: nowIso(),
    lastCycleAt: null,
    nextCycleAt: null,
    cycleCount: 0,
    lastCycleReason: null,
    lastRestartAt: null,
    lastRestartReason: null,
    lastError: null,
    isRunning: false,
    lastMarketStatus: null,
    ...(state.meta || {}),
  };

  state.priceMemory = state.priceMemory || {};
  state.strategies = state.strategies || {};
  state.strategies[STRATEGY_1_ID] = normalizeStrategy(
    state.strategies[STRATEGY_1_ID],
    STRATEGY_1_ID,
    tickers,
    state.settings
  );
  state.strategies[STRATEGY_2_ID] = normalizeStrategy(
    state.strategies[STRATEGY_2_ID],
    STRATEGY_2_ID,
    tickers,
    state.settings
  );

  // Remove renamed legacy strategy keys if they are still present in a saved JSON file.
  delete state.strategies.momentumMicroBuys;
  delete state.strategies.initialHoldReentry;

  return state;
}

function normalizeStrategy(strategy, id, tickers, settings) {
  const fresh = defaultStrategy(id, tickers, settings);
  const normalized = strategy && typeof strategy === "object" ? { ...fresh, ...strategy } : fresh;

  normalized.reservedCashByTicker = normalized.reservedCashByTicker || {};
  normalized.pendingReplacementBuys = normalized.pendingReplacementBuys || {};
  normalized.initializedTickers = Array.isArray(normalized.initializedTickers)
    ? normalized.initializedTickers
    : [];
  normalized.holdings = normalized.holdings || {};
  normalized.tradeHistory = Array.isArray(normalized.tradeHistory) ? normalized.tradeHistory : [];
  normalized.equityHistory = Array.isArray(normalized.equityHistory)
    ? normalized.equityHistory
    : fresh.equityHistory;
  normalized.totalTradeVolume = Number.isFinite(Number(normalized.totalTradeVolume))
    ? Number(normalized.totalTradeVolume)
    : normalized.tradeHistory.reduce((sum, trade) => sum + Number(trade.amount || 0), 0);

  if (id === STRATEGY_1_ID) {
    normalized.startingCash = 0;
    normalized.inputCash = Number.isFinite(Number(normalized.inputCash))
      ? Number(normalized.inputCash)
      : normalized.tradeHistory
          .filter((trade) => trade.type === "BUY")
          .reduce((sum, trade) => sum + Number(trade.amount || 0), 0);
  }

  if (id === STRATEGY_2_ID) {
    const configuredStart = toPositiveNumber(settings.strategy2StartingValue, DEFAULT_SETTINGS.strategy2StartingValue);
    normalized.startingCash = toPositiveNumber(normalized.startingCash, configuredStart);
    normalized.inputCash = normalized.startingCash;
  }

  for (const [ticker, holding] of Object.entries(normalized.holdings)) {
    const shares = Number(holding?.shares || 0);
    if (!Number.isFinite(shares) || shares <= 0) {
      delete normalized.holdings[ticker];
      continue;
    }

    normalized.holdings[ticker] = {
      shares,
      avgCost: Number(holding.avgCost || 0),
      invested: Number(holding.invested || shares * Number(holding.avgCost || 0)),
      lastTradeAt: holding.lastTradeAt || null,
    };
  }

  return normalized;
}

export function resetTradingState(tickers = []) {
  tradingState = makeDefaultState(tickers);
  saveTradingState();
  return tradingState;
}

function validateIncomingTickerLists(input = {}, currentSettings = tradingState.settings) {
  const result = {
    strategy1Tickers: currentSettings.strategy1Tickers,
    strategy2Tickers: currentSettings.strategy2Tickers,
    errors: [],
    touched: false,
  };

  if (Object.prototype.hasOwnProperty.call(input, "strategy1Tickers")) {
    result.touched = true;
    const validation = validateTickerList(input.strategy1Tickers, "Strategy 1");
    if (!validation.ok) result.errors.push(...validation.errors);
    result.strategy1Tickers = validation.slots;
  }

  if (Object.prototype.hasOwnProperty.call(input, "strategy2Tickers")) {
    result.touched = true;
    const validation = validateTickerList(input.strategy2Tickers, "Strategy 2");
    if (!validation.ok) result.errors.push(...validation.errors);
    result.strategy2Tickers = validation.slots;
  }

  const unique = sanitizeTickerList([...result.strategy1Tickers, ...result.strategy2Tickers], [], MAX_TOTAL_UNIQUE_TICKERS);
  if (unique.length > MAX_TOTAL_UNIQUE_TICKERS) {
    result.errors.push(`Strategy 1 and Strategy 2 can track at most ${MAX_TOTAL_UNIQUE_TICKERS} unique tickers combined.`);
  }

  return result;
}

export function updateTradingSettings(input = {}, { applyTickerLists = false } = {}) {
  const settings = tradingState.settings;

  settings.strategy1BuyAmount = Math.min(
    10000,
    toPositiveNumber(input.strategy1BuyAmount, settings.strategy1BuyAmount)
  );
  settings.strategy2StartingValue = Math.min(
    1000000,
    toPositiveNumber(input.strategy2StartingValue, settings.strategy2StartingValue)
  );
  settings.baselineResetAfterMinutes = Math.min(
    1440,
    toPositiveNumber(input.baselineResetAfterMinutes, settings.baselineResetAfterMinutes)
  );

  if (applyTickerLists) {
    const tickerValidation = validateIncomingTickerLists(input, settings);
    if (tickerValidation.errors.length) {
      throw new Error(tickerValidation.errors.join(" "));
    }

    if (tickerValidation.touched) {
      settings.strategy1Tickers = tickerValidation.strategy1Tickers;
      settings.strategy2Tickers = tickerValidation.strategy2Tickers;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "marketHoursOnly")) {
    settings.marketHoursOnly = input.marketHoursOnly !== false;
  }

  saveTradingState();
  return tradingState;
}

export function restartStrategies({ strategyIds = [], tickers = [], settingsInput = {}, resetBaselines = false } = {}) {
  updateTradingSettings(settingsInput, { applyTickerLists: true });

  const selected = new Set(strategyIds.length ? strategyIds : [STRATEGY_1_ID, STRATEGY_2_ID]);
  const restarted = [];

  if (selected.has(STRATEGY_1_ID)) {
    tradingState.strategies[STRATEGY_1_ID] = defaultStrategy(STRATEGY_1_ID, tickers, tradingState.settings);
    restarted.push(STRATEGY_1_ID);
  }

  if (selected.has(STRATEGY_2_ID)) {
    tradingState.strategies[STRATEGY_2_ID] = defaultStrategy(STRATEGY_2_ID, tickers, tradingState.settings);
    restarted.push(STRATEGY_2_ID);
  }

  if (resetBaselines || restarted.length === 2) {
    tradingState.priceMemory = {};
  }

  tradingState.meta.lastRestartAt = nowIso();
  tradingState.meta.lastRestartReason = `Restarted ${restarted.join(", ") || "no strategies"}.`;
  tradingState.meta.lastError = null;

  saveTradingState();
  return { state: tradingState, restarted };
}

function getReservedCash(strategy) {
  return Object.values(strategy.reservedCashByTicker || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );
}

function getHoldingValue(strategy, livePrices = {}) {
  return Object.entries(strategy.holdings || {}).reduce((sum, [ticker, holding]) => {
    const currentPrice = Number(
      livePrices[ticker]?.price ??
      livePrices[ticker] ??
      tradingState.priceMemory?.[ticker]?.currentPrice ??
      holding.avgCost ??
      0
    );
    return sum + holding.shares * currentPrice;
  }, 0);
}

function getTotalValue(strategy, livePrices = {}) {
  return strategy.cash + getReservedCash(strategy) + getHoldingValue(strategy, livePrices);
}

function getPerformanceBase(strategy) {
  if (strategy.id === STRATEGY_1_ID) {
    return Number(strategy.inputCash || 0);
  }

  return Number(strategy.startingCash || strategy.inputCash || 0);
}

function getGainPercent(marketGain, performanceBase) {
  return performanceBase > 0 ? (marketGain / performanceBase) * 100 : 0;
}

function appendEquity(strategy, livePrices, timestamp) {
  strategy.equityHistory.push({
    timestamp,
    value: roundMoney(getTotalValue(strategy, livePrices)),
  });

  const max = tradingState.settings.maxEquityHistory || DEFAULT_SETTINGS.maxEquityHistory;
  if (strategy.equityHistory.length > max) {
    strategy.equityHistory = strategy.equityHistory.slice(-max);
  }
}

function recordTrade(strategy, trade) {
  const recordedTrade = {
    ...trade,
    strategyId: strategy.id,
    strategyName: strategy.name,
  };

  strategy.tradeHistory.unshift(recordedTrade);
  strategy.totalTradeVolume = roundMoney(Number(strategy.totalTradeVolume || 0) + Number(trade.amount || 0));

  const max = tradingState.settings.maxTradeHistory || DEFAULT_SETTINGS.maxTradeHistory;
  if (strategy.tradeHistory.length > max) {
    strategy.tradeHistory = strategy.tradeHistory.slice(0, max);
  }

  return recordedTrade;
}

function addInputCash(strategy, amount) {
  const input = Number(amount || 0);
  if (!Number.isFinite(input) || input <= 0) return 0;

  strategy.inputCash = roundMoney(Number(strategy.inputCash || 0) + input);
  strategy.cash = roundMoney(Number(strategy.cash || 0) + input);
  return input;
}

function buyWithCash({ strategy, ticker, price, amount, timestamp, reason, priceMove }) {
  const spend = Math.min(Number(amount || 0), Number(strategy.cash || 0));
  if (!Number.isFinite(spend) || spend <= 0 || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const shares = spend / price;
  const current = strategy.holdings[ticker];
  const oldShares = Number(current?.shares || 0);
  const oldInvested = Number(current?.invested || oldShares * Number(current?.avgCost || 0));
  const newShares = oldShares + shares;
  const newInvested = oldInvested + spend;

  strategy.holdings[ticker] = {
    shares: newShares,
    avgCost: newInvested / newShares,
    invested: newInvested,
    lastTradeAt: timestamp,
  };

  strategy.cash = roundMoney(strategy.cash - spend);

  const trade = {
    type: "BUY",
    ticker,
    shares,
    price,
    amount: spend,
    timestamp,
    reason,
    priceMove,
  };

  return recordTrade(strategy, trade);
}

function buyWithNewInputCash({ strategy, ticker, price, amount, timestamp, reason, priceMove }) {
  const input = addInputCash(strategy, amount);
  if (input <= 0) return null;

  return buyWithCash({
    strategy,
    ticker,
    price,
    amount: input,
    timestamp,
    reason,
    priceMove,
  });
}

function buyWithReservedCash({ strategy, ticker, price, timestamp, reason, priceMove }) {
  const reserve = Number(strategy.reservedCashByTicker?.[ticker] || 0);
  if (!Number.isFinite(reserve) || reserve <= 0 || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const shares = reserve / price;
  const current = strategy.holdings[ticker];
  const oldShares = Number(current?.shares || 0);
  const oldInvested = Number(current?.invested || oldShares * Number(current?.avgCost || 0));
  const newShares = oldShares + shares;
  const newInvested = oldInvested + reserve;

  strategy.holdings[ticker] = {
    shares: newShares,
    avgCost: newInvested / newShares,
    invested: newInvested,
    lastTradeAt: timestamp,
  };

  strategy.reservedCashByTicker[ticker] = 0;

  const trade = {
    type: "BUY",
    ticker,
    shares,
    price,
    amount: reserve,
    timestamp,
    reason,
    priceMove,
  };

  return recordTrade(strategy, trade);
}

function sellAll({ strategy, ticker, price, timestamp, reason, priceMove, reserveProceeds = false }) {
  const holding = strategy.holdings[ticker];
  const shares = Number(holding?.shares || 0);

  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const amount = shares * price;
  const realizedGain = amount - Number(holding.invested || shares * holding.avgCost || 0);
  const realizedGainPercent =
    Number(holding.invested || 0) > 0 ? (realizedGain / Number(holding.invested)) * 100 : 0;

  delete strategy.holdings[ticker];

  if (reserveProceeds) {
    strategy.reservedCashByTicker[ticker] = roundMoney(
      Number(strategy.reservedCashByTicker[ticker] || 0) + amount
    );
  } else {
    strategy.cash = roundMoney(strategy.cash + amount);
  }

  const trade = {
    type: "SELL",
    ticker,
    shares,
    price,
    amount,
    realizedGain,
    realizedGainPercent,
    timestamp,
    reason,
    priceMove,
  };

  return recordTrade(strategy, trade);
}


function getKnownPrice(ticker, livePrices = {}) {
  const fromLive = Number(livePrices?.[ticker]?.price ?? livePrices?.[ticker] ?? 0);
  if (Number.isFinite(fromLive) && fromLive > 0) return fromLive;

  const fromMemory = Number(tradingState.priceMemory?.[ticker]?.currentPrice || 0);
  if (Number.isFinite(fromMemory) && fromMemory > 0) return fromMemory;

  return 0;
}

function addInitializedTicker(strategy, ticker) {
  if (!strategy.initializedTickers.includes(ticker)) {
    strategy.initializedTickers.push(ticker);
  }
}

function replaceInitializedTicker(strategy, oldTicker, newTicker) {
  const wasInitialized = strategy.initializedTickers.includes(oldTicker);
  strategy.initializedTickers = strategy.initializedTickers.filter((ticker) => ticker !== oldTicker);

  if (wasInitialized || strategy.holdings[newTicker]) {
    addInitializedTicker(strategy, newTicker);
  }
}

function recordTransfer(strategy, transfer) {
  return recordTrade(strategy, {
    type: "TRANSFER",
    shares: 0,
    price: 0,
    ...transfer,
  });
}

function sellForTickerReplacement({ strategy, oldTicker, newTicker, price, timestamp }) {
  const holding = strategy.holdings[oldTicker];
  const shares = Number(holding?.shares || 0);

  if (!Number.isFinite(shares) || shares <= 0) {
    return { amount: 0, trade: null };
  }

  const effectivePrice = Number(price || holding.avgCost || 0);
  if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) {
    return { amount: 0, trade: null };
  }

  const amount = shares * effectivePrice;
  const invested = Number(holding.invested || shares * holding.avgCost || 0);
  const realizedGain = amount - invested;
  const realizedGainPercent = invested > 0 ? (realizedGain / invested) * 100 : 0;

  delete strategy.holdings[oldTicker];

  const trade = recordTrade(strategy, {
    type: "SELL",
    ticker: oldTicker,
    shares,
    price: effectivePrice,
    amount,
    realizedGain,
    realizedGainPercent,
    timestamp,
    reason: `Ticker replacement: sold ${oldTicker} so its value can be moved into ${newTicker}`,
    priceMove: `Replacement slot changed from ${oldTicker} to ${newTicker}`,
  });

  return { amount, trade };
}

function queueReplacementBuy({ strategy, ticker, amount, timestamp, reason }) {
  const reserveAmount = Number(amount || 0);
  if (!Number.isFinite(reserveAmount) || reserveAmount <= 0) return null;

  strategy.reservedCashByTicker[ticker] = roundMoney(
    Number(strategy.reservedCashByTicker?.[ticker] || 0) + reserveAmount
  );
  strategy.pendingReplacementBuys[ticker] = roundMoney(
    Number(strategy.pendingReplacementBuys?.[ticker] || 0) + reserveAmount
  );

  return recordTransfer(strategy, {
    ticker,
    amount: reserveAmount,
    timestamp,
    reason,
    priceMove: "Queued as a pending replacement buy because no usable current price was available yet.",
  });
}

function buyPendingReplacement({ strategy, ticker, price, timestamp, actions, reasonPrefix = "Ticker replacement" }) {
  const pending = Number(strategy.pendingReplacementBuys?.[ticker] || 0);
  const reserved = Number(strategy.reservedCashByTicker?.[ticker] || 0);
  const amount = Math.min(pending || reserved, reserved);

  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  // Keep only this pending amount available for the reserved-cash buy.
  strategy.reservedCashByTicker[ticker] = amount;

  const trade = buyWithReservedCash({
    strategy,
    ticker,
    price,
    timestamp,
    reason: `${reasonPrefix}: bought ${ticker} with the value carried from the replaced ticker`,
    priceMove: "Replacement buy using transferred simulated value",
  });

  if (trade) {
    strategy.pendingReplacementBuys[ticker] = 0;
    if (actions) actions.push(trade);
    addInitializedTicker(strategy, ticker);
  }

  return trade;
}

function applyTickerReplacementsForStrategy({ strategyId, nextTickers, livePrices = {}, timestamp = nowIso() }) {
  const strategy = tradingState.strategies[strategyId];
  const settingsKey = strategyId === STRATEGY_1_ID ? "strategy1Tickers" : "strategy2Tickers";
  const oldTickers = normalizeTickerSlots(tradingState.settings[settingsKey], []);
  const nextSlots = normalizeTickerSlots(nextTickers, []);
  const changes = [];

  for (let index = 0; index < MAX_TICKERS_PER_STRATEGY; index += 1) {
    const oldTicker = oldTickers[index] || null;
    const newTicker = nextSlots[index] || null;

    if (oldTicker === newTicker) continue;

    if (oldTicker && newTicker) {
      const oldHolding = strategy.holdings[oldTicker];
      const oldPrice = getKnownPrice(oldTicker, livePrices) || Number(oldHolding?.avgCost || 0);
      const { amount: soldAmount } = sellForTickerReplacement({
        strategy,
        oldTicker,
        newTicker,
        price: oldPrice,
        timestamp,
      });

      const reservedAmount = Number(strategy.reservedCashByTicker?.[oldTicker] || 0);
      const pendingAmount = Number(strategy.pendingReplacementBuys?.[oldTicker] || 0);
      const transferFromReserve = reservedAmount > 0 ? reservedAmount : pendingAmount;
      const transferAmount = roundMoney(Number(soldAmount || 0) + Number(transferFromReserve || 0));

      if (transferFromReserve > 0) {
        strategy.reservedCashByTicker[oldTicker] = 0;
        strategy.pendingReplacementBuys[oldTicker] = 0;
      }

      if (transferAmount > 0) {
        const newPrice = getKnownPrice(newTicker, livePrices);

        if (newPrice > 0) {
          strategy.reservedCashByTicker[newTicker] = roundMoney(
            Number(strategy.reservedCashByTicker?.[newTicker] || 0) + transferAmount
          );
          strategy.pendingReplacementBuys[newTicker] = roundMoney(
            Number(strategy.pendingReplacementBuys?.[newTicker] || 0) + transferAmount
          );
          buyPendingReplacement({
            strategy,
            ticker: newTicker,
            price: newPrice,
            timestamp,
            actions: null,
            reasonPrefix: `Ticker replacement from ${oldTicker}`,
          });
        } else {
          queueReplacementBuy({
            strategy,
            ticker: newTicker,
            amount: transferAmount,
            timestamp,
            reason: `Ticker replacement from ${oldTicker}: saved transferred value for ${newTicker}`,
          });
        }
      }

      delete strategy.holdings[oldTicker];
      delete strategy.reservedCashByTicker[oldTicker];
      delete strategy.pendingReplacementBuys[oldTicker];
      replaceInitializedTicker(strategy, oldTicker, newTicker);

      changes.push({ strategyId, index, oldTicker, newTicker, transferredAmount: transferAmount });
      continue;
    }

    if (oldTicker && !newTicker) {
      // The user intentionally removed a ticker slot. Sell the held position to normal cash/reserve behavior.
      const oldHolding = strategy.holdings[oldTicker];
      const oldPrice = getKnownPrice(oldTicker, livePrices) || Number(oldHolding?.avgCost || 0);

      if (oldPrice > 0) {
        sellAll({
          strategy,
          ticker: oldTicker,
          price: oldPrice,
          timestamp,
          reason: "Ticker removed from this strategy list; sold the position during stock-list save",
          priceMove: `Removed ${oldTicker} from strategy list`,
          reserveProceeds: false,
        });
      }

      delete strategy.holdings[oldTicker];
      delete strategy.reservedCashByTicker[oldTicker];
      delete strategy.pendingReplacementBuys[oldTicker];
      strategy.initializedTickers = strategy.initializedTickers.filter((ticker) => ticker !== oldTicker);
      changes.push({ strategyId, index, oldTicker, newTicker: null, transferredAmount: 0 });
      continue;
    }

    if (!oldTicker && newTicker) {
      changes.push({ strategyId, index, oldTicker: null, newTicker, transferredAmount: 0 });
    }
  }

  tradingState.settings[settingsKey] = nextSlots;
  return changes;
}

export function updateTradingSettingsAndTickerLists(input = {}, { livePrices = {} } = {}) {
  updateTradingSettings(input, { applyTickerLists: false });

  const validation = validateIncomingTickerLists(input, tradingState.settings);
  if (validation.errors.length) {
    throw new Error(validation.errors.join(" "));
  }

  const timestamp = nowIso();
  const changes = [];

  if (Object.prototype.hasOwnProperty.call(input, "strategy1Tickers")) {
    changes.push(
      ...applyTickerReplacementsForStrategy({
        strategyId: STRATEGY_1_ID,
        nextTickers: validation.strategy1Tickers,
        livePrices,
        timestamp,
      })
    );
  }

  if (Object.prototype.hasOwnProperty.call(input, "strategy2Tickers")) {
    changes.push(
      ...applyTickerReplacementsForStrategy({
        strategyId: STRATEGY_2_ID,
        nextTickers: validation.strategy2Tickers,
        livePrices,
        timestamp,
      })
    );
  }

  tradingState.meta.lastRestartAt = tradingState.meta.lastRestartAt || null;
  tradingState.meta.lastRestartReason = changes.length
    ? `Saved ticker-list changes without restarting: ${changes.length} slot change(s).`
    : tradingState.meta.lastRestartReason;
  tradingState.meta.lastError = null;

  saveTradingState();
  return { state: tradingState, changes };
}

function priceMoveText(direction, previousPrice, currentPrice) {
  if (!Number.isFinite(previousPrice)) return "No prior 5-minute baseline";
  const amount = currentPrice - previousPrice;
  const pct = previousPrice > 0 ? (amount / previousPrice) * 100 : 0;
  return `${direction.toUpperCase()}: ${previousPrice.toFixed(4)} -> ${currentPrice.toFixed(4)} (${pct.toFixed(3)}%)`;
}

function normalizeQuote(ticker, quote) {
  const price = Number(quote?.price ?? quote?.c ?? quote?.currentPrice ?? 0);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const quoteTimestampSeconds = Number(quote?.timestamp ?? quote?.t ?? 0);
  const quoteTimestamp = quoteTimestampSeconds > 0
    ? new Date(quoteTimestampSeconds * 1000).toISOString()
    : nowIso();

  return {
    ticker,
    price,
    change: Number(quote?.change ?? quote?.d ?? 0),
    percentChange: Number(quote?.percentChange ?? quote?.dp ?? 0),
    high: Number(quote?.high ?? quote?.h ?? 0),
    low: Number(quote?.low ?? quote?.l ?? 0),
    open: Number(quote?.open ?? quote?.o ?? 0),
    previousClose: Number(quote?.previousClose ?? quote?.pc ?? 0),
    timestamp: quoteTimestamp,
    fetchedAt: quote?.fetchedAt || nowIso(),
  };
}

function ensureTickerMemory(ticker) {
  if (!tradingState.priceMemory[ticker]) {
    tradingState.priceMemory[ticker] = {
      ticker,
      previousPrice: null,
      currentPrice: null,
      direction: "waiting",
      checkedAt: null,
      quoteTimestamp: null,
      cyclesSeen: 0,
      note: "Waiting for first quote.",
    };
  }

  return tradingState.priceMemory[ticker];
}

function getStrategy2PerTickerAllocation(tickerCount) {
  const count = Math.max(1, Number(tickerCount || 0));
  return tradingState.settings.strategy2StartingValue / count;
}

function ensureStrategy2InitialBuy(ticker, price, timestamp, actions, tickerCount) {
  const strategy = tradingState.strategies[STRATEGY_2_ID];

  if (!getStrategyTickers(STRATEGY_2_ID).includes(ticker)) {
    return;
  }

  if (strategy.initializedTickers.includes(ticker)) {
    return;
  }

  const targetAmount = getStrategy2PerTickerAllocation(tickerCount);
  const amount = Math.min(targetAmount, strategy.cash);

  if (amount > 0) {
    const trade = buyWithCash({
      strategy,
      ticker,
      price,
      amount,
      timestamp,
      reason: `Initial split buy: $${tradingState.settings.strategy2StartingValue} total spread evenly across ${tickerCount} tracked symbols`,
      priceMove: "Initial buy on first valid quote",
    });

    if (trade) {
      actions.push(trade);
    }
  }

  strategy.initializedTickers.push(ticker);
}

function runStrategy1(ticker, price, direction, timestamp, moveText, actions) {
  const strategy = tradingState.strategies[STRATEGY_1_ID];

  if (!getStrategyTickers(STRATEGY_1_ID).includes(ticker)) {
    return;
  }

  if (buyPendingReplacement({ strategy, ticker, price, timestamp, actions, reasonPrefix: "Pending Strategy 1 ticker replacement" })) {
    return;
  }

  if (direction === "up") {
    const trade = buyWithNewInputCash({
      strategy,
      ticker,
      price,
      amount: tradingState.settings.strategy1BuyAmount,
      timestamp,
      reason: `5-minute price increased; added $${tradingState.settings.strategy1BuyAmount} of new fake input money and bought ${ticker}`,
      priceMove: moveText,
    });

    if (trade) actions.push(trade);
    return;
  }

  if (direction === "down") {
    const trade = sellAll({
      strategy,
      ticker,
      price,
      timestamp,
      reason: "5-minute price decreased; sold entire Strategy 1 position for this stock",
      priceMove: moveText,
    });

    if (trade) actions.push(trade);
  }
}

function runStrategy2(ticker, price, direction, timestamp, moveText, actions) {
  const strategy = tradingState.strategies[STRATEGY_2_ID];

  if (!getStrategyTickers(STRATEGY_2_ID).includes(ticker)) {
    return;
  }

  if (buyPendingReplacement({ strategy, ticker, price, timestamp, actions, reasonPrefix: "Pending Strategy 2 ticker replacement" })) {
    return;
  }

  const shares = Number(strategy.holdings[ticker]?.shares || 0);
  const reserved = Number(strategy.reservedCashByTicker[ticker] || 0);

  if (shares > 0 && direction === "down") {
    const trade = sellAll({
      strategy,
      ticker,
      price,
      timestamp,
      reason: "5-minute price decreased; sold entire position and reserved proceeds for this same stock",
      priceMove: moveText,
      reserveProceeds: true,
    });

    if (trade) actions.push(trade);
    return;
  }

  if (shares <= 0 && reserved > 0 && direction === "up") {
    const trade = buyWithReservedCash({
      strategy,
      ticker,
      price,
      timestamp,
      reason: "Stock rose after being sold; bought back using its reserved sale cash",
      priceMove: moveText,
    });

    if (trade) actions.push(trade);
  }
}

export async function runTradingCycle({ tickers = [], getQuote, reason = "manual", force = false } = {}) {
  if (tradingState.meta.isRunning) {
    return {
      status: "busy",
      message: "A trading cycle is already running.",
      state: tradingState,
      actions: [],
    };
  }

  const timestamp = nowIso();
  const actions = [];
  const skipped = [];
  const livePrices = {};
  const strategy2TickerCount = getStrategyTickers(STRATEGY_2_ID).length || 1;

  tradingState.meta.isRunning = true;
  tradingState.meta.lastError = null;
  saveTradingState();

  try {
    for (const ticker of tickers) {
      const memory = ensureTickerMemory(ticker);

      let quote;
      try {
        quote = normalizeQuote(ticker, await getQuote(ticker));
      } catch (error) {
        memory.note = `Quote failed: ${error.message}`;
        skipped.push({ ticker, reason: memory.note });
        continue;
      }

      if (!quote) {
        memory.note = "Quote missing or invalid.";
        skipped.push({ ticker, reason: memory.note });
        continue;
      }

      livePrices[ticker] = quote;
      const currentPrice = quote.price;
      const previousPrice = Number(memory.currentPrice);
      const lastCheckedAt = memory.checkedAt ? new Date(memory.checkedAt).getTime() : 0;
      const minutesSinceBaseline = lastCheckedAt ? (Date.now() - lastCheckedAt) / 60000 : Infinity;
      const shouldResetBaseline =
        !Number.isFinite(previousPrice) ||
        previousPrice <= 0 ||
        (!force && minutesSinceBaseline > tradingState.settings.baselineResetAfterMinutes);

      ensureStrategy2InitialBuy(ticker, currentPrice, timestamp, actions, strategy2TickerCount);

      if (shouldResetBaseline) {
        memory.previousPrice = null;
        memory.currentPrice = currentPrice;
        memory.direction = "baseline";
        memory.checkedAt = timestamp;
        memory.quoteTimestamp = quote.timestamp;
        memory.dailyChangeAmount = Number(quote.change || 0);
        memory.dailyChangePercent = Number(quote.percentChange || 0);
        memory.open = Number(quote.open || 0);
        memory.high = Number(quote.high || 0);
        memory.low = Number(quote.low || 0);
        memory.previousClose = Number(quote.previousClose || 0);
        memory.quoteFetchedAt = quote.fetchedAt || timestamp;
        memory.cyclesSeen = Number(memory.cyclesSeen || 0) + 1;
        memory.note = minutesSinceBaseline === Infinity
          ? "First valid quote saved as baseline. Strategy 1 waits for next 5-minute comparison."
          : `Baseline reset after ${minutesSinceBaseline.toFixed(1)} minutes without a cycle.`;
        continue;
      }

      let direction = "flat";
      if (currentPrice > previousPrice) direction = "up";
      if (currentPrice < previousPrice) direction = "down";

      const moveText = priceMoveText(direction, previousPrice, currentPrice);

      runStrategy1(ticker, currentPrice, direction, timestamp, moveText, actions);
      runStrategy2(ticker, currentPrice, direction, timestamp, moveText, actions);

      memory.previousPrice = previousPrice;
      memory.currentPrice = currentPrice;
      memory.direction = direction;
      memory.checkedAt = timestamp;
      memory.quoteTimestamp = quote.timestamp;
      memory.dailyChangeAmount = Number(quote.change || 0);
      memory.dailyChangePercent = Number(quote.percentChange || 0);
      memory.open = Number(quote.open || 0);
      memory.high = Number(quote.high || 0);
      memory.low = Number(quote.low || 0);
      memory.previousClose = Number(quote.previousClose || 0);
      memory.quoteFetchedAt = quote.fetchedAt || timestamp;
      memory.cyclesSeen = Number(memory.cyclesSeen || 0) + 1;
      memory.note = moveText;
    }

    for (const strategy of Object.values(tradingState.strategies)) {
      appendEquity(strategy, livePrices, timestamp);
    }

    tradingState.meta.lastCycleAt = timestamp;
    tradingState.meta.nextCycleAt = new Date(Date.now() + getTradeIntervalMs()).toISOString();
    tradingState.meta.cycleCount = Number(tradingState.meta.cycleCount || 0) + 1;
    tradingState.meta.lastCycleReason = reason;
    tradingState.meta.isRunning = false;
    saveTradingState();

    return {
      status: "ok",
      message: `Trading cycle completed with ${actions.length} trades.`,
      actions,
      skipped,
      state: tradingState,
    };
  } catch (error) {
    tradingState.meta.lastError = error.message;
    tradingState.meta.isRunning = false;
    saveTradingState();

    return {
      status: "error",
      message: error.message,
      actions,
      skipped,
      state: tradingState,
    };
  }
}

export function buildWalletSnapshot({ tickers = [], stockMeta = [], livePrices = {}, marketStatus = null } = {}) {
  const activeTickers = sanitizeTickerList(tickers.length ? tickers : getAllStrategyTickers(), [], MAX_TOTAL_UNIQUE_TICKERS);
  const prices = {};
  const quoteDetails = {};

  for (const ticker of activeTickers) {
    const cached = livePrices[ticker];
    const memory = tradingState.priceMemory[ticker] || {};
    const price = Number(cached?.price ?? cached ?? memory.currentPrice ?? 0);
    prices[ticker] = price;
    quoteDetails[ticker] = {
      price,
      dailyChangeAmount: Number(cached?.change ?? memory.dailyChangeAmount ?? 0),
      dailyChangePercent: Number(cached?.percentChange ?? memory.dailyChangePercent ?? 0),
      open: Number(cached?.open ?? memory.open ?? 0),
      high: Number(cached?.high ?? memory.high ?? 0),
      low: Number(cached?.low ?? memory.low ?? 0),
      previousClose: Number(cached?.previousClose ?? memory.previousClose ?? 0),
      quoteFetchedAt: cached?.fetchedAt || memory.quoteFetchedAt || null,
    };
  }

  const strategies = Object.values(tradingState.strategies).map((strategy) => {
    const strategyTickers = getStrategyTickers(strategy.id);
    const strategyStockMeta = strategyTickers.map((ticker) => {
      const meta = stockMeta.find((stock) => stock.ticker === ticker) || {};
      return {
        ticker,
        name: meta.name || ticker,
        sector: meta.sector || "Custom",
        enabled: true,
      };
    });

    const holdings = Object.entries(strategy.holdings || {}).map(([ticker, holding]) => {
      const currentPrice = Number(prices[ticker] || tradingState.priceMemory[ticker]?.currentPrice || holding.avgCost || 0);
      const currentValue = holding.shares * currentPrice;
      const gainPercent = holding.avgCost > 0 ? ((currentPrice - holding.avgCost) / holding.avgCost) * 100 : 0;
      const gainAmount = currentValue - Number(holding.invested || holding.shares * holding.avgCost || 0);
      const meta = stockMeta.find((stock) => stock.ticker === ticker) || {};
      const quote = quoteDetails[ticker] || {};

      return {
        ticker,
        name: meta.name || ticker,
        sector: meta.sector || "Unknown",
        shares: holding.shares,
        avgCost: holding.avgCost,
        currentPrice,
        dailyChangeAmount: quote.dailyChangeAmount || 0,
        dailyChangePercent: quote.dailyChangePercent || 0,
        currentValue,
        invested: holding.invested || holding.shares * holding.avgCost,
        gainAmount,
        gainPercent,
      };
    });

    const reservedCash = getReservedCash(strategy);
    const holdingsValue = getHoldingValue(strategy, prices);
    const totalValue = strategy.cash + reservedCash + holdingsValue;
    const performanceBase = getPerformanceBase(strategy);
    const marketGain = totalValue - performanceBase;
    const totalGainPercent = getGainPercent(marketGain, performanceBase);
    const perStockStartAmount =
      strategy.id === STRATEGY_2_ID ? Number(strategy.startingCash || 0) / Math.max(1, strategyTickers.length || 1) : null;

    return {
      id: strategy.id,
      name: strategy.name,
      shortName:
        strategy.id === STRATEGY_1_ID
          ? `$${tradingState.settings.strategy1BuyAmount} Up / Sell Down`
          : `$${Number(strategy.startingCash || 0)} Split / Rebuy`,
      description: strategy.description,
      startingCash: strategy.startingCash,
      inputCash: strategy.id === STRATEGY_1_ID ? Number(strategy.inputCash || 0) : strategy.startingCash,
      moneyAdded: strategy.id === STRATEGY_1_ID ? Number(strategy.inputCash || 0) : 0,
      cash: strategy.cash,
      reservedCash,
      reservedCashByTicker: strategy.reservedCashByTicker || {},
      pendingReplacementBuys: strategy.pendingReplacementBuys || {},
      trackedTickers: strategyTickers,
      trackedStocks: strategyStockMeta,
      trackedTickerCount: strategyTickers.length,
      holdingsValue,
      totalValue,
      performanceBase,
      marketGain,
      totalGainPercent,
      totalTradeVolume: Number(strategy.totalTradeVolume || 0),
      perStockStartAmount,
      activeHoldings: holdings.length,
      holdings: holdings.sort((a, b) => b.currentValue - a.currentValue),
      tradeHistory: strategy.tradeHistory || [],
      equityHistory: strategy.equityHistory || [],
    };
  });

  const priceSignals = activeTickers.map((ticker) => {
    const meta = stockMeta.find((stock) => stock.ticker === ticker) || {};
    const memory = tradingState.priceMemory[ticker] || {};
    const quote = quoteDetails[ticker] || {};
    const currentPrice = Number(prices[ticker] || memory.currentPrice || 0);
    const previousPrice = Number(memory.previousPrice || 0);
    const baselinePrice = Number(memory.currentPrice || currentPrice || 0);
    const changeAmount = previousPrice > 0 ? currentPrice - previousPrice : 0;
    const changePercent = previousPrice > 0 ? (changeAmount / previousPrice) * 100 : 0;

    return {
      ticker,
      name: meta.name || ticker,
      sector: meta.sector || "Unknown",
      price: currentPrice || baselinePrice,
      previousPrice: previousPrice || null,
      direction: memory.direction || "waiting",
      changeAmount,
      changePercent,
      dailyChangeAmount: quote.dailyChangeAmount || 0,
      dailyChangePercent: quote.dailyChangePercent || 0,
      open: quote.open || 0,
      high: quote.high || 0,
      low: quote.low || 0,
      previousClose: quote.previousClose || 0,
      quoteFetchedAt: quote.quoteFetchedAt || null,
      checkedAt: memory.checkedAt || null,
      quoteTimestamp: memory.quoteTimestamp || null,
      note: memory.note || "Waiting for first cycle.",
    };
  });

  return {
    status: "ok",
    mode: "local-paper-trading",
    disclaimer: "Educational simulator only. No real orders are placed.",
    settings: {
      ...tradingState.settings,
      strategy1Tickers: normalizeTickerSlots(tradingState.settings.strategy1Tickers, []),
      strategy2Tickers: normalizeTickerSlots(tradingState.settings.strategy2Tickers, []),
      strategy1ActiveTickers: getStrategyTickers(STRATEGY_1_ID),
      strategy2ActiveTickers: getStrategyTickers(STRATEGY_2_ID),
    },
    meta: {
      ...tradingState.meta,
      marketStatus: marketStatus || tradingState.meta.lastMarketStatus || null,
    },
    marketStatus: marketStatus || tradingState.meta.lastMarketStatus || null,
    strategies,
    priceSignals,
    trackedStocks: activeTickers.map((ticker) => {
      const meta = stockMeta.find((stock) => stock.ticker === ticker) || {};
      return {
        ticker,
        name: meta.name || ticker,
        sector: meta.sector || "Custom",
        enabled: true,
      };
    }),
    updatedAt: nowIso(),
  };
}
