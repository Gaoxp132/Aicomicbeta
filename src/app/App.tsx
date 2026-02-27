/**
 * AI漫剧 - 主应用组件
 * v6.0.132 - vite.config.ts optimizeDeps fix for motion/framer-motion resolution
 */

import React, { useState, useCallback, lazy, Suspense, useEffect } from 'react';
import { Toaster } from 'sonner';

// Core components (loaded eagerly for first paint)
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { MobileBottomBar } from './components/MobileBottomBar';
import { EdgeFunctionError, ServerLoadingIndicator } from './components/ServerStatus';

// v6.0.127: SeriesCreationPanel loaded eagerly — dynamic import() fails through Figma proxy
// because Vite's on-demand transform of the deep motion/react→framer-motion chain
// through pnpm virtual store times out or returns 500 under the proxy.
import { SeriesCreationPanel } from './components/SeriesCreationPanel';

// Hooks
import { useAuth, useEdgeFunctionStatus } from './hooks';
import { useAdminPaymentPoller } from './hooks/useAdminPaymentPoller';

// Event bus
import { onQuotaExceeded, type QuotaExceededInfo } from './utils/events';

// Types
import type { Series, Comic } from './types';

// ── Lazy-loaded tab panels (code-split) ─────────────────────────────
const HomeCreationPanel = lazy(() =>
  import('./components/HomeCreationPanel').then(m => ({ default: m.HomeCreationPanel }))
);
const CommunityPanel = lazy(() =>
  import('./components/CommunityPanel').then(m => ({ default: m.CommunityPanel }))
);
const ProfilePanel = lazy(() =>
  import('./components/ProfilePanel').then(m => ({ default: m.ProfilePanel }))
);
const LoginDialog = lazy(() =>
  import('./components/LoginDialog').then(m => ({ default: m.LoginDialog }))
);
const SettingsDialog = lazy(() =>
  import('./components/SettingsDialog').then(m => ({ default: m.SettingsDialog }))
);
const ImmersiveVideoViewer = lazy(() =>
  import('./components/ImmersiveVideoViewer').then(m => ({ default: m.ImmersiveVideoViewer }))
);
const PaymentDialog = lazy(() =>
  import('./components/PaymentDialog').then(m => ({ default: m.PaymentDialog }))
);
const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then(m => ({ default: m.AdminPanel }))
);

// ── Types ────────────────────────────────────────────────────────────
type TabId = 'create' | 'works' | 'community' | 'profile';

// ── Loading fallback ─────────────────────────────────────────────────
function TabLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        <span className="text-sm text-gray-500">加载中...</span>
      </div>
    </div>
  );
}

const ADMIN_PHONE = '18565821136';

// ── Main App ─────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ──
  const {
    userPhone,
    showLoginDialog,
    setShowLoginDialog,
    handleLoginSuccess,
    handleLogout,
  } = useAuth();

  // ── Server status ──
  const {
    isConnected,
    isChecking,
    showError,
    dismissError,
    retry,
    deployStatus,
    fetchDeployVerify,
    isFallbackMode,
    fallbackError,
  } = useEdgeFunctionStatus();

  // ── Navigation ──
  const [activeTab, setActiveTab] = useState<TabId>('create');

  // ── Series editing (Home → Works navigation) ──
  const [editSeries, setEditSeries] = useState<Series | null>(null);

  // ── Immersive video viewer ──
  const [selectedComic, setSelectedComic] = useState<Comic | null>(null);
  const [selectedComicsList, setSelectedComicsList] = useState<Comic[]>([]);

  // ── Settings ──
  const [showSettings, setShowSettings] = useState(false);

  // ── v6.0.96: Payment Dialog ──
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<QuotaExceededInfo | undefined>(undefined);

  // ── v6.0.96: Admin Panel ──
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminPanelDefaultTab, setAdminPanelDefaultTab] = useState<'users' | 'payments' | 'settings'>('users');
  const isAdmin = userPhone === ADMIN_PHONE;

  // ── v6.0.102: Admin payment poller (only active when admin is logged in) ──
  const { pendingCount: pendingPaymentCount, notifPermission, requestPermission } = useAdminPaymentPoller(
    isAdmin ? userPhone : null,
    // onNewPayments: open AdminPanel to payments tab
    (count) => {
      setAdminPanelDefaultTab('payments');
      setShowAdminPanel(true);
    }
  );

  // ── Listen to global quota-exceeded events ──
  useEffect(() => {
    return onQuotaExceeded((info) => {
      setQuotaInfo(info);
      setShowPaymentDialog(true);
    });
  }, []);

  // ── Handlers ──
  const handleTabChange = useCallback((tab: TabId) => {
    if (tab === 'profile' && !userPhone) {
      setShowLoginDialog(true);
      return;
    }
    setActiveTab(tab);
  }, [userPhone, setShowLoginDialog]);

  const handleSeriesCreated = useCallback((series: Series) => {
    setEditSeries(series);
    setActiveTab('works');
  }, []);

  const handleEditSeries = useCallback((series: Series) => {
    setEditSeries(series);
    setActiveTab('works');
  }, []);

  const handleSelectComic = useCallback((comic: Comic, comicsList?: Comic[]) => {
    setSelectedComic(comic);
    setSelectedComicsList(comicsList || []);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setSelectedComic(null);
    setSelectedComicsList([]);
  }, []);

  const handleSeriesDeleted = useCallback((_seriesId: string) => {
    // Clean up if the deleted series was being edited
    if (editSeries?.id === _seriesId) {
      setEditSeries(null);
    }
  }, [editSeries]);

  // Clear editSeries when navigating away from works
  const handleTabChangeWithCleanup = useCallback((tab: TabId) => {
    if (tab !== 'works') {
      setEditSeries(null);
    }
    handleTabChange(tab);
  }, [handleTabChange]);

  return (
    <ErrorBoundary>
      <div className="dark min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white">
        {/* Toast notifications — bottom-right to avoid blocking header nav on desktop */}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: '#1e1e2e', border: '1px solid #313244', color: '#cdd6f4' },
          }}
        />

        {/* Server status indicators */}
        <ServerLoadingIndicator isChecking={isChecking} isConnected={isConnected} />
        <EdgeFunctionError
          showError={showError}
          dismissError={dismissError}
          onRetry={retry}
          deployStatus={deployStatus}
          onFetchDeployVerify={fetchDeployVerify}
          isFallbackMode={isFallbackMode}
          fallbackError={fallbackError}
        />

        {/* Header - desktop navigation */}
        <Header
          activeTab={activeTab}
          onTabChange={handleTabChangeWithCleanup}
          userPhone={userPhone}
          onLoginClick={() => setShowLoginDialog(true)}
          onSettingsClick={() => setShowSettings(true)}
          onAdminClick={isAdmin ? () => { setAdminPanelDefaultTab('users'); setShowAdminPanel(true); } : undefined}
          pendingPaymentCount={isAdmin ? pendingPaymentCount : 0}
        />

        {/* Main content area */}
        <main className="pt-16 pb-20 lg:pb-6 min-h-screen">
          <Suspense fallback={<TabLoader />}>
            {activeTab === 'create' && (
              <HomeCreationPanel
                userPhone={userPhone}
                onSeriesCreated={handleSeriesCreated}
                onShowLogin={() => setShowLoginDialog(true)}
                onEditSeries={handleEditSeries}
              />
            )}

            {activeTab === 'works' && (
              <SeriesCreationPanel
                userPhone={userPhone}
                initialSeries={editSeries}
                onBack={() => {
                  setEditSeries(null);
                  setActiveTab('create');
                }}
                onSeriesDeleted={handleSeriesDeleted}
              />
            )}

            {activeTab === 'community' && (
              <CommunityPanel
                onSelectComic={handleSelectComic}
                userPhone={userPhone}
              />
            )}

            {activeTab === 'profile' && userPhone && (
              <ProfilePanel
                userPhone={userPhone}
                onSelectComic={handleSelectComic}
                onLogout={handleLogout}
                onOpenPayment={() => setShowPaymentDialog(true)}
                onOpenAdmin={isAdmin ? () => setShowAdminPanel(true) : undefined}
              />
            )}
          </Suspense>
        </main>

        {/* Mobile bottom navigation */}
        <MobileBottomBar
          activeTab={activeTab}
          onTabChange={handleTabChangeWithCleanup}
          userPhone={userPhone}
          onLoginClick={() => setShowLoginDialog(true)}
        />

        {/* Overlays & Dialogs */}
        <Suspense fallback={null}>
          {showLoginDialog && (
            <LoginDialog
              isOpen={showLoginDialog}
              onClose={() => setShowLoginDialog(false)}
              onLoginSuccess={handleLoginSuccess}
            />
          )}

          {showSettings && (
            <SettingsDialog
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
              userPhone={userPhone}
              onLogout={handleLogout}
            />
          )}

          {selectedComic && (
            <ImmersiveVideoViewer
              work={selectedComic}
              allWorks={selectedComicsList}
              userPhone={userPhone}
              onClose={handleCloseViewer}
            />
          )}

          {/* v6.0.96: Payment Dialog — triggered when daily quota is exceeded */}
          {showPaymentDialog && userPhone && (
            <PaymentDialog
              isOpen={showPaymentDialog}
              onClose={() => setShowPaymentDialog(false)}
              userPhone={userPhone}
              quotaInfo={quotaInfo}
              onPaymentRecorded={() => {
                // After recording payment intent, user can close and admin will add credits
              }}
            />
          )}

          {/* v6.0.96: Admin Panel — only for admin account */}
          {showAdminPanel && isAdmin && (
            <AdminPanel
              adminPhone={ADMIN_PHONE}
              onClose={() => setShowAdminPanel(false)}
              defaultTab={adminPanelDefaultTab}
              onRequestNotifPermission={requestPermission}
              notifPermission={notifPermission}
            />
          )}
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}