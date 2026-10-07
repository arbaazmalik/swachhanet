import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { complaintsAPI, gamificationAPI, notificationsAPI, learningAPI, userAPI } from '../../utils/api'
import useAuthStore from '../../context/authStore'
import CitizenLayout from '../../components/shared/CitizenLayout'
import { StatCard, SectionCard, Badge, PriorityBadge, PageLoader } from '../../components/ui'
import { formatDistanceToNow } from 'date-fns'

const CATEGORY_COLORS = {
  segregation: 'bg-emerald-100 text-emerald-700',
  recycling:   'bg-blue-100   text-blue-700',
  recycle:     'bg-blue-100   text-blue-700',
  composting:  'bg-orange-100 text-orange-700',
  plastic:     'bg-fuchsia-100 text-fuchsia-700',
  awareness:   'bg-amber-100  text-amber-700',
}

const ISSUE_EMOJI = {
  full_dustbin: '🗑️', illegal_dumping: '⚠️', burning_waste: '🔥',
  missed_collection: '🚛', overflowing_bin: '💧', other: '📍',
}

const QUICK_ACTIONS = [
  { href: '/citizen/report', icon: '📸', label: 'Report Issue', color: 'bg-green-50 hover:bg-green-100 border-green-100' },
  { href: '/citizen/learn', icon: '📚', label: 'Learn', color: 'bg-purple-50 hover:bg-purple-100 border-purple-100' },
  { href: '/citizen/map', icon: '🗺️', label: 'Find Centers', color: 'bg-blue-50 hover:bg-blue-100 border-blue-100' },
  { href: '/citizen/leaderboard', icon: '🏆', label: 'Leaderboard', color: 'bg-amber-50 hover:bg-amber-100 border-amber-100' },
]

export default function CitizenDashboard() {
  const { user } = useAuthStore()

  const { data: complaintsData, isLoading } = useQuery({
    queryKey: ['my-complaints'],
    queryFn:  () => complaintsAPI.list({ limit: 8 }),
    select:   d => d.data,
  })

  const { data: g } = useQuery({
    queryKey: ['gamification-me'],
    queryFn:  () => gamificationAPI.me(),
    select:   d => d.data,
  })

  const { data: notifications } = useQuery({
    queryKey: ['dashboard-notifications'],
    queryFn: () => notificationsAPI.list({ limit: 3 }),
    select: d => d.data,
  })

  const { data: learningProgress } = useQuery({
    queryKey: ['user-progress-dash'],
    queryFn: () => userAPI.progress(),
    select: d => d.data,
  })

  const { data: modulesData } = useQuery({
    queryKey: ['learning-modules-dash'],
    queryFn: () => learningAPI.modules(),
    select: d => d.data,
  })

  const LEVEL_NAMES = ['','Eco Beginner','Green Citizen','Eco Warrior','Waste Champion','Eco Hero','Planet Guardian']
  const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2500]
  const level = g?.level || 1
  const points = g?.totalPoints || 0
  const nextThreshold = LEVEL_THRESHOLDS[level] || 2500
  const prevThreshold = LEVEL_THRESHOLDS[level - 1] || 0
  const progress = nextThreshold > prevThreshold
    ? Math.min(100, Math.round(((points - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
    : 100

  const complaints = complaintsData?.data || []
  const resolved   = complaints.filter(c => c.status === 'resolved').length
  const notificationItems = notifications?.notifications || []
  const unreadNotifications = notifications?.unread_count || 0

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-6 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Hello, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="text-green-100 text-sm mt-1">{user?.wardName || 'Your Ward'} · {user?.city || 'India'}</p>
          </div>
          <Link href="/citizen/report">
            <button className="btn bg-white text-green-700 hover:bg-green-50 font-semibold shadow-sm">
              + Report Waste Issue
            </button>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Reports Filed"    value={g?.reportsCount || 0} icon="📸" color="green" />
        <StatCard label="Resolved"         value={resolved}             icon="✅" color="blue"  />
        <StatCard label="Eco Points"       value={points.toLocaleString()} icon="⭐" color="amber" />
        <StatCard label="Current Level"    value={`Level ${level}`}     icon="🏆" color="purple" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent complaints - takes 2 cols */}
        <div className="xl:col-span-2">
          <SectionCard
            title="My Recent Reports"
            subtitle="Track the status of your submitted complaints"
            action={
              <Link href="/citizen/complaints">
                <button className="btn-secondary btn-sm">View All</button>
              </Link>
            }
          >
            {isLoading ? (
              <PageLoader />
            ) : complaints.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <div className="text-4xl mb-3">📭</div>
                <p className="font-medium text-slate-600">No reports yet</p>
                <p className="text-sm mt-1">Start by reporting a waste issue in your area</p>
                <Link href="/citizen/report">
                  <button className="btn-primary mt-4">Report Now</button>
                </Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Issue</th>
                      <th>Location</th>
                      <th>Priority</th>
                      <th>AI Detected</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complaints.map(c => (
                      <tr key={c._id}
                        className="cursor-pointer"
                        onClick={() => window.location.href = `/citizen/complaints/${c._id}`}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{ISSUE_EMOJI[c.issueType] || '📍'}</span>
                            <span className="font-medium capitalize">{c.issueType.replace(/_/g, ' ')}</span>
                          </div>
                        </td>
                        <td>
                          <span className="text-slate-500 text-xs max-w-[180px] truncate block">
                            {c.address || 'Location captured'}
                          </span>
                        </td>
                        <td><PriorityBadge priority={c.priority} /></td>
                        <td>
                          {c.aiResult?.wasteType
                            ? <span className="text-green-700 font-medium capitalize text-xs">{c.aiResult.wasteType}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td><Badge status={c.status} /></td>
                        <td className="text-slate-400 text-xs whitespace-nowrap">
                          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Eco progress card */}
          <div className="card p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-green-800">Level {level} — {LEVEL_NAMES[level] || 'Master'}</p>
                <p className="text-xs text-green-600 mt-0.5">{points.toLocaleString()} / {nextThreshold.toLocaleString()} pts</p>
              </div>
              <span className="text-3xl">🌱</span>
            </div>
            <div className="w-full bg-green-200 rounded-full h-2.5 mb-3">
              <div className="h-2.5 bg-green-600 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(g?.badges || []).slice(0, 4).map(b => (
                <span key={b} className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200 font-medium">
                  {b.replace(/_/g, ' ')}
                </span>
              ))}
              {(g?.badges?.length || 0) > 4 && (
                <span className="text-xs text-green-500">+{g.badges.length - 4} more</span>
              )}
            </div>
            {(g?.streakDays || 0) > 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-amber-600 font-medium">
                🔥 {g.streakDays}-day streak!
              </div>
            )}
          </div>

          {/* Quick actions */}
          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-2 gap-2 p-4">
              {QUICK_ACTIONS.map(a => (
                <Link key={a.href} href={a.href}>
                  <div className={`p-3 rounded-xl border ${a.color} text-center cursor-pointer transition-all`}>
                    <div className="text-2xl mb-1">{a.icon}</div>
                    <div className="text-xs font-semibold text-slate-700">{a.label}</div>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Notifications"
            subtitle={unreadNotifications > 0 ? `${unreadNotifications} unread updates` : 'Latest updates from your account'}
            action={<Link href="/citizen/notifications"><button className="btn-secondary btn-sm">Open</button></Link>}
          >
            <div className="p-4 space-y-3">
              {notificationItems.map((item) => (
                <div key={item._id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                    {!item.isRead && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  {item.body && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{item.body}</div>}
                </div>
              ))}
              {!notificationItems.length && (
                <div className="text-sm text-slate-400 text-center py-4">No notifications yet.</div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Learning Modules Section */}
      <SectionCard
        title="📚 Learning Modules"
        subtitle="Complete lessons to earn eco points and badges"
        action={
          <Link href="/citizen/learn">
            <button className="btn-secondary btn-sm">View All →</button>
          </Link>
        }
      >
        {/* Progress bar */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span className="font-medium text-slate-700">
              {learningProgress?.completedModules || 0} / {learningProgress?.totalModules || 0} modules completed
            </span>
            <span className="font-bold text-green-600">{learningProgress?.completionPercentage || 0}%</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-700"
              style={{ width: `${learningProgress?.completionPercentage || 0}%` }}
            />
          </div>
        </div>

        {/* Module previews */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 pt-3">
          {(modulesData?.modules || []).slice(0, 3).map(mod => (
            <Link key={mod.id} href={`/citizen/learn/${mod.id}`}>
              <div className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                mod.completed ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100 hover:border-green-300'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                    CATEGORY_COLORS[mod.category] || 'bg-slate-100 text-slate-600'
                  }`}>
                    {(mod.category || 'lesson').replace(/_/g, ' ')}
                  </span>
                  {mod.completed && <span className="text-green-500 text-xs">✅</span>}
                </div>
                <h4 className="text-sm font-semibold text-slate-800 line-clamp-2 mb-1">{mod.title}</h4>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-slate-400">{mod.durationMins || 3} min</span>
                  <span className="text-[10px] font-bold text-green-600">+{mod.pointsReward || 10} pts</span>
                </div>
              </div>
            </Link>
          ))}
          {!(modulesData?.modules?.length) && (
            <div className="col-span-3 text-center py-6 text-slate-400 text-sm">No modules available yet.</div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

CitizenDashboard.getLayout = page => <CitizenLayout>{page}</CitizenLayout>
