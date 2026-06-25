# Paper Trading Simulator Changes

This version replaces the old single mock wallet with a local, free paper-trading simulator that runs from the backend every 5 minutes.

## What changed

- Added a backend 5-minute trading cycle.
- Added two fake accounts on the same wallet page.
- Added a wallet-page **Restart Menu**.
- Added saved strategy settings that survive backend/Railway restarts when `PAPER_TRADING_DATA_DIR` points to persistent storage.
- Added separate accounting for **Market Gain** vs **Money Added/Input Money**.
- Added per-strategy activity lists showing simulated buys and sells.
- Added total volume traded per strategy.
- Added 30 tracked symbols.
- Added JSON persistence in `backend/data/paperWallets.json` locally or `/data/paperWallets.json` on Railway.
- Added a manual `Run Cycle Now` button for testing.
- Added stale-baseline protection so the app does not compare today's price against a price from days ago.
- Changed dashboard quotes/news to use backend caching instead of repeatedly calling external APIs from every page refresh.
- Made AI analysis optional/manual so it does not automatically create paid OpenAI API calls.

## Restart Menu

The wallet page has a **Restart Menu** button.

Inside it you can change:

- Strategy 1 buy amount. Default: `$1`.
- Strategy 2 total starting value. Default: `$1,000`.
- Baseline reset window. Default: `15` minutes.

Buttons:

- **Save Values Only**: saves the settings but does not clear wallets.
- **Restart Strategy 1**: clears only Strategy 1 holdings, activity, equity history, money added, and market-gain accounting.
- **Restart Strategy 2**: clears only Strategy 2 holdings, activity, equity history, reserved cash, and market-gain accounting.
- **Restart Both + Clear Baselines**: clears both fake accounts and the 5-minute price baseline board.
- **Reset Defaults**: resets both fake wallets and settings back to `$1` for Strategy 1 and `$1,000` for Strategy 2.

## Strategy 1: Input Momentum Buys

Default buy amount: `$1`.

Strategy 1 no longer starts with a large fake cash balance. Instead, every buy adds new fake input money.

Every 5-minute cycle:

- If current price is greater than the previous 5-minute baseline, add the selected buy amount as new fake input money and buy that dollar amount.
- If current price is lower than the previous 5-minute baseline, sell all shares of that stock.
- If price is unchanged, do nothing.

Important accounting:

- **Money Added** = total fake cash injected by the strategy through buy signals.
- **Market Gain** = total wallet value minus Money Added.
- This keeps performance honest because the wallet does not count new deposits as profit.

Example:

```text
Strategy 1 buy amount = $1
NVDA goes up 3 cycles → $3 total money added and invested
NVDA later falls → all NVDA shares are sold
Total Value - Money Added = Market Gain or Loss
```

## Strategy 2: Initial Split + Reentry

Default starting value: `$1,000` total.

On first valid quote after a restart:

- Split the total starting value evenly across all tracked symbols.
- With 30 symbols, `$1,000` becomes about `$33.33` per stock.

Every 5-minute cycle after that:

- If holding and the stock is flat or up, hold.
- If holding and the stock is down, sell the whole position.
- The sale cash is reserved for that same stock only.
- If the stock keeps falling, wait.
- If the stock rises again, buy back using that stock's reserved sale cash.

Important accounting:

- Strategy 2 has only one input value: the starting value.
- No extra money is added after restart.
- **Market Gain** = total wallet value minus the starting value.
- **Volume Traded** = total simulated buy/sell dollars processed by that strategy.

## Important behavior

The first quote after startup becomes the baseline. If the app was closed for longer than the baseline reset window, default 15 minutes, the next quote resets the baseline and avoids an old comparison.

This is educational paper trading only. It does not connect to a broker and does not place real orders.

## API usage

The backend caches Finnhub quotes for about 5 minutes. With 30 symbols, this is about 30 quote calls every 5 minutes, which is much friendlier to free-tier usage than frontend-driven refreshes.

Twelve Data is still only used for the selected stock chart.

OpenAI is optional. If `OPENAI_API_KEY` is blank, `/api/analyze/:ticker` returns a free rule-based analysis fallback.

## Setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Add your `FINNHUB_API_KEY`.
3. Add `TWELVE_DATA_API_KEY` only if you want the selected chart to work.
4. Leave `OPENAI_API_KEY` blank if you want to avoid AI API costs.
5. Start the project using `start_stock_evaluator_vite.bat`, or manually run:

```bash
cd backend
npm install
npm start
```

```bash
cd frontend
npm install
npm run dev
```

## Useful endpoints

- `GET /api/health`
- `GET /api/wallet`
- `POST /api/trading/run-cycle`
- `POST /api/wallet/settings`
- `POST /api/wallet/restart`
- `POST /api/wallet/reset`

## Market-hours-only trading

The simulator now avoids fake trading while the regular U.S. market is closed. It only runs fresh quote checks and simulated buy/sell cycles during the regular core session:

```text
Monday-Friday, 9:30 a.m. to 4:00 p.m. America/New_York time
```

The app skips weekends and common full-day market holidays. If the market is closed, the backend returns the saved wallet state and the frontend shows a market-closed warning instead of running trades.

This avoids bad simulated trades from stale overnight, weekend, holiday, pre-market, or after-hours quotes.

## Public read-only viewer

A viewer-only page is available at:

```text
/viewer
```

It is not linked from the main navigation. Use this link to share the fake wallet progress without exposing restart controls. The viewer shows:

- combined account totals;
- Strategy 1 money added and market gain;
- Strategy 2 starting value and market gain;
- volume traded;
- current holdings;
- buy/sell activity for each fake wallet.

## Editable per-strategy ticker lists

The Restart Menu now saves separate ticker lists for Strategy 1 and Strategy 2. Each strategy can have up to 30 ticker slots. If the lists are completely different, the backend may track up to 60 unique symbols, but shared symbols are fetched once and reused by both strategies.

Changing a ticker slot without restarting does not wipe the strategy. If the old ticker has a simulated holding, the engine sells the old ticker at the latest available simulated price and immediately buys the replacement ticker with the same transferred value when a usable price is available. If a replacement price is not available yet, the transferred value is queued as a pending replacement buy and used on the next valid quote.

Restarting a strategy keeps the current saved ticker list but clears that selected strategy's holdings, activity, and equity history.


## Local API key setup

For local Windows testing, run:

```bat
setup_local_env.bat
```

This creates `backend/.env` on your computer. Do not commit `backend/.env` to GitHub. For Railway, add the same values in the Railway Variables tab instead of using a `.env` file.
