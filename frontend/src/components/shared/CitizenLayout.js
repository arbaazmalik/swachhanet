import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useAuthStore from '../../context/authStore'
import { useQuery } from '@tanstack/react-query'
import { notificationsAPI } from '../../utils/api'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'

const NAV = [
  { href: '/citizen/dashboard', label: 'Dashboard',   icon: '🏠' },
  { href: '/citizen/report',    label: 'Report Waste', icon: '📸' },
  { href: '/citizen/learn',     label: 'Learn',       icon: '📚' },
  { href: '/citizen/map',       label: 'Map & Centers',icon: '🗺️' },
  { href: '/citizen/complaints',label: 'My Reports',   icon: '📋' },
  { href: '/citizen/leaderboard',label: 'Leaderboard', icon: '🏆' },
]

const REPORT_ROUTE = '/citizen/report'

export default function CitizenLayout({ children }) {
  const router   = useRouter()
  const { user, logout, isAuthenticated } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const hasAccessToken = typeof window !== 'undefined' && !!Cookies.get('accessToken')

  const { data: unread = 0 } = useQuery({
    queryKey: ['notif-count', user?._id],
    queryFn:  () => notificationsAPI.list({ limit: 1 }),
    select:   d => d.data?.unread_count || 0,
    refetchInterval: 60_000,
    enabled: Boolean(user?._id && isAuthenticated && hasAccessToken),
    retry: false,
  })

  const handleLogout = async () => {
    await logout()
    toast.success('Signed out')
    router.push('/login')
  }

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-gradient-to-b from-green-800 to-green-900 w-[260px] relative z-50 shadow-xl">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-green-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl">🌿</div>
          <div>
            <div className="text-white font-bold text-base leading-none">SwachhaNet</div>
            <div className="text-green-300 text-xs mt-0.5">Citizen Portal</div>
          </div>
        </div>
      </div>

      {/* User card */}
      <div className="px-4 py-3 mx-3 mt-3 bg-white/10 rounded-xl border border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-green-600 border-2 border-green-400 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
            {user?.name?.[0] || 'U'}
          </div>
          <div className="min-w-0">
            <div className="text-white text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-green-300 text-xs truncate">{user?.wardName || 'Citizen'}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(n => {
          const active = router.pathname === n.href || router.pathname.startsWith(n.href + '/')
          return (
            <Link key={n.href} href={n.href}
              className={`nav-item ${active ? 'nav-item-active' : 'nav-item-default'}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-lg leading-none">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-green-700/50 space-y-0.5">
        {['authority', 'admin'].includes(user?.role) && (
          <Link href="/authority/dashboard" className="nav-item bg-blue-700/60 hover:bg-blue-600 text-white font-medium flex items-center gap-3">
            <span className="text-lg">🏛️</span><span>Authority Portal</span>
          </Link>
        )}
        <Link href="/citizen/notifications"
          className="nav-item nav-item-default flex items-center justify-between"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🔔</span>
            <span>Notifications</span>
          </div>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
        <Link href="/citizen/profile" className="nav-item nav-item-default">
          <span className="text-lg">👤</span><span>Profile</span>
        </Link>
        <button onClick={handleLogout} className="nav-item nav-item-default w-full text-left">
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

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 z-50">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header (mobile + desktop) */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 relative z-40 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden btn-ghost btn-sm p-2 rounded-lg">
              ☰
            </button>
            <div className="hidden lg:block">
              <h1 className="text-base font-semibold text-slate-800">
                {NAV.find(n => router.pathname.startsWith(n.href))?.label || 'SwachhaNet'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={REPORT_ROUTE}>
              <button className="btn-primary btn-sm hidden sm:flex">
                + Report Waste
              </button>
            </Link>
            <Link href="/citizen/notifications" className="relative p-2 rounded-lg hover:bg-slate-100">
              <span className="text-lg">🔔</span>
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {unread}
                </span>
              )}
            </Link>
            <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold text-sm">
              {user?.name?.[0] || 'U'}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
