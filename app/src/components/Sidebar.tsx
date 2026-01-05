import React from 'react';
import {
  LayoutList,
  Settings,
  Zap,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isConnected: boolean;
}

export function Sidebar({ currentView, onNavigate, isConnected }: SidebarProps) {
  const navItems = [
    { id: 'issues', label: 'Issues', icon: LayoutList },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 h-full bg-linear-gray-900 border-r border-linear-gray-800 flex flex-col">
      {/* Drag region for window */}
      <div className="h-12 drag-region" />

      {/* Logo */}
      <div className="px-4 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-linear-purple to-linear-blue flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-linear-gray-100">Linear Claude</h1>
            <p className="text-xs text-linear-gray-500">AI Issue Solver</p>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="px-4 mb-6">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          isConnected ? 'bg-green-500/10' : 'bg-red-500/10'
        }`}>
          {isConnected ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-400">Connected to Linear</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-400">Not Connected</span>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id)}
                  className={`no-drag w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-linear-purple/20 text-linear-purple'
                      : 'text-linear-gray-400 hover:text-linear-gray-100 hover:bg-linear-gray-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-linear-gray-800">
        <p className="text-xs text-linear-gray-600 text-center">
          v1.0.0 • Made with Claude
        </p>
      </div>
    </aside>
  );
}
