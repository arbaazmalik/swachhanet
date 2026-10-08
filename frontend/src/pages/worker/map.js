import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useQuery } from '@tanstack/react-query'
import { workerAPI } from '../../utils/api'
import WorkerLayout from '../../components/worker/WorkerLayout'
import { PageLoader, EmptyState } from '../../components/ui'
import { formatDistance } from '../../utils/geoUtils'
import useWorkerSocket from '../../hooks/useWorkerSocket'

const WorkerMap = dynamic(() => import('../../components/worker/WorkerMap'), { ssr: false })

const ACTIVE = ['assigned', 'accepted', 'in_progress']

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  })
}

export default function WorkerMapPage() {
  const router = useRouter()
  const [userLoc, setUserLoc] = useState(null)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  useWorkerSocket()

  useEffect(() => {
    getPosition().then(pos => setUserLoc(pos))
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['worker-tasks-map'],
    queryFn: () => workerAPI.tasks(),
    select: d => d.data,
    refetchInterval: 30_000,
  })

  const tasks = (data?.tasks || []).filter(t => ACTIVE.includes(t.assignment.status))
  const filtered = tasks.filter(t =>
    !search || (t.address || '').toLowerCase().includes(search.toLowerCase()) || t.issueLabel.toLowerCase().includes(search.toLowerCase())
  )

  // Auto-select the first task so the map is never empty of context.
  const selectedTask = selected && filtered.some(t => t.id === selected.id) ? selected : filtered[0]

  return (
    <WorkerLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Field Map</h1>
            <p className="page-sub">Live locations of your active assignments</p>
          </div>
          <Link href="/worker/route"><button className="btn-secondary btn-sm">🧭 Go to route</button></Link>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : !filtered.length ? (
          <div className="card"><EmptyState icon="🗺️" title="No active map tasks" subtitle="Accepted and on-site tasks will appear here" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 card overflow-hidden">
              <div className="h-[420px] lg:h-[560px]">
                {userLoc ? (
                  <WorkerMap
                    center={[userLoc.lat, userLoc.lng]}
                    userLoc={userLoc}
                    tasks={filtered}
                    onSelect={setSelected}
                    zoom={13}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400 text-sm">Locating…</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <input
                className="input"
                placeholder="🔍 Search address or type…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="card p-2 max-h-[520px] overflow-y-auto">
                {filtered.length === 0 && (
                  <div className="p-4 text-center text-sm text-slate-400">No matching tasks</div>
                )}
                {filtered.map(t => {
                  const isSel = selectedTask?.id === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => router.push(`/worker/tasks/${t.id}`)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                        isSel ? 'bg-amber-50 border border-amber-200' : 'border border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-xl flex-shrink-0">{t.issueType === 'full_dustbin' ? '🗑️' : t.issueType === 'illegal_dumping' ? '⚠️' : '📍'}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 capitalize truncate">{t.issueLabel}</div>
                        <div className="text-xs text-slate-400 truncate">{t.address || 'Location captured'}</div>
                        <div className="text-[11px] font-semibold text-amber-700 mt-1">
                          {formatDistance(t.distanceKm)} {t.priority >= 3 && '· 🔴 Urgent'} {t.assignment.status === 'in_progress' && '· 🔧 On site'}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </WorkerLayout>
  )
}