import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { reportsAPI, complaintsAPI, workersAPI, aiAPI } from '../../utils/api'
import useAuthStore from '../../context/authStore'
import AuthorityLayout from '../../components/authority/AuthorityLayout'
import { StatCard, SectionCard, Badge, Tabs } from '../../components/ui'
import TrendChart from '../../components/authority/TrendChart'
import { formatDistanceToNow } from 'date-fns'

const HeatMap = dynamic(() => import('../../components/authority/HeatMap'), { ssr: false })
const LeafletMap = dynamic(() => import('../../components/shared/LeafletMap'), { ssr: false })

const ISSUE_EMOJI = { full_dustbin:'🗑️', illegal_dumping:'⚠️', burning_waste:'🔥', missed_collection:'🚛', overflowing_bin:'💧', other:'📍' }

const WORKER_STATUS = {
  available: { dot: 'dot-green', label: 'Available',  cls: 'badge-resolved' },
  busy:      { dot: 'dot-amber', label: 'On Task',    cls: 'badge-pending'  },
  break:     { dot: 'dot-gray',  label: 'Break',      cls: 'badge-gray'     },
  offline:   { dot: 'dot-gray',  label: 'Offline',    cls: 'badge-gray'     },
}

export default function AuthorityDashboard() {
  const { user } = useAuthStore()
  const [period, setPeriod] = useState('today')
  const [userLoc, setUserLoc]     = useState(null)
  const [locating, setLocating]   = useState(false)

  useEffect(() => {
    // Default to ward centroid if available, then fall back to Pune
    const defaultLat = user?.wardLat || 18.5204
    const defaultLng = user?.wardLng || 73.8567
    setUserLoc({ lat: defaultLat, lng: defaultLng })

    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  }, [user?.wardLat, user?.wardLng])

  const { data: dash, isLoading } = useQuery({
    queryKey: ['authority-dashboard', period, user?.wardId],
    queryFn: () => reportsAPI.dashboard({ period, ward_id: user?.wardId }),
    select: d => d.data,
    refetchInterval: 30_000,
    enabled: Boolean(user?.role && ['authority', 'admin'].includes(user.role)),
  })

  const { data: urgent } = useQuery({
    queryKey: ['urgent-complaints', user?.wardId],
    queryFn: () => complaintsAPI.list({ status: 'pending', priority: 3, limit: 8 }),
    select: d => d.data,
    refetchInterval: 60_000,
    enabled: Boolean(user?.role && ['authority', 'admin'].includes(user.role)),
  })

  const { data: workers } = useQuery({
    queryKey: ['workers-dashboard', user?.wardId],
    queryFn: () => workersAPI.list({ ward_id: user?.wardId }),
    select: d => d.data,
    enabled: Boolean(user?.role && ['authority', 'admin'].includes(user.role)),
  })

  const { data: hotspotsData } = useQuery({
    queryKey: ['dashboard-hotspots', user?.wardId],
    queryFn: () => aiAPI.hotspots({ ward_id: user?.wardId, days: 14 }),
    select: d => d.data,
    refetchInterval: 120_000,
    enabled: Boolean(user?.role && ['authority', 'admin'].includes(user.role)),
  })

  const s = dash?.summary || {}
  const hotspots = hotspotsData?.hotspots || []

  const PERIOD_TABS = [
    { value: 'today', label: 'Today' },
    { value: 'week',  label: 'This Week' },
    { value: 'month', label: 'This Month' },
  ]

  return (
    <AuthorityLayout urgentCount={s.urgent_open || 0}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Command Overview</h1>
            <p className="page-sub">{user?.wardName} · {user?.city} · Real-time monitoring</p>
          </div>
          <Tabs tabs={PERIOD_TABS} active={period} onChange={setPeriod} />
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Urgent Open"      value={s.urgent_open    || 0} icon="🔴" color="red"    loading={isLoading} />
          <StatCard label="In Progress"      value={s.in_progress    || 0} icon="🔄" color="amber"  loading={isLoading} />
          <StatCard label="Resolved Today"   value={s.resolved_today || 0} icon="✅" color="green"  loading={isLoading} />
          <StatCard label="Resolution Rate"  value={`${s.resolution_rate || 0}%`} icon="📊" color="blue" loading={isLoading} />
        </div>

        {/* Main grid: map + workers */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Live map */}
          <div className="xl:col-span-2">
            <SectionCard
              title="Live Complaint Heatmap"
              subtitle="Real-time geographic distribution of complaints"
              action={
                <Link href="/authority/complaints">
                  <button className="btn-secondary btn-sm">All Complaints →</button>
                </Link>
              }
            >
              <div className="h-[340px] rounded-b-xl overflow-hidden">
                <HeatMap wardId={user?.wardId} />
              </div>
            </SectionCard>
          </div>

          {/* Workforce panel */}
          <div>
            <SectionCard
              title="Workforce Status"
              subtitle="Workers on duty right now"
              action={<Link href="/authority/workforce"><button className="btn-secondary btn-sm">Manage →</button></Link>}
            >
              <div className="divide-y divide-slate-50">
                {(workers?.workers || []).slice(0, 8).map(w => {
                  const sc = WORKER_STATUS[w.status] || WORKER_STATUS.offline
                  return (
                    <div key={w._id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/80 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        {w.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{w.name}</div>
                        <div className="text-xs text-slate-400">{w.zone || 'Unassigned'}</div>
                      </div>
                      <span className={sc.cls}><span className={`${sc.dot} inline-block mr-1`} />{sc.label}</span>
                    </div>
                  )
                })}
                {!(workers?.workers?.length) && (
                  <div className="p-6 text-center text-sm text-slate-400">No workers found</div>
                )}
              </div>
            </SectionCard>
          </div>
        </div>

        {/* Second row: chart + by-type */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <SectionCard title="7-Day Complaint Trend">
              <div className="p-5">
                <TrendChart data={dash?.trend || []} />
              </div>
            </SectionCard>
          </div>
          <div>
            <SectionCard title="By Issue Type">
              <div className="p-5 space-y-3">
                {(dash?.by_type || []).map(t => {
                  const max = Math.max(...(dash?.by_type?.map(x => x.count) || [1]))
                  return (
                    <div key={t.issue_type}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <div className="flex items-center gap-2">
                          <span>{ISSUE_EMOJI[t.issue_type] || '📍'}</span>
                          <span className="text-slate-700 capitalize">{t.issue_type.replace(/_/g,' ')}</span>
                        </div>
                        <span className="font-semibold text-slate-900">{t.count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${(t.count / max) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
                {!(dash?.by_type || []).length && (
                  <div className="text-sm text-slate-400 text-center py-6">No complaint volume yet for this period.</div>
                )}
              </div>
            </SectionCard>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <SectionCard
            title="Hotspot Snapshot"
            subtitle="Top AI-detected clusters in the last 14 days"
            action={<Link href="/authority/hotspots"><button className="btn-secondary btn-sm">Open Hotspots</button></Link>}
          >
            <div className="p-5 space-y-3">
              {hotspots.slice(0, 3).map((hotspot, index) => (
                <div key={hotspot.id || index} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{hotspot.ward_name || user?.wardName || 'Assigned ward'}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {Number.isFinite(Number(hotspot.centroid_lat)) ? Number(hotspot.centroid_lat).toFixed(4) : '-'},
                        {' '}
                        {Number.isFinite(Number(hotspot.centroid_lng)) ? Number(hotspot.centroid_lng).toFixed(4) : '-'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-red-600">{Number(hotspot.severity_score || 0).toFixed(2)}</div>
                      <div className="text-xs text-slate-400">{hotspot.complaint_count || 0} complaints</div>
                    </div>
                  </div>
                </div>
              ))}
              {!hotspots.length && (
                <div className="text-sm text-slate-400 text-center py-6">No hotspot clusters detected right now.</div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Operations Shortcuts" subtitle="Jump to the rest of the control surface">
            <div className="grid grid-cols-2 gap-3 p-5">
              {[
                { href: '/authority/complaints', label: 'Complaints', icon: '📋', tone: 'bg-blue-50 border-blue-100' },
                { href: '/authority/workforce', label: 'Workforce', icon: '👷', tone: 'bg-amber-50 border-amber-100' },
                { href: '/authority/hotspots', label: 'Hotspots', icon: '🔥', tone: 'bg-red-50 border-red-100' },
                { href: '/authority/reports', label: 'Reports', icon: '📊', tone: 'bg-green-50 border-green-100' },
              ].map((item) => (
                <Link key={item.href} href={item.href}>
                  <div className={`rounded-xl border p-4 text-center transition-all hover:shadow-sm ${item.tone}`}>
                    <div className="text-2xl mb-2">{item.icon}</div>
                    <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Service Health" subtitle="Quick operational read for this ward">
            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-100 p-4">
                <div className="text-xs text-slate-400 uppercase tracking-[0.16em]">Open workload</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{(s.urgent_open || 0) + (s.in_progress || 0)}</div>
                <div className="mt-1 text-sm text-slate-500">Urgent plus in-progress complaints currently active.</div>
              </div>
              <div className="rounded-xl border border-slate-100 p-4">
                <div className="text-xs text-slate-400 uppercase tracking-[0.16em]">Available crew</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {(workers?.workers || []).filter((worker) => worker.status === 'available').length}
                </div>
                <div className="mt-1 text-sm text-slate-500">Workers ready for new assignments.</div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Current Location Section ── */}
        <SectionCard
          title="📍 Your Current Location"
          subtitle={locating ? 'Acquiring GPS position...' : userLoc ? `${userLoc.lat.toFixed(5)}, ${userLoc.lng.toFixed(5)}` : 'Location unavailable'}
          action={
            <button
              onClick={() => {
                setLocating(true)
                navigator.geolocation?.getCurrentPosition(
                  pos => { setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false) },
                  () => setLocating(false),
                  { enableHighAccuracy: true, timeout: 8000 }
                )
              }}
              disabled={locating}
              className="btn-secondary btn-sm flex items-center gap-1"
            >
              {locating ? '⏳ Locating...' : '🔄 Refresh'}
            </button>
          }
        >
          <div className="h-[300px] rounded-b-xl overflow-hidden">
            {userLoc ? (
              <LeafletMap
                center={[userLoc.lat, userLoc.lng]}
                zoom={14}
                markers={[]}
                userLoc={userLoc}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <p className="text-sm">Detecting location…</p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Urgent complaints table */}
        <SectionCard
          title="Urgent Complaints — Action Required"
          subtitle="Priority 3 complaints needing immediate attention"
          action={<Link href="/authority/complaints"><button className="btn-secondary btn-sm">View All →</button></Link>}
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Location</th>
                  <th>AI Type</th>
                  <th>Upvotes</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(urgent?.data || []).map(c => (
                  <tr key={c._id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span>{ISSUE_EMOJI[c.issueType] || '📍'}</span>
                        <span className="font-medium capitalize">{c.issueType.replace(/_/g,' ')}</span>
                      </div>
                    </td>
                    <td className="text-xs text-slate-500 max-w-[180px]">
                      <span className="truncate block">{c.address || 'Location captured'}</span>
                    </td>
                    <td>
                      {c.aiResult?.wasteType
                        ? <span className="text-xs text-green-700 font-medium capitalize">{c.aiResult.wasteType}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="text-slate-600 text-sm">{c.upvotes || 0}</td>
                    <td className="text-slate-400 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </td>
                    <td><Badge status={c.status} /></td>
                    <td>
                      <Link href={`/authority/complaints/${c._id}`}>
                        <button className="btn-blue btn-sm text-xs">Assign →</button>
                      </Link>
                    </td>
                  </tr>
                ))}
                {!urgent?.data?.length && (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">🎉 No urgent complaints right now</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </AuthorityLayout>
  )
}
