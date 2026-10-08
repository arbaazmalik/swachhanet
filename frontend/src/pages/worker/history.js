import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { workerAPI } from '../../utils/api'
import WorkerLayout from '../../components/worker/WorkerLayout'
import { EmptyState, PageLoader, Tabs } from '../../components/ui'
import useWorkerSocket from '../../hooks/useWorkerSocket'

const PERIODS = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
]

const ISSUE_EMOJI = {
  full_dustbin: '🗑️', illegal_dumping: '⚠️', burning_waste: '🔥',
  missed_collection: '🚛', overflowing_bin: '💧', stray_animal_waste: '🐾', other: '📍',
}

function VerificationChip({ status, score }) {
  if (status === 'verified') return <span className="badge-resolved">✅ Verified · {(score * 100).toFixed(0)}%</span>
  if (status === 'review_required') return <span className="badge-pending">🟡 Review needed</span>
  return <span className="badge-gray">⏳ Not verified</span>
}

export default function WorkerHistory() {
  const [period, setPeriod] = useState('all')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState([])
  useWorkerSocket()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['worker-history', period, page],
    queryFn: () => workerAPI.history({ period: period === 'all' ? undefined : period, page, limit: 10 }),
    select: d => d.data,
  })

  // Accumulate pages so "Load more" appends instead of replacing.
  const pageItems = data?.history || []
  const shown = page === 1 ? pageItems : mergeUnique(items, pageItems)
  const pages = data?.meta?.pages || 1
  const hasMore = page < pages

  function mergeUnique(a, b) {
    const seen = new Set(a.map(x => x.id))
    return [...a, ...b.filter(x => !seen.has(x.id))]
  }

  return (
    <WorkerLayout>
      <div className="space-y-5">
        <div>
          <h1 className="page-title">Completed History</h1>
          <p className="page-sub">Every cleanup you finished, with verification status</p>
        </div>

        <Tabs tabs={PERIODS} active={period} onChange={(v) => { setPage(1); setItems([]); setPeriod(v) }} />

        {isLoading && page === 1 ? (
          <PageLoader />
        ) : shown.length === 0 ? (
          <div className="card"><EmptyState icon="🗂️" title="No completed tasks" subtitle="Completed cleanups will appear here" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {shown.map(h => (
                <div key={h.id} className="card-hover p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 text-green-700 flex items-center justify-center text-lg flex-shrink-0">
                      {ISSUE_EMOJI[h.issueType] || '📍'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 capitalize truncate">{h.issueLabel}</div>
                      <div className="text-xs text-slate-400 truncate">{h.address || 'Location captured'}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                    <VerificationChip status={h.verificationStatus} score={h.cleanupScore} />
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 font-medium">{h.resolutionMinutes} min</div>
                      <div className="text-[11px] text-slate-400">{format(new Date(h.completedAt), 'd MMM, h:mm a')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="text-center">
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => { setItems(shown); setPage(p => p + 1) }}
                  disabled={isFetching}
                >
                  {isFetching ? 'Loading…' : `Load more (${pages - page} left)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </WorkerLayout>
  )
}