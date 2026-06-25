/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");

const STRATEGY_1_ID = "momentumInputBuys";
const STRATEGY_2_ID = "initialSplitReentry";

export function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export function shares(value) {
  return Number(value || 0).toFixed(5);
}

function directionClass(direction) {
  if (direction === "up") return "border-green-400/30 bg-green-400/10 text-green-300";
  if (direction === "down") return "border-red-400/30 bg-red-400/10 text-red-300";
  if (direction === "flat") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  if (direction === "baseline") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  return "border-slate-400/30 bg-slate-400/10 text-slate-300";
}

function tradeClass(type) {
  if (type === "BUY") return "bg-green-400/10 text-green-300";
  if (type === "SELL") return "bg-red-400/10 text-red-300";
  return "bg-cyan-400/10 text-cyan-300";
}

export function formatTime(value) {
  if (!value) return "Waiting";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function metricTone(value) {
  return Number(value || 0) >= 0 ? "text-green-300" : "text-red-300";
}

export function marketStatusClass(marketStatus) {
  if (marketStatus?.isOpen) return "border-green-400/30 bg-green-400/10 text-green-300";
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
}


function compactTickerList(values = []) {
  return values
    .map((value) => String(value || "").trim().toUpperCase().replace(/^\$/, ""))
    .filter(Boolean);
}

function makeTickerSlots(values = []) {
  const clean = Array.isArray(values) ? values : [];
  return Array.from({ length: 30 }, (_, index) => clean[index] || "");
}

function normalizeTickerSlotsForInput(values = []) {
  return makeTickerSlots(values).map((value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/^\$/, "")
      .replace(/[^A-Z0-9.-]/g, "")
  );
}

function TickerListEditor({ title, subtitle, tickers = [], onChange, accent = "cyan" }) {
  const slots = makeTickerSlots(tickers);
  const usedCount = compactTickerList(slots).length;
  const accentClass = accent === "fuchsia" ? "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10" : "text-cyan-300 border-cyan-400/30 bg-cyan-400/10";

  function updateSlot(index, value) {
    const nextSlots = [...slots];
    nextSlots[index] = value.toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    onChange(normalizeTickerSlotsForInput(nextSlots));
  }

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="font-bold">{title}</h4>
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${accentClass}`}>
          {usedCount}/30 slots
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-6">
        {slots.map((ticker, index) => (
          <label key={`${title}-${index}`} className="block text-xs text-slate-500">
            #{index + 1}
            <input
              value={ticker}
              maxLength={10}
              placeholder="—"
              onChange={(event) => updateSlot(index, event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-center font-bold uppercase text-white outline-none focus:border-cyan-300"
            />
          </label>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        To replace a stock, edit that stock's box directly. Duplicate or invalid tickers are rejected by the backend.
      </p>
    </div>
  );
}

export function StrategyCard({ strategy }) {
  const equityChartData = useMemo(() => {
    return (strategy.equityHistory || []).map((point, index) => ({
      label: index + 1,
      value: Number(point.value || 0),
    }));
  }, [strategy.equityHistory]);

  const activity = strategy.tradeHistory || [];
  const activityPreview = activity.slice(0, 80);
  const isStrategy1 = strategy.id === STRATEGY_1_ID;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-cyan-300">
            {strategy.shortName}
          </p>

          <h2 className="mt-2 text-3xl font-black">
            {strategy.name}
          </h2>

          <p className="mt-3 max-w-4xl text-sm text-slate-400">
            {strategy.description}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-right">
            <p className="text-sm text-slate-300">Total Value</p>
            <p className="mt-1 text-3xl font-black">{money(strategy.totalValue)}</p>
          </div>

          <div
            className={`rounded-2xl border px-4 py-3 text-right ${
              strategy.marketGain >= 0
                ? "border-green-400/30 bg-green-400/10"
                : "border-red-400/30 bg-red-400/10"
            }`}
          >
            <p className="text-sm text-slate-300">Market Gain</p>
            <p className={`mt-1 text-3xl font-black ${metricTone(strategy.marketGain)}`}>
              {strategy.marketGain >= 0 ? "+" : ""}{money(strategy.marketGain)}
            </p>
            <p className={`mt-1 text-sm font-bold ${metricTone(strategy.totalGainPercent)}`}>
              {strategy.totalGainPercent >= 0 ? "+" : ""}{percent(strategy.totalGainPercent)}
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-right">
            <p className="text-sm text-slate-300">
              {isStrategy1 ? "Money Added" : "Starting Value"}
            </p>
            <p className="mt-1 text-3xl font-black text-cyan-300">
              {isStrategy1 ? money(strategy.moneyAdded) : money(strategy.startingCash)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {isStrategy1 ? "External fake input" : `${money(strategy.perStockStartAmount)} per stock`}
            </p>
          </div>
        </div>
      </div>

      {strategy.trackedStocks?.length > 0 && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-bold">Strategy Stock List</h3>
            <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs text-slate-300">
              {strategy.trackedStocks.length}/30 selected
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {strategy.trackedStocks.map((stock) => (
              <span
                key={`${strategy.id}-${stock.ticker}`}
                className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs font-bold text-slate-200"
                title={stock.name}
              >
                {stock.ticker}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm text-slate-400">Cash</p>
          <p className="mt-2 text-2xl font-bold">{money(strategy.cash)}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm text-slate-400">Reserved</p>
          <p className="mt-2 text-2xl font-bold">{money(strategy.reservedCash)}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm text-slate-400">Holdings Value</p>
          <p className="mt-2 text-2xl font-bold">{money(strategy.holdingsValue)}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm text-slate-400">Positions</p>
          <p className="mt-2 text-2xl font-bold">{strategy.activeHoldings}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm text-slate-400">Activity</p>
          <p className="mt-2 text-2xl font-bold">{activity.length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm text-slate-400">Volume Traded</p>
          <p className="mt-2 text-2xl font-bold">{money(strategy.totalTradeVolume)}</p>
        </div>
      </div>

      <div className="mt-6 h-64 rounded-2xl border border-white/10 bg-black/30 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={equityChartData}>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={["dataMin", "dataMax"]} />

            <Tooltip
              formatter={(value) => money(value)}
              contentStyle={{
                background: "#020617",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "12px",
              }}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke="#22d3ee"
              fill="#22d3ee"
              fillOpacity={0.15}
              strokeWidth={3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xl font-bold">Current Holdings</h3>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
              Fractional Shares
            </span>
          </div>

          <div className="max-h-[620px] space-y-3 overflow-auto pr-1">
            {strategy.holdings?.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-center text-slate-400">
                No holdings right now. The next valid 5-minute cycle can create or update positions.
              </div>
            ) : (
              strategy.holdings.map((holding) => (
                <div
                  key={holding.ticker}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-2xl font-bold">{holding.ticker}</h4>
                      <p className="text-sm text-slate-400">{holding.name}</p>
                      <p className="mt-2 text-sm text-slate-400">
                        {shares(holding.shares)} shares
                      </p>
                    </div>

                    <div
                      className={`rounded-full border px-3 py-1 text-sm font-bold ${
                        holding.gainPercent >= 0
                          ? "border-green-400/30 bg-green-400/10 text-green-300"
                          : "border-red-400/30 bg-red-400/10 text-red-300"
                      }`}
                    >
                      {holding.gainPercent >= 0 ? "+" : ""}
                      {percent(holding.gainPercent)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                      <p className="text-xs text-slate-400">Avg Cost</p>
                      <p className="mt-1 font-bold">{money(holding.avgCost)}</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                      <p className="text-xs text-slate-400">Current</p>
                      <p className="mt-1 font-bold">{money(holding.currentPrice)}</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                      <p className="text-xs text-slate-400">Value</p>
                      <p className="mt-1 font-bold">{money(holding.currentValue)}</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                      <p className="text-xs text-slate-400">Gain</p>
                      <p className={`mt-1 font-bold ${metricTone(holding.gainAmount)}`}>
                        {holding.gainAmount >= 0 ? "+" : ""}{money(holding.gainAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xl font-bold">Strategy Activity</h3>
            <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1 text-xs text-fuchsia-300">
              Latest {Math.min(activityPreview.length, 80)} of {activity.length}
            </span>
          </div>

          <div className="max-h-[620px] space-y-3 overflow-auto pr-1">
            {activityPreview.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-center text-slate-400">
                No buy/sell activity yet.
              </div>
            ) : (
              activityPreview.map((trade, index) => (
                <div
                  key={`${strategy.id}-${trade.ticker}-${trade.timestamp}-${index}`}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${tradeClass(trade.type)}`}>
                          {trade.type}
                        </span>

                        <span className="text-xl font-bold">{trade.ticker}</span>

                        <span className="text-sm text-slate-400">
                          {money(trade.amount)}
                        </span>
                      </div>

                      {trade.type === "TRANSFER" ? (
                        <p className="mt-3 text-sm text-slate-400">
                          Simulated value transfer: {money(trade.amount)}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-slate-400">
                          {shares(trade.shares)} shares @ {money(trade.price)}
                        </p>
                      )}

                      {Number.isFinite(trade.realizedGain) && (
                        <p
                          className={`mt-2 text-sm font-bold ${
                            trade.realizedGain >= 0 ? "text-green-300" : "text-red-300"
                          }`}
                        >
                          Realized: {trade.realizedGain >= 0 ? "+" : ""}{money(trade.realizedGain)} ({percent(trade.realizedGainPercent)})
                        </p>
                      )}

                      <p className="mt-2 text-xs text-slate-500">{trade.reason}</p>
                      {trade.priceMove && (
                        <p className="mt-1 text-xs text-slate-500">{trade.priceMove}</p>
                      )}
                    </div>

                    <span className="text-right text-xs text-slate-500">
                      {formatTime(trade.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function MyWallet() {
  const [wallet, setWallet] = useState(null);
  const [status, setStatus] = useState("Loading");
  const [message, setMessage] = useState("");
  const [showRestartMenu, setShowRestartMenu] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    strategy1BuyAmount: 1,
    strategy2StartingValue: 1000,
    baselineResetAfterMinutes: 15,
    strategy1Tickers: [],
    strategy2Tickers: [],
  });

  const trackedCount = wallet?.trackedStocks?.length || 30;
  const strategy2Count = compactTickerList(settingsDraft.strategy2Tickers).length || 1;
  const marketStatus = wallet?.marketStatus || wallet?.meta?.marketStatus;
  const strategy2PerStock = Number(settingsDraft.strategy2StartingValue || 0) / Math.max(1, strategy2Count);

  async function loadWallet() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/wallet`);

      if (!response.ok) {
        throw new Error("Failed to load wallet");
      }

      const data = await response.json();

      setWallet(data);
      setSettingsDraft({
        strategy1BuyAmount: data.settings?.strategy1BuyAmount || 1,
        strategy2StartingValue: data.settings?.strategy2StartingValue || 1000,
        baselineResetAfterMinutes: data.settings?.baselineResetAfterMinutes || 15,
        strategy1Tickers: normalizeTickerSlotsForInput(data.settings?.strategy1Tickers || []),
        strategy2Tickers: normalizeTickerSlotsForInput(data.settings?.strategy2Tickers || []),
      });
      setStatus("Live");
    } catch (error) {
      console.error(error);
      setStatus("Error");
    }
  }

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      loadWallet();
    }, 0);
    const interval = setInterval(loadWallet, 30000);

    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, []);

  async function saveSettings() {
    try {
      setMessage("Saving restart-menu values and stock-list changes...");

      const response = await fetch(`${API_BASE_URL}/api/wallet/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      const data = await response.json();
      setWallet(data);
      setMessage(`Restart-menu values saved. ${data.tickerChanges?.length || 0} stock-list slot change(s) applied. Settings persist through server restarts and Railway redeploys when /data is mounted.`);
    } catch (error) {
      console.error(error);
      setMessage("Could not save settings.");
    }
  }

  async function restartWallets(strategyIds, label, resetBaselines = false) {
    try {
      const confirmed = window.confirm(
        `${label}? This clears activity and holdings for the selected fake wallet account(s).`
      );

      if (!confirmed) return;

      setMessage(`${label}...`);

      const response = await fetch(`${API_BASE_URL}/api/wallet/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyIds,
          settings: settingsDraft,
          resetBaselines,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to restart wallet strategy");
      }

      const data = await response.json();
      setWallet(data.wallet);
      setMessage(data.message || `${label} complete.`);
    } catch (error) {
      console.error(error);
      setMessage("Could not restart the selected fake wallet.");
    }
  }

  async function runCycleNow() {
    try {
      setMessage("Running a paper-trading cycle...");

      const response = await fetch(`${API_BASE_URL}/api/trading/run-cycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "manual wallet button" }),
      });

      if (!response.ok) {
        throw new Error("Failed to run cycle");
      }

      const data = await response.json();
      setWallet(data.wallet);
      setMessage(data.message || "Cycle completed.");
    } catch (error) {
      console.error(error);
      setMessage("Could not run cycle.");
    }
  }

  async function resetToDefaults() {
    try {
      const confirmed = window.confirm(
        "Reset both fake accounts to the default $1 Strategy 1 buy amount and $1,000 Strategy 2 starting value? This cannot be undone."
      );

      if (!confirmed) return;

      setMessage("Resetting wallets to defaults...");

      const response = await fetch(`${API_BASE_URL}/api/wallet/reset`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to reset wallets");
      }

      const data = await response.json();
      setWallet(data.wallet);
      setSettingsDraft({
        strategy1BuyAmount: data.wallet?.settings?.strategy1BuyAmount || 1,
        strategy2StartingValue: data.wallet?.settings?.strategy2StartingValue || 1000,
        baselineResetAfterMinutes: data.wallet?.settings?.baselineResetAfterMinutes || 15,
        strategy1Tickers: normalizeTickerSlotsForInput(data.wallet?.settings?.strategy1Tickers || []),
        strategy2Tickers: normalizeTickerSlotsForInput(data.wallet?.settings?.strategy2Tickers || []),
      });
      setMessage(data.message || "Wallets reset.");
    } catch (error) {
      console.error(error);
      setMessage("Could not reset wallets.");
    }
  }

  const strategies = wallet?.strategies || [];
  const priceSignals = wallet?.priceSignals || [];
  const upCount = priceSignals.filter((signal) => signal.direction === "up").length;
  const downCount = priceSignals.filter((signal) => signal.direction === "down").length;
  const flatCount = priceSignals.filter((signal) => signal.direction === "flat").length;
  const baselineCount = priceSignals.filter((signal) => signal.direction === "baseline").length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_35%)]" />

      <main className="relative mx-auto max-w-[1800px] p-5">
        <header className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-cyan-300">Local Paper-Trading Simulator</p>

              <h1 className="mt-2 text-4xl font-bold">My Wallet</h1>

              <p className="mt-3 max-w-4xl text-slate-400">
                Two fake accounts run from the backend every 5 minutes using cached Finnhub prices.
                Market gain is separated from fake input money so you can see whether the strategy actually earned money.
              </p>

              <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  Last cycle: {formatTime(wallet?.meta?.lastCycleAt)}
                </span>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  Next cycle: {formatTime(wallet?.meta?.nextCycleAt)}
                </span>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  Unique tracked: {trackedCount}
                </span>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  Last restart: {formatTime(wallet?.meta?.lastRestartAt)}
                </span>
                <span className={`rounded-full border px-3 py-1 ${marketStatusClass(marketStatus)}`}>
                  Market: {marketStatus?.isOpen ? "Open" : "Closed"}
                </span>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  ET time: {marketStatus?.currentEasternTime || "Checking"}
                </span>
                {!marketStatus?.isOpen && marketStatus?.nextRegularOpen && (
                  <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-yellow-300">
                    Next open: {marketStatus.nextRegularOpen}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 lg:min-w-[460px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`rounded-full border px-4 py-2 font-bold ${
                    status === "Live"
                      ? "border-green-400/40 bg-green-400/10 text-green-300"
                      : status === "Error"
                      ? "border-red-400/40 bg-red-400/10 text-red-300"
                      : "border-yellow-400/40 bg-yellow-400/10 text-yellow-300"
                  }`}
                >
                  {status}
                </span>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={loadWallet}
                    className="rounded-full border border-white/10 px-4 py-2 font-bold text-slate-300 hover:bg-white/10"
                  >
                    Refresh
                  </button>

                  <button
                    onClick={() => setShowRestartMenu((current) => !current)}
                    className="rounded-full bg-cyan-400 px-5 py-2 font-bold text-slate-950 hover:bg-cyan-300"
                  >
                    {showRestartMenu ? "Close Restart Menu" : "Restart Menu"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <p className="text-slate-400">Strategy 1 buy amount</p>
                  <p className="mt-1 text-2xl font-bold">{money(wallet?.settings?.strategy1BuyAmount || 1)}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <p className="text-slate-400">Strategy 2 starting value</p>
                  <p className="mt-1 text-2xl font-bold">{money(wallet?.settings?.strategy2StartingValue || 1000)}</p>
                </div>
              </div>

              <button
                onClick={runCycleNow}
                disabled={marketStatus && !marketStatus.isOpen}
                title={marketStatus && !marketStatus.isOpen ? marketStatus.reason : "Run one manual paper-trading cycle"}
                className={`rounded-full border px-5 py-2 font-bold ${
                  marketStatus && !marketStatus.isOpen
                    ? "cursor-not-allowed border-slate-500/30 bg-slate-500/10 text-slate-400"
                    : "border-green-400/30 bg-green-400/10 text-green-300 hover:bg-green-400/20"
                }`}
              >
                {marketStatus && !marketStatus.isOpen ? "Cycle Paused: Market Closed" : "Run Cycle Now"}
              </button>

              {marketStatus && !marketStatus.isOpen && (
                <p className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-200">
                  {marketStatus.reason} Simulated trading is paused outside regular U.S. market hours. Display prices use the latest available quote/market-close data.
                </p>
              )}

              {message && <p className="text-sm text-slate-400">{message}</p>}
            </div>
          </div>

          {showRestartMenu && (
            <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-5">
              <div className="mb-5">
                <h2 className="text-2xl font-bold">Restart Menu</h2>
                <p className="mt-2 max-w-4xl text-sm text-slate-400">
                  Saving values applies money settings and stock-list changes. Replacing one ticker slot moves the simulated value from the old ticker into the new ticker when prices are available. Restarting clears the selected fake wallet but keeps the currently selected stock list.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-sm uppercase tracking-widest text-cyan-300">Strategy 1</p>
                  <h3 className="mt-2 text-xl font-bold">Input Momentum Buys</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Each up signal adds this amount as new fake input money, buys that amount, and tracks market gain separately.
                  </p>

                  <label className="mt-4 block text-sm text-slate-300">
                    Buy amount added on each up signal
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={settingsDraft.strategy1BuyAmount}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          strategy1BuyAmount: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    />
                  </label>

                  <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-400">
                    Money Added = total fake cash you injected through buys. Market Gain = current wallet value minus that input money.
                  </div>

                  <TickerListEditor
                    title="Strategy 1 stock list"
                    subtitle="Used only by Strategy 1. Keep up to 30 tickers."
                    tickers={settingsDraft.strategy1Tickers}
                    onChange={(tickers) =>
                      setSettingsDraft((current) => ({ ...current, strategy1Tickers: tickers }))
                    }
                    accent="cyan"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-sm uppercase tracking-widest text-fuchsia-300">Strategy 2</p>
                  <h3 className="mt-2 text-xl font-bold">Initial Split + Reentry</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    This starts with one fixed fake bankroll. No extra money is added after restart.
                  </p>

                  <label className="mt-4 block text-sm text-slate-300">
                    Total starting value
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={settingsDraft.strategy2StartingValue}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          strategy2StartingValue: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    />
                  </label>

                  <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-400">
                    With {strategy2Count} Strategy 2 symbols, {money(settingsDraft.strategy2StartingValue)} starts as about {money(strategy2PerStock)} per stock.
                  </div>

                  <TickerListEditor
                    title="Strategy 2 stock list"
                    subtitle="Used only by Strategy 2. Keep up to 30 tickers."
                    tickers={settingsDraft.strategy2Tickers}
                    onChange={(tickers) =>
                      setSettingsDraft((current) => ({ ...current, strategy2Tickers: tickers }))
                    }
                    accent="fuchsia"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-sm uppercase tracking-widest text-yellow-300">Controls</p>
                  <h3 className="mt-2 text-xl font-bold">Save or Restart</h3>

                  <label className="mt-4 block text-sm text-slate-300">
                    Baseline reset window, minutes
                    <input
                      type="number"
                      min="5"
                      step="1"
                      value={settingsDraft.baselineResetAfterMinutes}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          baselineResetAfterMinutes: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                    />
                  </label>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <button
                      onClick={saveSettings}
                      className="rounded-full bg-cyan-400 px-5 py-2 font-bold text-slate-950 hover:bg-cyan-300"
                    >
                      Save Values + Stock Lists
                    </button>

                    <button
                      onClick={() => restartWallets([STRATEGY_1_ID], "Restart Strategy 1")}
                      className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-5 py-2 font-bold text-cyan-300 hover:bg-cyan-400/20"
                    >
                      Restart Strategy 1
                    </button>

                    <button
                      onClick={() => restartWallets([STRATEGY_2_ID], "Restart Strategy 2")}
                      className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-5 py-2 font-bold text-fuchsia-300 hover:bg-fuchsia-400/20"
                    >
                      Restart Strategy 2
                    </button>

                    <button
                      onClick={() => restartWallets([STRATEGY_1_ID, STRATEGY_2_ID], "Restart Both Strategies", true)}
                      className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-5 py-2 font-bold text-yellow-300 hover:bg-yellow-400/20"
                    >
                      Restart Both + Clear Baselines
                    </button>

                    <button
                      onClick={resetToDefaults}
                      className="rounded-full border border-red-400/30 bg-red-400/10 px-5 py-2 font-bold text-red-300 hover:bg-red-400/20"
                    >
                      Reset Defaults
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <p className="text-sm text-slate-400">Up Signals</p>
            <p className="mt-2 text-3xl font-black text-green-300">{upCount}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <p className="text-sm text-slate-400">Down Signals</p>
            <p className="mt-2 text-3xl font-black text-red-300">{downCount}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <p className="text-sm text-slate-400">Flat Signals</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">{flatCount}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <p className="text-sm text-slate-400">Baseline Signals</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">{baselineCount}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <p className="text-sm text-slate-400">Cycles</p>
            <p className="mt-2 text-3xl font-black">{wallet?.meta?.cycleCount || 0}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5">
          {strategies.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Strategy Stock 5-Minute Signal Board</h2>
              <p className="mt-2 text-sm text-slate-400">
                The first quote after startup becomes the baseline. If the app has been closed too long,
                the baseline resets instead of trading against old data.
              </p>
            </div>

            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300">
              Baseline reset: {wallet?.settings?.baselineResetAfterMinutes || 15} min
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {priceSignals.map((signal) => (
              <div key={signal.ticker} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold">{signal.ticker}</p>
                    <p className="text-sm text-slate-400">{signal.name}</p>
                  </div>

                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${directionClass(signal.direction)}`}>
                    {signal.direction || "waiting"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Price</p>
                    <p className="mt-1 font-bold">{money(signal.price)}</p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Daily</p>
                    <p
                      className={`mt-1 font-bold ${
                        signal.dailyChangeAmount >= 0 ? "text-green-300" : "text-red-300"
                      }`}
                    >
                      {signal.dailyChangeAmount >= 0 ? "+" : ""}
                      {money(signal.dailyChangeAmount)}
                    </p>
                    <p
                      className={`text-xs ${
                        signal.dailyChangePercent >= 0 ? "text-green-300" : "text-red-300"
                      }`}
                    >
                      {signal.dailyChangePercent >= 0 ? "+" : ""}
                      {percent(signal.dailyChangePercent)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Prev 5m</p>
                    <p className="mt-1 font-bold">{signal.previousPrice ? money(signal.previousPrice) : "—"}</p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">5m</p>
                    <p
                      className={`mt-1 font-bold ${
                        signal.changePercent >= 0 ? "text-green-300" : "text-red-300"
                      }`}
                    >
                      {signal.changePercent >= 0 ? "+" : ""}
                      {percent(signal.changePercent)}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">{signal.note}</p>
                {signal.quoteFetchedAt && (
                  <p className="mt-1 text-xs text-slate-600">Quote updated: {formatTime(signal.quoteFetchedAt)}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
