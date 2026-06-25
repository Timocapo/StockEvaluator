# Railway Deployment Guide

This version is set up so Railway can run the backend continuously and serve the built React frontend from the same Express service.

## What Railway will run

Railway will use the root `Dockerfile` because `railway.json` sets the builder to Dockerfile.

The Docker image does this:

1. Installs `backend` dependencies.
2. Installs `frontend` dependencies.
3. Builds the React app with `npm run build` inside `frontend`.
4. Starts the Express backend with `node backend/server.js`.
5. Express serves both `/api/...` routes and the built frontend from `frontend/dist`.

You do not need a second Railway service for the frontend.


## API key setup

Do not commit `backend/.env` or any real API key to GitHub. For local testing, run `setup_local_env.bat`. For Railway, add the real key in the Railway service Variables tab. See `README_API_KEYS_AND_DEPLOY.md` for the short checklist.

## Required Railway variables

Add these in Railway → your service → Variables:

```text
FINNHUB_API_KEY=your_finnhub_key_here
PAPER_TRADING_DATA_DIR=/data
NODE_ENV=production
SERVE_FRONTEND=true
```

Recommended optional variables:

```text
TWELVE_DATA_API_KEY=your_twelve_data_key_here
OPENAI_API_KEY=
QUOTE_CACHE_MS=300000
CLOSED_MARKET_QUOTE_CACHE_MS=3600000
NEWS_CACHE_MS=900000
FINNHUB_REQUEST_DELAY_MS=250
PAPER_TRADING_IGNORE_MARKET_HOURS=false
```

A copy-paste variable template is included in `RAILWAY_VARIABLES_COPY_PASTE.txt`. Put real API keys in Railway Variables, not in GitHub.

Do not manually set `PORT` unless Railway tells you to. The app already uses `process.env.PORT`, and Railway injects that value.

## Persistent wallet storage

The fake wallets and Restart Menu settings are stored in JSON. On Railway, normal container files can be lost when the app redeploys or restarts, so use a Railway Volume.

Recommended Railway setup:

1. Open your Railway project.
2. Select the stock evaluator service.
3. Add a Volume.
4. Set the volume mount path to:

```text
/data
```

5. Add this variable:

```text
PAPER_TRADING_DATA_DIR=/data
```

The app will then store the paper wallets at:

```text
/data/paperWallets.json
```

If you skip the volume, the app can still run, but wallet history, activity lists, market-gain accounting, and Restart Menu settings may reset after redeploys.


## Wallet defaults in this version

- Strategy 1 default buy amount: `$1` added as new fake input money on each up signal.
- Strategy 2 default starting value: `$1,000` total, split evenly across the tracked symbols.
- Both values can be changed from the wallet page Restart Menu.
- Market Gain is shown separately from input money so deposits are not counted as profit.

## GitHub deployment steps

1. Put this whole folder in a GitHub repo.
2. Push your repo to GitHub.
3. In Railway, create a new project.
4. Choose **Deploy from GitHub repo**.
5. Select the repo.
6. Add the required variables above.
7. Add a Railway Volume mounted at `/data`.
8. Deploy.
9. Open `/api/health` on your Railway URL to check the backend.
10. Open the root Railway URL to use the dashboard and wallet page.

## Important cost note

This app is designed to keep API usage low:

- 30 quote requests every 5 minutes.
- Cached dashboard data.
- Optional/manual AI analysis.
- Local JSON fake wallet storage.
- No paid broker or external paper-trading account required.

Hosting 24/7 can still consume Railway usage/credits. Watch Railway usage and cost limits.

## Local development

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

For local frontend development, keep `frontend/.env` as:

```text
VITE_API_BASE_URL=http://localhost:3001
```

For Railway production, you do not need `VITE_API_BASE_URL` because the frontend and API are served from the same domain.

## Market-hours protection

This version only refreshes quote values and runs simulated buy/sell cycles during the regular U.S. stock-market core session:

```text
Monday-Friday, 9:30 a.m. to 4:00 p.m. America/New_York time
```

The backend also skips weekends and common full-day U.S. market holidays. Outside that window:

- the scheduled 5-minute trading loop is skipped;
- the manual **Run Cycle Now** button is disabled on the wallet page;
- simulated buy/sell cycles are skipped;
- wallet/viewer pages show holdings and activity;
- quote display can still refresh from Finnhub using a slower closed-market cache so prices do not sit at `$0.00` after close.

For rare testing only, you can disable this gate with:

```text
PAPER_TRADING_IGNORE_MARKET_HOURS=true
```

Keep that variable unset or `false` for normal Railway use.

## Public viewer page

A read-only viewer page is available at:

```text
/viewer
```

Example after Railway deploy:

```text
https://your-railway-app.up.railway.app/viewer
```

This page is intentionally not linked from the dashboard or wallet navigation. It shows both strategies, combined totals, market gain, money added/starting value, volume traded, current holdings, and strategy activity. It does not include restart buttons or wallet controls.

## API usage with custom ticker lists

Strategy 1 and Strategy 2 can each have up to 30 tickers. If the same ticker appears in both strategies, the backend fetches one quote and shares it. If both lists are different, the maximum normal quote load is 60 symbols every 5 minutes, which averages about 12 Finnhub quote calls per minute before manual buttons, news, or test endpoints.


## Local API key setup

For local Windows testing, run:

```bat
setup_local_env.bat
```

This creates `backend/.env` on your computer. Do not commit `backend/.env` to GitHub. For Railway, add the same values in the Railway Variables tab instead of using a `.env` file.
