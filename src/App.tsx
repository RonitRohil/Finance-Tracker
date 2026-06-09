/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard, useAuthSession } from "./components/AuthGuard";
import Layout from "./components/Layout";
import { useAppData } from "./hooks/useAppData";
import Dashboard from "./pages/Dashboard";
import BankAccounts from "./pages/BankAccounts";
import Investments from "./pages/Investments";
import Transactions from "./pages/Transactions";
import LoansTracker from "./pages/LoansTracker";
import Settings from "./pages/Settings";
import StockMappings from "./pages/StockMappings";
import { useAutoScheduler } from "./hooks/useAutoScheduler";
import { PortfolioData } from "./types";

function AppShell() {
  const { signOut } = useAuthSession();
  const { data, loading, syncing, lastSync, updateData, clearAllData, loadAll } = useAppData();
  const [activeTab, setActiveTab] = useState("dashboard");
  const validTabs = useMemo(() => new Set(["dashboard", "bank", "investments", "transactions", "loans", "stock-mappings", "settings"]), []);

  const getTabFromLocation = useCallback(() => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const hashTab = hash.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
    const params = new URLSearchParams(window.location.search);
    const queryTab = (params.get("p") || "").replace(/^\/+|\/+$/g, "");
    const candidate = hashTab || queryTab;
    return validTabs.has(candidate) ? candidate : "dashboard";
  }, [validTabs]);

  useEffect(() => {
    const initialTab = getTabFromLocation();
    setActiveTab(initialTab);

    if (new URLSearchParams(window.location.search).get("p")) {
      const nextHash = `#/${initialTab}`;
      window.history.replaceState({}, "", `${window.location.pathname}${nextHash}`);
    }

    const onHashChange = () => setActiveTab(getTabFromLocation());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [getTabFromLocation]);

  useEffect(() => {
    const nextHash = `#/${activeTab}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, [activeTab]);

  const patchData = useCallback((partial: Partial<PortfolioData>) => {
    updateData(partial);
  }, [updateData]);

  useAutoScheduler(data, patchData);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard data={data} setActiveTab={setActiveTab} />;
      case "bank":
        return <BankAccounts data={data} updateData={patchData} />;
      case "investments":
        return <Investments data={data} updateData={patchData} />;
      case "transactions":
        return <Transactions data={data} updateData={patchData} />;
      case "loans":
        return <LoansTracker data={data} updateData={patchData} />;
      case "stock-mappings":
        return <StockMappings data={data} updateData={patchData} />;
      case "settings":
        return (
          <Settings
            data={data}
            updateData={patchData}
            setActiveTab={setActiveTab}
            clearAllData={clearAllData}
          />
        );
      default:
        return <Dashboard data={data} setActiveTab={setActiveTab} />;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading your portfolio...
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} data={data} updateData={patchData} lastSync={lastSync} syncing={syncing} onSignOut={signOut} onRefresh={loadAll}>
      {renderContent()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  );
}
