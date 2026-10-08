import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { workerAPI } from '../../utils/api'
import WorkerLayout from '../../components/worker/WorkerLayout'
import { PageLoader, EmptyState, Avatar } from '../../components/ui'
import useWorkerSocket from '../../hooks/useWorkerSocket'
import toast from 'react-hot-toast'

function InfoRow({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className={`text-sm ${strong ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{value || '—'}</span>
    </div>
  )
}

export default function WorkerProfile() {
  const queryClient = useQueryClient()
  useWorkerSocket()

  const { data: me, isLoading } = useQuery({
    queryKey: ['worker-me'],
    queryFn: () => workerAPI.me(),
    select: d => d.data?.worker,
    refetchInterval: 60_000,
  })

  const statusMutation = useMutation({
    mutationFn: (status) => workerAPI.updateStatus(status),
    onSuccess: () => { toast.success('Status updated'); queryClient.invalidateQueries(['worker-me']) },
    onError: () => toast.error('Could not update status'),
  })

  if (isLoading || !me) return <WorkerLayout><PageLoader /></WorkerLayout>

  const loc = me.currentLocation?.coordinates
    ? { lat: me.currentLocation.coordinates[1], lng: me.currentLocation.coordinates[0] }
    : null

  const statusBtn = (s, label) => (
    <button
      key={s}
      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
        me.status === s ? 'bg-amber-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
      onClick={() => statusMutation.mutate(s)}
      disabled={statusMutation.isPending}
    >
      {label}
    </button>
  )

  return (
    <WorkerLayout>
      <div className="space-y-5 max-w-2xl">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-sub">Your field identity and stats</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <Avatar name={me.name} size="xl" color="blue" />
            <div>
              <h2 className="text-lg font-bold text-slate-800">{me.name}</h2>
              <p className="text-sm text-slate-400">{me.employeeId} · {me.role} · {me.zone}</p>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <InfoRow label="Phone" value={me.phone} strong />
            <InfoRow label="Ward" value={me.wardName} />
            <InfoRow label="City" value={me.city} />
            <InfoRow label="Tasks Completed" value={me.tasksCompleted} strong />
            <InfoRow label="Active Tasks" value={me.activeTasks} strong />
            <InfoRow label="Performance Score" value={me.performanceScore} strong />
            <InfoRow label="Last Active" value={me.lastActiveAt ? format(new Date(me.lastActiveAt), 'd MMM yyyy, h:mm a') : '—'} />
            <InfoRow label="Current Location" value={loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Not shared'} />
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Set Availability Status</h3>
          <div className="flex gap-2">
            {statusBtn('available', '🟢 Available')}
            {statusBtn('busy', '🟠 On Task')}
            {statusBtn('break', '⏸️ On Break')}
            {statusBtn('offline', '⚪ Offline')}
          </div>
        </div>
      </div>
    </WorkerLayout>
  )
}