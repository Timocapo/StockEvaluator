import fs from "fs";
import path from "path";

const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
const DATA_DIR = process.env.PAPER_TRADING_DATA_DIR || DEFAULT_DATA_DIR;
const WALLET_FILE = path.join(DATA_DIR, "wallet.json");

const DEFAULT_WALLET = {
  startingCash: 1000,
  cash: 1000,
  holdings: {},
  tradeHistory: [],
  equityHistory: [
    {
      timestamp: new Date().toISOString(),
      value: 1000,
    },
  ],
};

export let wallet = loadWallet();

export function loadWallet() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(WALLET_FILE)) {
      fs.writeFileSync(
        WALLET_FILE,
        JSON.stringify(DEFAULT_WALLET, null, 2)
      );

      return structuredClone(DEFAULT_WALLET);
    }

    const raw = fs.readFileSync(WALLET_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to load wallet file:", error.message);
    return structuredClone(DEFAULT_WALLET);
  }
}

export function saveWallet() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    fs.writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2));
  } catch (error) {
    console.error("Failed to save wallet file:", error.message);
  }
}

export function resetWallet() {
  wallet = structuredClone(DEFAULT_WALLET);
  saveWallet();
  return wallet;
}

export function getPortfolioValue(livePrices = {}) {
  let holdingsValue = 0;

  for (const ticker in wallet.holdings) {
    const holding = wallet.holdings[ticker];
    const currentPrice = livePrices[ticker] || 0;
    holdingsValue += holding.shares * currentPrice;
  }

  return wallet.cash + holdingsValue;
}