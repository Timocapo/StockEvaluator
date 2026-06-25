import { useEffect, useMemo, useState } from "react";
import {
  StrategyCard,
  formatTime,
  marketStatusClass,
  metricTone,
  money,
  percent,
} from "./MyWallet.jsx";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");

function StatCard({ label, value, detail, tone = "text-white" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

export default function WalletViewer() {
  const [wallet, setWallet] = useState(null);
  const [status, setStatus] = useState("Loading");

  async function loadViewer() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/viewer`);

      if (!response.ok) {
        throw new Error("Failed to load public viewer");
      }

      const data = await response.json();
      setWallet(data);
      setStatus("Live");
    } catch (error) {
      console.error(error);
      setStatus("Error");
    }
  }

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      loadViewer();
    }, 0);
    const interval = setInterval(loadViewer, 30000);

    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, []);

  const strategies = useMemo(() => wallet?.strategies || [], [wallet]);
  const priceSignals = wallet?.priceSignals || [];
  const marketStatus = wallet?.marketStatus || wallet?.meta?.marketStatus;

  const totals = useMemo(() => {
    return strategies.reduce(
      (sum, strategy) => ({
        totalValue: sum.totalValue + Number(strategy.totalValue || 0),
        marketGain: sum.marketGain + Number(strategy.marketGain || 0),
        volumeTraded: sum.volumeTraded + Number(strategy.totalTradeVolume || 0),
        moneyAdded: sum.moneyAdded + Number(strategy.moneyAdded || 0),
        strategy2StartingValue:
          sum.strategy2StartingValue +
          (strategy.id === "initialSplitReentry" ? Number(strategy.startingCash || 0) : 0),
      }),
      {
        totalValue: 0,
        marketGain: 0,
        volumeTraded: 0,
        moneyAdded: 0,
        strategy2StartingValue: 0,
      }
    );
  }, [strategies]);

  const base = totals.moneyAdded + totals.strategy2StartingValue;
  const combinedGainPercent = base > 0 ? (totals.marketGain / base) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_35%)]" />

      <main className="relative mx-auto max-w-[1800px] p-5">
        <header className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-cyan-300">Public Paper-Trading Viewer</p>
              <h1 className="mt-2 text-4xl font-black">Strategy Progress</h1>
              <p className="mt-3 max-w-4xl text-slate-400">
                Read-only viewer for the two fake strategy wallets. This page has no restart controls and is not linked from the main app navigation.
              </p>

              <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
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
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  Last cycle: {formatTime(wallet?.meta?.lastCycleAt)}
                </span>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  Tracked: {wallet?.trackedStocks?.length || 0}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 ${
                    status === "Live"
                      ? "border-green-400/30 bg-green-400/10 text-green-300"
                      : status === "Error"
                      ? "border-red-400/30 bg-red-400/10 text-red-300"
                      : "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
                  }`}
                >
                  Viewer: {status}
                </span>
              </div>
            </div>

            {marketStatus && !marketStatus.isOpen && (
              <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100 xl:max-w-xl">
                {marketStatus.reason} Simulated trading is paused outside regular U.S. market hours. Prices below use the latest available quote/market-close data.
              </div>
            )}
          </div>
        </header>

        <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Combined Total Value" value={money(totals.totalValue)} />
          <StatCard
            label="Combined Market Gain"
            value={`${totals.marketGain >= 0 ? "+" : ""}${money(totals.marketGain)}`}
            detail={`${combinedGainPercent >= 0 ? "+" : ""}${percent(combinedGainPercent)}`}
            tone={metricTone(totals.marketGain)}
          />
          <StatCard label="Strategy 1 Money Added" value={money(totals.moneyAdded)} detail="External fake input" />
          <StatCard label="Strategy 2 Starting Value" value={money(totals.strategy2StartingValue)} detail="No new money added" />
          <StatCard label="Volume Traded" value={money(totals.volumeTraded)} detail="All fake buys + sells" />
        </section>


        <section className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Current Tracked Prices</h2>
              <p className="mt-1 text-sm text-slate-400">
                Read-only latest price, daily dollar move, and daily percent move for each tracked stock or ETF.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-sm text-slate-300">
              Quotes: {priceSignals.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {priceSignals.map((signal) => (
              <div key={signal.ticker} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold">{signal.ticker}</p>
                    <p className="text-xs text-slate-400">{signal.name}</p>
                  </div>
                  <p className="text-lg font-black">{money(signal.price)}</p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Daily $</p>
                    <p className={`mt-1 font-bold ${metricTone(signal.dailyChangeAmount)}`}>
                      {signal.dailyChangeAmount >= 0 ? "+" : ""}{money(signal.dailyChangeAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Daily %</p>
                    <p className={`mt-1 font-bold ${metricTone(signal.dailyChangePercent)}`}>
                      {signal.dailyChangePercent >= 0 ? "+" : ""}{percent(signal.dailyChangePercent)}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Quote updated: {formatTime(signal.quoteFetchedAt || wallet?.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5">
          {strategies.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 backdrop-blur">
              Waiting for wallet data.
            </div>
          ) : (
            strategies.map((strategy) => <StrategyCard key={strategy.id} strategy={strategy} />)
          )}
        </section>
      </main>
    </div>
  );
}
