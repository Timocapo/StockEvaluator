import { useState } from "react";
import Dashboard from "./pages/Dashboard.jsx";
import MyWallet from "./pages/MyWallet.jsx";
import WalletViewer from "./pages/WalletViewer.jsx";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, "");

  if (path === "/viewer" || path === "/public" || path === "/progress") {
    return <WalletViewer />;
  }

  return (
    <>
      <nav className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 gap-3 rounded-full border border-white/10 bg-slate-950/80 p-2 backdrop-blur">
        <button
          onClick={() => setPage("dashboard")}
          className={`rounded-full px-5 py-2 font-bold ${
            page === "dashboard"
              ? "bg-cyan-400 text-slate-950"
              : "text-slate-300 hover:bg-white/10"
          }`}
        >
          Dashboard
        </button>

        <button
          onClick={() => setPage("wallet")}
          className={`rounded-full px-5 py-2 font-bold ${
            page === "wallet"
              ? "bg-cyan-400 text-slate-950"
              : "text-slate-300 hover:bg-white/10"
          }`}
        >
          My Wallet
        </button>
      </nav>

      <div className="pt-20">
        {page === "dashboard" ? <Dashboard /> : <MyWallet />}
      </div>
    </>
  );
}