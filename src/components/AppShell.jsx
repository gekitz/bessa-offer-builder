import { useState } from 'react';
import { FileText, Users, Settings, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';

// ═══════════════════════════════════════════════════════
// App Shell — Sidebar navigation layout
// ═══════════════════════════════════════════════════════

const NAV_ITEMS = [
  { id: 'angebote', label: 'Angebote', icon: FileText },
  { id: 'crm', label: 'CRM', icon: Users },
];

export default function AppShell({ activeSection, onNavigate, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { profile, logout } = useAuth();

  const displayName = profile?.display_name || profile?.microsoft_email?.split('@')[0] || '';

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", height: '100vh', display: 'flex', background: '#f1f5f9' }}>
      {/* ── Sidebar ── */}
      <aside
        className="no-print flex flex-col border-r border-slate-200 bg-white transition-all duration-200 flex-shrink-0"
        style={{ width: collapsed ? 64 : 220 }}
      >
        {/* Logo / Brand */}
        <div
          className="flex items-center gap-2.5 border-b border-slate-100 flex-shrink-0"
          style={{ padding: collapsed ? '16px 12px' : '16px 16px', minHeight: 64 }}
        >
          <div
            className="flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 text-white font-bold rounded-lg flex-shrink-0"
            style={{ width: 36, height: 36, fontSize: 12 }}
          >
            KITZ
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-bold text-slate-800 truncate" style={{ fontSize: 14, letterSpacing: '-0.3px' }}>KITZ CRM</div>
              <div className="text-slate-400 truncate" style={{ fontSize: 10 }}>bessa Kassa & Module</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3" style={{ padding: collapsed ? '12px 8px' : '12px' }}>
          <div className="space-y-1">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-red-50 text-red-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                  style={{
                    padding: collapsed ? '10px 0' : '10px 12px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    fontSize: 13,
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className={isActive ? 'text-red-500' : 'text-slate-400'} />
                  {!collapsed && (
                    <span className={`font-medium ${isActive ? 'text-red-600' : ''}`}>{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Footer: user + collapse */}
        <div className="border-t border-slate-100 flex-shrink-0" style={{ padding: collapsed ? '12px 8px' : '12px' }}>
          {/* User info */}
          {!collapsed && displayName && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div
                className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-slate-600 truncate" style={{ fontSize: 12, fontWeight: 500 }}>{displayName}</div>
              </div>
              <button
                onClick={logout}
                className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                title="Abmelden"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
          {collapsed && (
            <button
              onClick={logout}
              className="w-full flex justify-center text-slate-300 hover:text-red-500 transition-colors mb-2"
              title="Abmelden"
            >
              <LogOut size={16} />
            </button>
          )}

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            style={{ padding: '8px 0', fontSize: 11 }}
          >
            {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Einklappen</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
