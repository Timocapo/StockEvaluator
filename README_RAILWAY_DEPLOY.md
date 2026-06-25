# Railway Deployment Guide

This folder is the Railway-ready build of the stock evaluator/paper-trading app. It is intended to be committed to GitHub and deployed to Railway as one service.

## What Railway runs

Railway uses the root `Dockerfile` and `railway.json`.

The Docker build:

1. Installs frontend dependencies.
2. Builds the React frontend.
3. Installs backend production dependencies.
4. Copies the built frontend into the final image.
5. Starts Express with `node backend/server.js`.

Express serves both the API routes and the React frontend from the same Railway domain.

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
TWELVE_DATA_API_KEY=
OPENAI_API_KEY=
QUOTE_CACHE_MS=300000
CLOSED_MARKET_QUOTE_CACHE_MS=3600000
NEWS_CACHE_MS=900000
FINNHUB_REQUEST_DELAY_MS=250
PAPER_TRADING_IGNORE_MARKET_HOURS=false
```

A copy-paste template is included in `RAILWAY_VARIABLES_COPY_PASTE.txt`.

Do not set `PORT` manually. Railway injects `PORT`, and the backend already reads `process.env.PORT`.

## Persistent wallet storage

Add a Railway Volume mounted at:

```text
/data
```

This keeps the fake wallet state, activity history, edited ticker lists, restart-menu settings, and baselines after redeploys or restarts.

Without a mounted volume, the app can run, but wallet history may reset when Railway redeploys the container.

## GitHub deployment steps

1. Commit this folder to your GitHub repo.
2. In Railway, create a new project.
3. Choose **Deploy from GitHub repo**.
4. Select this repo and branch.
5. Add the variables above.
6. Add the `/data` volume.
7. Deploy or redeploy.
8. Open `/api/health` to confirm the backend is healthy.
9. Open `/viewer` for the read-only progress page.

## Health checks

After deploy, check:

```text
https://your-app.up.railway.app/api/health
```

You want to see:

```json
"status": "ok",
"hasFinnhubKey": true
```

If `hasFinnhubKey` is false, add or fix the `FINNHUB_API_KEY` Railway variable and redeploy.

## Public pages

Main app:

```text
/
```

Read-only viewer page:

```text
/viewer
```

Backup viewer aliases:

```text
/progress
/public
```

## Trading behavior

The backend only performs simulated buy/sell cycles during regular U.S. stock-market core hours:

```text
Monday-Friday, 9:30 a.m. to 4:00 p.m. America/New_York time
```

Outside that window, fake trading is paused, but display quotes can still refresh with a slower closed-market cache so prices do not stay at zero after close.

## API usage design

The app uses Finnhub quote caching. Strategy 1 and Strategy 2 can each have up to 30 tickers. If the same ticker appears in both strategies, the backend fetches one shared quote and uses it for both fake wallets.

The app reads API keys from Railway Variables. No `.env` file is required or included for Railway.
