import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { notificationsAPI } from '../../utils/api'
import WorkerLayout from '../../components/worker/WorkerLayout'
import { EmptyState, PageLoader, Tabs } from '../../components/ui'
import useWorkerSocket from '../../hooks/useWorkerSocket'
import toast from 'react-hot-toast'

const TYPE_META = {
  complaint_update: { icon: '📋', cls: 'bg-blue-50 text-blue-700' },
  awareness:       { icon: '💡', cls: 'bg-green-50 text-green-700' },
  announcement:    { icon: '📢', cls: 'bg-amber-50 text-amber-700' },
  reward:          { icon: '🏆', cls: 'bg-purple-50 text-purple-700' },
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'complaint_update', label: 'Task Updates' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'awareness', label: 'Awareness' },
  { value: 'reward', label: 'Rewards' },
]

export default function WorkerNotifications() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('all')
  useWorkerSocket()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsAPI.list({ limit: 50 }),
    select: d => d.data,
    refetchInterval: 60_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries(['notifications'])
    queryClient.invalidateQueries(['worker-notif-count'])
  }

  const readMutation = useMutation({
    mutationFn: (id) => notificationsAPI.markRead(id),
    onSuccess: invalidate,
  })

  const readAllMutation = useMutation({
    mutationFn: () => notificationsAPI.markAllRead(),
    onSuccess: () => { toast.success('All marked as read'); invalidate() },
  })

  const notifications = data?.notifications || []
  const unread = data?.unread_count || 0
  const filtered = filter === 'all'
    ? notifications
    : filter === 'unread'
      ? notifications.filter(n => !n.isRead)
      : notifications.filter(n => n.type === filter)

  return (
    <WorkerLayout>
      <div className="space-y-5 max-w-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Notifications</h1>
            <p className="page-sub">{unread} unread</p>
          </div>
          {unread > 0 && (
            <button className="btn-secondary btn-sm" onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending}>
              ✔ Mark all read
            </button>
          )}
        </div>

        <Tabs tabs={FILTERS} active={filter} onChange={setFilter} />

        {isLoading ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <div className="card"><EmptyState icon="🔔" title="All caught up" subtitle={`You have no ${filter === 'unread' ? 'unread ' : ''}notifications`} /></div>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => {
              const meta = TYPE_META[n.type] || TYPE_META.complaint_update
              return (
                <button
                  key={n._id}
                  onClick={() => { if (!n.isRead) readMutation.mutate(n._id) }}
                  className={`w-full flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    n.isRead ? 'bg-white border-slate-100' : 'bg-amber-50/60 border-amber-200'
                  }`}
                >
                  <span className={`w-10 h-10 rounded-xl ${meta.cls} flex items-center justify-center text-lg flex-shrink-0`}>{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-sm font-semibold ${n.isRead ? 'text-slate-700' : 'text-slate-900'}`}>{n.title}</div>
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                    </div>
                    {n.body && <div className="text-sm text-slate-500 mt-0.5">{n.body}</div>}
                    <div className="text-[11px] text-slate-400 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </WorkerLayout>
  )
}