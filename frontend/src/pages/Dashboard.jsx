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

function ratingClass(rating) {
  if (rating === "Buy") return "text-green-400 border-green-400/40 bg-green-400/10";
  if (rating === "Sell") return "text-red-400 border-red-400/40 bg-red-400/10";
  return "text-yellow-300 border-yellow-300/40 bg-yellow-300/10";
}

function dayMoveText(stock) {
  const amount = Number(stock?.changeAmount || 0);
  const pct = Number(stock?.changePct || 0);
  const sign = amount >= 0 ? "+" : "";
  const pctSign = pct >= 0 ? "+" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)} (${pctSign}${pct.toFixed(2)}%)`;
}

function chartData(values = []) {
  return values.map((point, index) => ({
    name: point.label || index + 1,
    price: point.price,
  }));
}

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [news, setNews] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState("NVDA");
  const [status, setStatus] = useState("Loading");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [selectedChart, setSelectedChart] = useState([]);
  const [chartSource, setChartSource] = useState("Loading");
  const [chartUpdated, setChartUpdated] = useState(null);

  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiStatus, setAiStatus] = useState("Idle");
  const [aiUpdated, setAiUpdated] = useState(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/market-dashboard`);

        if (!response.ok) {
          throw new Error("Backend request failed");
        }

        const data = await response.json();

        setStocks(data.stocks || []);
        setNews(data.news || []);
        setLastUpdated(data.lastUpdated);
        setStatus("Live");
      } catch (error) {
        console.error(error);
        setStatus("Error");
      }
    }

    loadDashboard();

    const interval = setInterval(loadDashboard, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedTicker) return;

    async function loadSelectedChart() {
      try {
        setChartSource("Loading");

        const response = await fetch(`${API_BASE_URL}/api/chart/${selectedTicker}`);

        if (!response.ok) {
          throw new Error("Chart request failed");
        }

        const data = await response.json();

        setSelectedChart(data.data || []);
        setChartSource(data.chartSource || "Unknown");
        setChartUpdated(data.lastUpdated || new Date().toISOString());
      } catch (error) {
        console.error(error);
        setChartSource("Error");
      }
    }

    loadSelectedChart();

    const interval = setInterval(loadSelectedChart, 30000);

    return () => clearInterval(interval);
  }, [selectedTicker]);

  async function loadAiAnalysis() {
    if (!selectedTicker) return;

    try {
      setAiStatus("Analyzing");
      setAiAnalysis(null);

      const response = await fetch(`${API_BASE_URL}/api/analyze/${selectedTicker}`);

      if (!response.ok) {
        throw new Error("Analysis request failed");
      }

      const data = await response.json();

      setAiAnalysis(data.analysis);
      setAiUpdated(data.analyzedAt || new Date().toISOString());
      setAiStatus(data.source?.includes("Rule-based") ? "Rule Based" : "Ready");
    } catch (error) {
      console.error(error);
      setAiStatus("Error");
    }
  }

  const selectedStock = useMemo(() => {
    return stocks.find((stock) => stock.ticker === selectedTicker) || stocks[0];
  }, [stocks, selectedTicker]);

  const buyCount = stocks.filter((stock) => stock.rating === "Buy").length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_35%)]" />

      <main className="relative mx-auto max-w-[1800px] p-5">
        <header className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <p className="text-cyan-300">Finnhub + Twelve Data + Optional AI Market Dashboard</p>

          <h1 className="mt-2 text-4xl font-bold">
            Opening Bell Command Center
          </h1>

          <div className="mt-5 grid max-w-xl grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-sm text-slate-400">Tracked</p>
              <p className="text-2xl font-bold">{stocks.length}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-sm text-slate-400">5m Buy Signals</p>
              <p className="text-2xl font-bold text-green-400">{buyCount}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-sm text-slate-400">Status</p>
              <p
                className={`text-2xl font-bold ${
                  status === "Live"
                    ? "text-green-400"
                    : status === "Error"
                    ? "text-red-400"
                    : "text-yellow-300"
                }`}
              >
                {status}
              </p>
            </div>
          </div>

          {lastUpdated && (
            <p className="mt-3 text-sm text-slate-400">
              Last updated: {new Date(lastUpdated).toLocaleTimeString()}
            </p>
          )}
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-4">
          <aside className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur xl:col-span-1">
            <h2 className="mb-4 text-xl font-bold">Live News</h2>

            <div className="space-y-3">
              {news.map((item, index) => (
                <a
                  key={`${item.title}-${index}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-cyan-400/50"
                >
                  <div className="mb-2 flex justify-between text-xs text-slate-400">
                    <span>{item.source}</span>
                    <span>{item.time}</span>
                  </div>

                  <h3 className="text-sm font-semibold">{item.title}</h3>

                  <div className="mt-3 flex gap-2">
                    {item.tickers?.map((ticker) => (
                      <span
                        key={ticker}
                        className="rounded-full bg-white/10 px-2 py-1 text-xs"
                      >
                        {ticker}
                      </span>
                    ))}
                  </div>
                </a>
              ))}
            </div>
          </aside>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur xl:col-span-2">
            <h2 className="mb-4 text-xl font-bold">Stock Ratings</h2>

            <div className="space-y-3">
              {stocks.map((stock) => (
                <button
                  key={stock.ticker}
                  onClick={() => setSelectedTicker(stock.ticker)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedTicker === stock.ticker
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-white/10 bg-black/30 hover:border-white/30"
                  }`}
                >
                  <div className="grid gap-4 md:grid-cols-4 md:items-center">
                    <div>
                      <p className="text-2xl font-bold">{stock.ticker}</p>
                      <p className="text-sm text-slate-400">{stock.name}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">Price</p>
                      <p className="text-lg font-bold">
                        ${stock.price?.toFixed(2)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">Day Move</p>
                      <p
                        className={`text-lg font-bold ${
                          stock.changePct >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {dayMoveText(stock)}
                      </p>
                    </div>

                    <div>
                      <span
                        className={`rounded-full border px-3 py-1 text-sm font-bold ${ratingClass(
                          stock.rating
                        )}`}
                      >
                        Rule: {stock.rating}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="rounded-full bg-white/10 px-2 py-1">
                      5m: {stock.fiveMinuteDirection || "waiting"}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-1">
                      5m change: {stock.fiveMinuteChangePct >= 0 ? "+" : ""}{stock.fiveMinuteChangePct?.toFixed(3)}%
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-400">
                    {stock.rationale}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur xl:col-span-1">
            <h2 className="mb-4 text-xl font-bold">Price Graph</h2>

            {selectedStock ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="mb-5 flex items-start justify-between">
                    <div>
                      <p className="text-3xl font-bold">
                        {selectedStock.ticker}
                      </p>
                      <p className="text-sm text-slate-400">
                        {selectedStock.name}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-sm font-bold ${ratingClass(
                        selectedStock.rating
                      )}`}
                    >
                      Rule: {selectedStock.rating}
                    </span>
                  </div>

                  <p className="text-4xl font-bold">
                    ${selectedStock.price?.toFixed(2)}
                  </p>

                  <p
                    className={`mt-1 ${
                      selectedStock.changePct >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {dayMoveText(selectedStock)} today
                  </p>

                  <div className="mt-6 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData(selectedChart)}>
                        <XAxis dataKey="name" hide />
                        <YAxis hide domain={["dataMin", "dataMax"]} />
                        <Tooltip
                          contentStyle={{
                            background: "#020617",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "12px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke="currentColor"
                          fill="currentColor"
                          fillOpacity={0.15}
                          strokeWidth={3}
                          className={
                            selectedStock.changePct >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="mt-4 text-xs text-slate-500">
                    Chart source: {chartSource}
                    {chartUpdated
                      ? ` · Updated ${new Date(chartUpdated).toLocaleTimeString()}`
                      : ""}
                  </p>
                </div>

                <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/10 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold">Optional Analyst</h3>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={loadAiAnalysis}
                        className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20"
                      >
                        Analyze
                      </button>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-bold ${
                          aiStatus === "Ready" || aiStatus === "Rule Based"
                            ? "border-green-400/40 text-green-300"
                            : aiStatus === "Error"
                            ? "border-red-400/40 text-red-300"
                            : "border-yellow-400/40 text-yellow-300"
                        }`}
                      >
                        {aiStatus}
                      </span>
                    </div>
                  </div>

                  {aiAnalysis ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span
                          className={`rounded-full border px-4 py-1 text-sm font-bold ${ratingClass(
                            aiAnalysis.rating
                          )}`}
                        >
                          AI: {aiAnalysis.rating}
                        </span>

                        <span className="text-sm text-slate-300">
                          Confidence: {aiAnalysis.confidence}%
                        </span>
                      </div>

                      <p className="text-sm leading-6 text-slate-200">
                        {aiAnalysis.summary}
                      </p>

                      <div>
                        <p className="mb-2 text-sm font-bold text-green-300">
                          Bullish Factors
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                          {aiAnalysis.bullishFactors?.map((factor, index) => (
                            <li key={index}>{factor}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-bold text-red-300">
                          Bearish / Risk Factors
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                          {aiAnalysis.bearishFactors?.map((factor, index) => (
                            <li key={index}>{factor}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                        <span className="text-slate-400">Risk Level</span>
                        <span className="font-bold text-yellow-300">
                          {aiAnalysis.riskLevel}
                        </span>
                      </div>

                      {aiUpdated && (
                        <p className="text-xs text-slate-500">
                          Analysis updated: {new Date(aiUpdated).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      {aiStatus === "Analyzing"
                        ? "Analyzing latest news and price movement..."
                        : "Click Analyze to run optional AI/rule-based analysis. This avoids automatic paid AI calls."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-slate-400">Loading stock chart...</p>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}