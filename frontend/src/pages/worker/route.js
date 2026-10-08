import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { workerAPI } from '../../utils/api'
import WorkerLayout from '../../components/worker/WorkerLayout'
import { PageLoader, EmptyState, StatCard } from '../../components/ui'
import useWorkerSocket from '../../hooks/useWorkerSocket'

const RouteMap = dynamic(() => import('../../components/worker/RouteMap'), { ssr: false })

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

export default function WorkerRoute() {
  const [userLoc, setUserLoc] = useState(null)
  useWorkerSocket()

  useEffect(() => {
    getPosition().then(pos => setUserLoc(pos))
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['worker-route'],
    queryFn: () => workerAPI.route(),
    select: d => d.data,
    refetchInterval: 30_000,
  })

  const route = data?.route || []
  const summary = data?.summary || {}

  return (
    <WorkerLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Smart Route</h1>
            <p className="page-sub">Optimized order — in-progress task first, then priority & proximity</p>
          </div>
          {route.length > 0 && (
            <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-100 rounded-full px-3 py-1.5">
              🧭 {summary.taskCount} stops · ~{summary.estMinutes} min walk estimate
            </span>
          )}
        </div>

        {isLoading ? (
          <PageLoader />
        ) : !route.length ? (
          <div className="card"><EmptyState icon="🧭" title="No route to plan" subtitle="Accept tasks and the smart route will appear here" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Stops" value={summary.taskCount || 0} icon="📍" color="amber" />
              <StatCard label="Total Distance" value={`${summary.totalKm || 0} km`} icon="📏" color="blue" />
              <StatCard label="Est. Time" value={`~${summary.estMinutes} min`} icon="⏱️" color="purple" />
              <StatCard label="Urgent (P3)" value={summary.priorityTasks || 0} icon="🔴" color="red" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 card overflow-hidden">
                <div className="h-[420px] lg:h-[560px]">
                  <RouteMap route={route} startLoc={userLoc || data?.startLocation} />
                </div>
              </div>

              <div className="card p-2">
                <div className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Stop Order</div>
                <div className="space-y-1 max-h-[520px] overflow-y-auto">
                  {route.map((r, i) => (
                    <Link key={r.id} href={`/worker/tasks/${r.id}`}>
                      <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800 capitalize truncate">
                            {r.issueLabel} {r.priority >= 3 && '🔴'}
                          </div>
                          <div className="text-xs text-slate-400 truncate">{r.address || 'Location captured'}</div>
                          {r.hotspot && (
                            <div className="text-[10px] font-bold text-red-600 mt-0.5">🔥 Hotspot · {r.hotspot.distanceKm} km</div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-semibold text-slate-600">{r.distanceKm} km</div>
                          <div className="text-[10px] text-slate-400">cum {r.cumulativeKm} km</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </WorkerLayout>
  )
}