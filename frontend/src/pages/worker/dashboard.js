import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { workerAPI } from '../../utils/api'
import useAuthStore from '../../context/authStore'
import WorkerLayout from '../../components/worker/WorkerLayout'
import TaskCard from '../../components/worker/TaskCard'
import useWorkerSocket from '../../hooks/useWorkerSocket'
import { PageLoader, StatCard, EmptyState } from '../../components/ui'
import { formatDistance } from '../../utils/geoUtils'
import toast from 'react-hot-toast'

const WorkerMap = dynamic(() => import('../../components/worker/WorkerMap'), { ssr: false })

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

export default function WorkerDashboard() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [userLoc, setUserLoc] = useState(null)
  useWorkerSocket()

  useEffect(() => {
    const [defaultLng, defaultLat] = [73.8567, 18.5204]
    getPosition().then(pos => setUserLoc(pos || { lat: defaultLat, lng: defaultLng }))
  }, [])

  const { data: overview, isLoading } = useQuery({
    queryKey: ['worker-overview'],
    queryFn: () => workerAPI.overview(),
    select: d => d.data,
    refetchInterval: 30_000,
  })

  const { data: me } = useQuery({
    queryKey: ['worker-me'],
    queryFn: () => workerAPI.me(),
    select: d => d.data?.worker,
    refetchInterval: 60_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries(['worker-overview'])
    queryClient.invalidateQueries(['worker-tasks'])
    queryClient.invalidateQueries(['worker-me'])
  }

  const acceptMutation = useMutation({
    mutationFn: (id) => workerAPI.accept(id),
    onSuccess: () => { toast.success('Task accepted'); invalidate() },
    onError: () => toast.error('Could not accept task'),
  })

  const startMutation = useMutation({
    mutationFn: async (task) => {
      const pos = await getPosition()
      const ap = await workerAPI.start(task.id, pos?.lat || userLoc?.lat, pos?.lng || userLoc?.lng)
      if (pos) setUserLoc(pos)
      return ap
    },
    onSuccess: () => { toast.success('Task started — Head to the site'); invalidate() },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Could not start task (are you at the site?)')
      invalidate()
    },
  })

  const pausing = useMutation({
    mutationFn: (id) => workerAPI.pause(id),
    onSuccess: () => { toast('Cleanup paused'); invalidate() },
    onError: () => toast.error('Could not pause'),
  })

  const s = overview?.summary || {}
  const nextTask = overview?.nextTask
  const tasks = overview?.tasks || []

  const nextActions = nextTask && (() => {
    const st = nextTask.assignment.status
    if (st === 'assigned') {
      return (
        <button className="btn-primary btn-sm" onClick={() => acceptMutation.mutate(nextTask.id)}>
          {acceptMutation.isPending ? 'Accepting…' : '🤝 Accept Task'}
        </button>
      )
    }
    if (st === 'accepted') {
      return (
        <button className="btn-primary btn-sm" onClick={() => startMutation.mutate(nextTask)} disabled={!userLoc}>
          {startMutation.isPending ? 'Starting…' : '📍 Start & Verify Location'}
        </button>
      )
    }
    if (st === 'in_progress') {
      return (
        <div className="flex items-center gap-2">
          <Link href={`/worker/tasks/${nextTask.id}`}>
            <button className="btn-primary btn-sm">Continue →</button>
          </Link>
          <button className="btn-secondary btn-sm" onClick={() => pausing.mutate(nextTask.id)} disabled={pausing.isPending}>
            ⏸ Pause
          </button>
        </div>
      )
    }
    return null
  })()

  return (
    <WorkerLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Good job, {user?.name?.split(' ')[0] || 'Worker'}! 👷</h1>
            <p className="page-sub">
              {me?.wardName || 'Field crew'} · {format(new Date(), 'EEEE, d MMMM')}
              {me?.performanceScore ? ` · Score ${me.performanceScore}` : ''}
            </p>
          </div>
          <Link href="/worker/route">
            <button className="btn-secondary btn-sm">🧭 Open Smart Route</button>
          </Link>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Assigned Today" value={s.assigned_today || 0} icon="📥" color="blue" />
              <StatCard label="Pending" value={s.pending || 0} icon="⏳" color="amber" />
              <StatCard label="On Site" value={s.in_progress || 0} icon="🔧" color="purple" />
              <StatCard label="Completed" value={s.completed || 0} icon="✅" color="green" />
            </div>

            {nextTask ? (
              <div className="card p-5 border-l-4 border-l-amber-500">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">🎯 Next Task{nextTask.assignment.status === 'in_progress' ? ' (On site)' : ''}</div>
                    <div className="text-sm font-semibold text-slate-800 capitalize">{nextTask.issueLabel}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      📍 {nextTask.address || 'Location captured'} · {formatDistance(nextTask.distanceKm)} away · {nextTask.priority >= 3 ? '🔴 Urgent' : nextTask.priority === 2 ? '🟡 Moderate' : '⚪ Low'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/worker/tasks/${nextTask.id}`}>
                      <button className="btn-secondary btn-sm">Details</button>
                    </Link>
                    {nextActions}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card p-5 text-center text-sm text-slate-400">
                🎉 All clear — no pending tasks. You can switch status to break from the header pill.
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="section-title !mb-0">Active Tasks ({tasks.length})</div>
                  <Link href="/worker/tasks"><span className="text-xs text-amber-700 font-medium hover:underline">View all →</span></Link>
                </div>
                {tasks.length ? (
                  tasks.map(t => <TaskCard key={t.id} task={t} />)
                ) : (
                  <div className="card"><EmptyState icon="🗂️" title="No active tasks" subtitle="New assignments will appear here in real time" /></div>
                )}
              </div>

              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800">Field Map</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Live task locations</p>
                </div>
                <div className="h-[320px]">
                  {userLoc ? (
                    <WorkerMap center={[userLoc.lat, userLoc.lng]} userLoc={userLoc} tasks={tasks.filter(t => t.location?.lat)} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400 text-sm">Locating…</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </WorkerLayout>
  )
}