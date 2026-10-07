import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useAuthStore from '../../context/authStore'
import toast from 'react-hot-toast'

const NAV = [
  { href: '/authority/dashboard',  label: 'Overview',      icon: '📊' },
  { href: '/authority/complaints', label: 'Complaints',     icon: '📋', badge: 'urgent' },
  { href: '/authority/hotspots',   label: 'Hotspots',       icon: '🔥' },
  { href: '/authority/workforce',  label: 'Workforce',      icon: '👷' },
  { href: '/authority/analytics',  label: 'Analytics',      icon: '📈' },
  { href: '/authority/reports',    label: 'Reports',        icon: '📄' },
]

const BOTTOM_NAV = [
  { href: '/citizen/dashboard', label: 'Citizen View', icon: '👤' },
  { href: '/authority/settings', label: 'Settings', icon: '⚙️' },
]

export default function AuthorityLayout({ children, urgentCount = 0 }) {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    toast.success('Signed out')
    router.push('/login')
  }

  const Sidebar = () => (
    <aside className="flex flex-col h-full w-[260px] bg-slate-900 relative z-50">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl">🌿</div>
          <div>
            <div className="text-white font-bold text-base leading-none">SwachhaNet</div>
            <div className="text-slate-400 text-xs mt-0.5">Authority Dashboard</div>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="px-4 py-3 mx-3 mt-3 bg-slate-800 rounded-xl border border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
            {user?.name?.[0] || 'A'}
          </div>
          <div className="min-w-0">
            <div className="text-white text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-slate-400 text-xs truncate">{user?.wardName || 'All Wards'} · {user?.city}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">Management</p>
        {NAV.map(n => {
          const active = router.pathname === n.href || router.pathname.startsWith(n.href + '/')
          return (
            <Link key={n.href} href={n.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer
                ${active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              onClick={() => setSidebarOpen(false)}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg leading-none">{n.icon}</span>
                <span>{n.label}</span>
              </div>
              {n.badge === 'urgent' && urgentCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold min-w-[20px] text-center">
                  {urgentCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-slate-700/60 space-y-0.5">
        {BOTTOM_NAV.map(n => (
          <Link key={n.href} href={n.href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
          >
            <span className="text-lg">{n.icon}</span><span>{n.label}</span>
          </Link>
        ))}
        <button onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-all"
        >
          <span className="text-lg">🚪</span><span>Sign Out</span>
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0 relative z-[60]">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 z-50"><Sidebar /></div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 relative z-40 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden btn-ghost btn-sm p-2">☰</button>
            <div>
              <span className="text-base font-semibold text-slate-800 hidden lg:block">
                {NAV.find(n => router.pathname.startsWith(n.href))?.label || 'Dashboard'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live monitoring
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
              {user?.name?.[0] || 'A'}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
