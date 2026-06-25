# API Keys, Local Testing, and Railway Deployment

This project is ready for both local testing and Railway deployment, but real API keys should not be stored in GitHub.

## Why the key is not inside this zip

Do not hide an API key in a file and upload it to GitHub. Hidden files can still be committed, and anything committed to GitHub should be treated as exposed. This build reads the same key safely from two places:

- Local testing: `backend/.env`
- Railway production: Railway service Variables

The real `backend/.env` file is intentionally ignored by Git.

## Local testing

Run:

```bat
setup_local_env.bat
```

Paste your Finnhub key when asked. This creates:

```text
backend/.env
```

Then run:

```bat
start_stock_evaluator_vite.bat
```

Check:

```text
http://localhost:3001/api/health
```

You want:

```json
"hasFinnhubKey": true
```

## Railway deployment

Upload/push the whole project folder to GitHub, but do not upload `backend/.env`.

In Railway, add these Variables:

```text
FINNHUB_API_KEY=your_real_finnhub_key_here
PAPER_TRADING_DATA_DIR=/data
NODE_ENV=production
SERVE_FRONTEND=true
QUOTE_CACHE_MS=300000
CLOSED_MARKET_QUOTE_CACHE_MS=3600000
NEWS_CACHE_MS=900000
FINNHUB_REQUEST_DELAY_MS=250
PAPER_TRADING_IGNORE_MARKET_HOURS=false
TWELVE_DATA_API_KEY=
OPENAI_API_KEY=
```

A copy-paste template is also included in:

```text
RAILWAY_VARIABLES_COPY_PASTE.txt
```

## Railway persistent storage

Mount a Railway Volume at:

```text
/data
```

This keeps the fake wallet history, activity, edited stock lists, and restart settings after restarts/redeploys.

## Important

If `/api/health` says `hasFinnhubKey: false`, the app is running but no prices can load. Add the key to `backend/.env` locally or Railway Variables in production.
