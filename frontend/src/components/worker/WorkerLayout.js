import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import useAuthStore from '../../context/authStore'
import { workerAPI, notificationsAPI } from '../../utils/api'
import toast from 'react-hot-toast'
import WorkerStatusControl from './WorkerStatusControl'

const NAV = [
  { href: '/worker/dashboard', label: 'Dashboard',  icon: '🏠' },
  { href: '/worker/tasks',     label: 'Tasks',      icon: '📋' },
  { href: '/worker/route',     label: 'Smart Route',icon: '🧭' },
  { href: '/worker/map',       label: 'Map',        icon: '🗺️' },
  { href: '/worker/history',   label: 'History',    icon: '🗂️' },
  { href: '/worker/performance', label: 'Performance', icon: '📊' },
  { href: '/worker/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/worker/profile',   label: 'Profile',    icon: '👤' },
]

const BOTTOM_NAV = [
  { href: '/worker/dashboard', label: 'Home',   icon: '🏠' },
  { href: '/worker/tasks',     label: 'Tasks',  icon: '📋' },
  { href: '/worker/route',     label: 'Route',  icon: '🧭' },
  { href: '/worker/map',       label: 'Map',    icon: '🗺️' },
  { href: '/worker/profile',   label: 'Profile',icon: '👤' },
]

export default function WorkerLayout({ children }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: unread = 0 } = useQuery({
    queryKey: ['worker-notif-count', user?._id],
    queryFn:  () => notificationsAPI.list({ limit: 1 }),
    select:   d => d.data?.unread_count || 0,
    refetchInterval: 60_000,
    enabled: Boolean(user?._id),
    retry: false,
  })

  const handleLogout = async () => {
    await logout()
    toast.success('Signed out')
    router.push('/login')
  }

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-gradient-to-b from-amber-700 to-amber-800 w-[260px] relative z-50 shadow-xl">
      <div className="px-5 py-5 border-b border-amber-600/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl">🛠️</div>
          <div>
            <div className="text-white font-bold text-base leading-none">SwachhaNet</div>
            <div className="text-amber-200 text-xs mt-0.5">Worker Field Ops</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 mx-3 mt-3 bg-white/10 rounded-xl border border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-amber-500 border-2 border-amber-300 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
            {user?.name?.[0] || 'W'}
          </div>
          <div className="min-w-0">
            <div className="text-white text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-amber-200 text-xs truncate">Field Crew</div>
          </div>
        </div>
      </div>

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

      <div className="px-3 py-3 border-t border-amber-600/50 space-y-0.5">
        <button onClick={handleLogout} className="nav-item nav-item-default w-full text-left">
          <span className="text-lg">🚪</span><span>Sign Out</span>
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <div className="hidden lg:flex flex-shrink-0 relative z-[60]">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 z-50">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 relative z-40 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden btn-ghost btn-sm p-2 rounded-lg">☰</button>
            <div className="hidden lg:block">
              <h1 className="text-base font-semibold text-slate-800">
                {NAV.find(n => router.pathname.startsWith(n.href))?.label || 'Worker Ops'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <WorkerStatusControl />
            <Link href="/worker/notifications" className="relative p-2 rounded-lg hover:bg-slate-100">
              <span className="text-lg">🔔</span>
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-semibold text-sm">
              {user?.name?.[0] || 'W'}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-20 lg:pb-6">
          <div className="max-w-7xl mx-auto p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-200 flex justify-around shadow-2xl">
        {BOTTOM_NAV.map(n => {
          const active = router.pathname === n.href || router.pathname.startsWith(n.href + '/')
          return (
            <Link key={n.href} href={n.href}
              className={`flex flex-col items-center py-2 px-3 text-[10px] font-semibold transition-colors ${active ? 'text-amber-700' : 'text-slate-400'}`}
            >
              <span className="text-lg leading-none">{n.icon}</span>
              <span className="mt-0.5">{n.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}