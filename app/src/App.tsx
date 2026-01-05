import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { IssuesView } from './views/IssuesView';
import { SettingsView } from './views/SettingsView';
import { SolveView } from './views/SolveView';
import { WelcomeView } from './views/WelcomeView';
import { LinearProvider, useLinear } from './contexts/LinearContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';

type View = 'welcome' | 'issues' | 'solve' | 'settings';

function AppContent() {
  const [currentView, setCurrentView] = useState<View>('welcome');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const { settings, isLoading } = useSettings();
  const { isConnected } = useLinear();

  // Check if we need to show welcome/setup
  useEffect(() => {
    if (!isLoading) {
      if (!settings.linearApiKey) {
        setCurrentView('welcome');
      } else if (currentView === 'welcome') {
        setCurrentView('issues');
      }
    }
  }, [settings.linearApiKey, isLoading]);

  const handleSelectIssue = (issueId: string) => {
    setSelectedIssueId(issueId);
    setCurrentView('solve');
  };

  const handleBackToIssues = () => {
    setSelectedIssueId(null);
    setCurrentView('issues');
  };

  const renderView = () => {
    switch (currentView) {
      case 'welcome':
        return <WelcomeView onComplete={() => setCurrentView('issues')} />;
      case 'issues':
        return <IssuesView onSelectIssue={handleSelectIssue} />;
      case 'solve':
        return (
          <SolveView
            issueId={selectedIssueId}
            onBack={handleBackToIssues}
          />
        );
      case 'settings':
        return <SettingsView />;
      default:
        return <IssuesView onSelectIssue={handleSelectIssue} />;
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-linear-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-linear-purple/30 border-t-linear-purple rounded-full animate-spin" />
          <p className="text-linear-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-linear-gray-950">
      {/* Sidebar */}
      {currentView !== 'welcome' && (
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => {
            setSelectedIssueId(null);
            setCurrentView(view as View);
          }}
          isConnected={isConnected}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <LinearProvider>
        <AppContent />
      </LinearProvider>
    </SettingsProvider>
  );
}
