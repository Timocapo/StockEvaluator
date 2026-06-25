# Paper Trading System Summary

This build contains a two-strategy fake wallet system designed for Railway deployment.

## Strategy 1: Momentum Micro-Buys

Default buy amount: `$1`.

Every valid 5-minute market cycle:

```text
If a stock is higher than its previous 5-minute baseline:
  Add the configured fake input amount and buy that amount of that stock.

If a stock is lower than its previous 5-minute baseline:
  Sell all shares of that one stock only.

If a stock is unchanged:
  Do nothing.
```

Accounting shown:

```text
Money Added = fake money injected by Strategy 1 buy signals
Market Gain = current strategy value minus money added
Volume Traded = total simulated buy and sell dollars
```

## Strategy 2: Initial Buy + Reentry

Default starting value: `$1,000` total.

On strategy restart, the starting value is split evenly across the current Strategy 2 ticker list.

Every valid 5-minute market cycle:

```text
If holding a stock and price is up or flat:
  Hold.

If holding a stock and price is down:
  Sell all shares of that one stock only.
  Reserve the sale money for that same ticker.

If not holding a stock and price keeps falling:
  Wait.

If not holding a stock and price rises again:
  Buy back using that ticker's reserved money.
```

Accounting shown:

```text
Starting Value = initial Strategy 2 bankroll
Market Gain = current strategy value minus starting value
Volume Traded = total simulated buy and sell dollars
```

## Editable ticker lists

Strategy 1 and Strategy 2 each have 30 editable ticker slots in the wallet Restart Menu.

Rules:

- Existing default ticker lists stay in place until changed by the user.
- Each strategy can have up to 30 ticker slots.
- Duplicate tickers within the same strategy are rejected.
- Tickers are normalized to uppercase.
- If the same ticker appears in both strategies, the backend uses one shared quote call.
- If one ticker slot is replaced, only that slot changes.

Replacement behavior:

```text
If a replaced ticker currently has a fake holding:
  Sell that old ticker's simulated shares.
  Use that simulated value to buy the new ticker.

If the new ticker's price is unavailable:
  Save the transferred value as a pending replacement buy.
```

## Sell-all scope

Sell-all always applies to a single ticker only.

Example:

```text
AAPL dips → sell all AAPL only.
MSFT, NVDA, GM, etc. are not sold because AAPL dipped.
```

## Market-hours protection

Fake buy/sell cycles run only during regular U.S. market core hours:

```text
Monday-Friday, 9:30 a.m. to 4:00 p.m. America/New_York time
```

Outside market hours:

- simulated trading is paused;
- manual run-cycle is disabled;
- wallet and viewer pages still show saved holdings/activity;
- display quotes can refresh slowly so the app shows latest close/quote values.

## Public viewer

The read-only viewer page is available at:

```text
/viewer
```

It shows strategy totals, market gain, volume traded, activity, holdings, and read-only ticker lists.
