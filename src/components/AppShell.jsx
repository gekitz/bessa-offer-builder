import { useState } from 'react';
import { Calendar, FileText, Headphones, Users, Settings, ChevronLeft, ChevronRight, LogOut, Menu, Package, Wrench, X } from 'lucide-react';
import { useAuth } from '../lib/auth';

// ═══════════════════════════════════════════════════════
// App Shell — Responsive sidebar + mobile bottom nav
// ═══════════════════════════════════════════════════════

const NAV_ITEMS = [
  { id: 'dispatcher', label: 'Leitstelle', icon: Headphones },
  { id: 'angebote',   label: 'Angebote',   icon: FileText },
  { id: 'crm',        label: 'CRM',        icon: Users },
  { id: 'kalender',   label: 'Kalender',   icon: Calendar },
  { id: 'tickets',    label: 'Tickets',    icon: Wrench },
  { id: 'produkte',   label: 'Produkte',   icon: Package, adminOnly: true },
];

export default function AppShell({
  activeSection,
  onNavigate,
  showBillingToggle = false,
  billingToggle = false,
  onToggleBilling,
  // Per-section badge counts. Consumed by `kalender` (pending leave
  // approvals) and `tickets` (open assigned tickets). The shape lets
  // us add more later. A 0 / undefined count renders no badge.
  badges = {},
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { profile, logout } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const navItems = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);

  const displayName = profile?.display_name || profile?.microsoft_email?.split('@')[0] || '';

  return (
    <div style={{
      fontFamily: "'DM Sans', system-ui, sans-serif",
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f1f5f9',
      // iOS PWA in standalone mode paints content under the status
      // bar (black-translucent + viewport-fit=cover). Push the whole
      // shell down by the OS-reported inset so the title row clears
      // the clock/battery overlay.
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>

      {/* ── Desktop layout: sidebar + content side by side ── */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Sidebar (desktop only) */}
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
                <div className="font-bold text-slate-800 truncate" style={{ fontSize: 14, letterSpacing: '-0.3px' }}>KITZ Workspace</div>
                <div className="text-slate-400 truncate" style={{ fontSize: 10 }}>Angebote · CRM · Kalender · Tickets</div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-3" style={{ padding: collapsed ? '12px 8px' : '12px' }}>
            <div className="space-y-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                const badgeCount = badges[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`relative w-full flex items-center gap-2.5 rounded-lg transition-all ${
                      isActive
                        ? 'bg-red-50 text-red-600'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                    style={{
                      padding: collapsed ? '10px 0' : '10px 12px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      fontSize: 13,
                    }}
                    title={collapsed && badgeCount ? `${item.label} (${badgeCount})` : (collapsed ? item.label : undefined)}
                  >
                    <span className="relative inline-flex">
                      <Icon size={18} className={isActive ? 'text-red-500' : 'text-slate-400'} />
                      {collapsed && badgeCount > 0 && (
                        <span
                          data-testid={`nav-badge-${item.id}`}
                          className="absolute -top-1 -right-1.5 bg-red-500 text-white rounded-full font-semibold flex items-center justify-center"
                          style={{ minWidth: 14, height: 14, fontSize: 9, padding: '0 3px' }}
                        >
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </span>
                    {!collapsed && (
                      <span className={`font-medium ${isActive ? 'text-red-600' : ''}`}>{item.label}</span>
                    )}
                    {!collapsed && badgeCount > 0 && (
                      <span
                        data-testid={`nav-badge-${item.id}`}
                        className="ml-auto bg-red-500 text-white rounded-full font-semibold flex items-center justify-center"
                        style={{ minWidth: 18, height: 18, fontSize: 10, padding: '0 6px' }}
                      >
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Footer: user + collapse */}
          <div className="border-t border-slate-100 flex-shrink-0" style={{ padding: collapsed ? '12px 8px' : '12px' }}>
            {showBillingToggle && !collapsed && (
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-slate-500" style={{ fontSize: 11, fontWeight: 500 }}>Stripe-Integration</span>
                <button
                  onClick={() => onToggleBilling?.(!billingToggle)}
                  className={`relative inline-flex items-center rounded-full transition-colors ${billingToggle ? 'bg-red-500' : 'bg-slate-300'}`}
                  style={{ width: 32, height: 18 }}
                  title={billingToggle ? 'Stripe-Integration aktiv' : 'Stripe-Integration aus'}
                >
                  <span
                    className="inline-block bg-white rounded-full shadow"
                    style={{
                      width: 14, height: 14,
                      transform: billingToggle ? 'translateX(15px)' : 'translateX(2px)',
                      transition: 'transform 120ms ease',
                    }}
                  />
                </button>
              </div>
            )}
            {showBillingToggle && collapsed && (
              <button
                onClick={() => onToggleBilling?.(!billingToggle)}
                className={`w-full flex justify-center mb-3 transition-colors ${billingToggle ? 'text-red-500 hover:text-red-600' : 'text-slate-300 hover:text-slate-500'}`}
                title={billingToggle ? 'Stripe-Integration aktiv' : 'Stripe-Integration aus'}
              >
                <span
                  className={`inline-block rounded-full ${billingToggle ? 'bg-red-500' : 'bg-slate-300'}`}
                  style={{ width: 10, height: 10 }}
                />
              </button>
            )}
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
                  {profile?.microsoft_email && (
                    <div className="text-slate-400 truncate" style={{ fontSize: 10 }}>{profile.microsoft_email}</div>
                  )}
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
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
              style={{ padding: '8px 0', fontSize: 11 }}
            >
              {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Einklappen</span></>}
            </button>
          </div>
        </aside>

        {/* Desktop main content */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>

      {/* ── Mobile layout: content + bottom tab bar ── */}
      <div className="flex md:hidden flex-col flex-1 min-h-0">
        {/* Mobile main content */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {children}
        </main>

        {/* Bottom tab bar */}
        <nav className="no-print flex-shrink-0 border-t border-slate-200 bg-white flex items-center justify-around safe-bottom"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const badgeCount = badges[item.id];
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                  isActive ? 'text-red-600' : 'text-slate-400'
                }`}
              >
                <span className="relative inline-flex">
                  <Icon size={20} className={isActive ? 'text-red-500' : 'text-slate-400'} />
                  {badgeCount > 0 && (
                    <span
                      data-testid={`nav-badge-mobile-${item.id}`}
                      className="absolute -top-1 -right-2 bg-red-500 text-white rounded-full font-semibold flex items-center justify-center"
                      style={{ minWidth: 14, height: 14, fontSize: 9, padding: '0 3px' }}
                    >
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
              </button>
            );
          })}
          {/* Logout button in tab bar */}
          <button
            onClick={logout}
            className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-slate-400 transition-colors"
          >
            <LogOut size={20} />
            <span style={{ fontSize: 10 }}>Abmelden</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
