import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { workerAPI } from '../../utils/api'
import WorkerLayout from '../../components/worker/WorkerLayout'
import TaskCard from '../../components/worker/TaskCard'
import useWorkerSocket from '../../hooks/useWorkerSocket'
import { PageLoader, EmptyState, Tabs } from '../../components/ui'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'On Site' },
  { value: 'completed', label: 'Completed' },
  { value: 'reassigned', label: 'Returned' },
]

export default function WorkerTasks() {
  useWorkerSocket()
  const [filter, setFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['worker-tasks', filter],
    queryFn: () => workerAPI.tasks(filter === 'all' ? undefined : filter),
    select: d => d.data,
    refetchInterval: 30_000,
  })

  const tasks = data?.tasks || []
  const counts = data?.counts || {}

  return (
    <WorkerLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="page-title">My Tasks</h1>
            <p className="page-sub">Every cleanup assigned to you</p>
          </div>
          <Link href="/worker/route"><button className="btn-secondary btn-sm">🧭 Optimize Route</button></Link>
        </div>

        <Tabs
          tabs={FILTERS.map(f => ({
            value: f.value,
            label: f.label,
            count: f.value === 'all' ? undefined : (counts[f.value] || 0),
          }))}
          active={filter}
          onChange={setFilter}
        />

        {isLoading ? (
          <PageLoader />
        ) : tasks.length ? (
          <div className="space-y-3">
            {tasks.map(t => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon="🗂️"
              title="Nothing here"
              subtitle={filter === 'all' ? 'No tasks assigned to you yet' : `No "${filter.replace(/_/g, ' ')}" tasks`}
            />
          </div>
        )}
      </div>
    </WorkerLayout>
  )
}