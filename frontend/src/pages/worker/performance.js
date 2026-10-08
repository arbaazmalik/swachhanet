import { useQuery } from '@tanstack/react-query'
import { workerAPI } from '../../utils/api'
import WorkerLayout from '../../components/worker/WorkerLayout'
import { PageLoader, EmptyState, StatCard } from '../../components/ui'
import useWorkerSocket from '../../hooks/useWorkerSocket'

const MAX_TREND = 8

function TrendBars({ trend }) {
  const max = Math.max(MAX_TREND, ...trend.map(t => t.count))
  return (
    <div className="flex items-end gap-2 h-28 px-2">
      {trend.map((t, i) => {
        const isToday = i === trend.length - 1
        const date = t.date ? t.date.slice(5) : ''
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-slate-500">{t.count > 0 ? t.count : ''}</span>
            <div
              className={`w-full rounded-t-lg ${t.count ? (isToday ? 'bg-amber-500' : 'bg-amber-200') : 'bg-slate-100'} transition-all`}
              style={{ height: `${Math.max(2, (t.count / max) * 80)}px` }}
            />
            <span className={`text-[9px] ${isToday ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>{date}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function WorkerPerformance() {
  useWorkerSocket()

  const { data: perf, isLoading } = useQuery({
    queryKey: ['worker-performance'],
    queryFn: () => workerAPI.performance(),
    select: d => d.data,
    refetchInterval: 60_000,
  })

  if (isLoading) return <WorkerLayout><PageLoader /></WorkerLayout>
  if (!perf) return <WorkerLayout><EmptyState icon="📊" title="No performance data" /></WorkerLayout>

  const score = perf.performanceScore || 0
  const scoreTone = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-500'
  const achievements = perf.achievements || []
  const trend = perf.trend || []

  return (
    <WorkerLayout>
      <div className="space-y-5">
        <div>
          <h1 className="page-title">Performance</h1>
          <p className="page-sub">Your field analytics — SLAs are {perf.slaHours?.[3] || 12}h (P3), {perf.slaHours?.[2] || 24}h (P2), {perf.slaHours?.[1] || 48}h (P1)</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Tasks Completed" value={perf.tasksCompleted || 0} icon="✅" color="green" />
          <StatCard label="Completed (7d)" value={perf.thisWeek || 0} icon="📅" color="blue" />
          <StatCard label="Avg Resolution" value={`${perf.avgResolutionMinutes || 0} min`} icon="⏱️" color="purple" />
          <StatCard label="Current Streak" value={`${perf.currentStreak || 0} days`} icon="🔥" color="amber" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="On-time Rate" value={`${perf.onTimePct || 0}%`} icon="🕑" color={perf.onTimePct >= 80 ? 'green' : 'amber'} />
          <StatCard label="Verified Rate" value={`${perf.verificationSuccessRate || 0}%`} icon="🧪" color="purple" />
          <StatCard label="Returned Tasks" value={perf.returnedTasks || 0} icon="↩️" color={perf.returnedTasks ? 'red' : 'slate'} />
          <StatCard label="Performance Score" value={score} icon="🏅" color={score >= 60 ? 'green' : 'red'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">7-Day Completion Trend</h3>
            <p className="text-xs text-slate-400 mb-4">Cleanups finished per day</p>
            {trend.length ? <TrendBars trend={trend} /> : null}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Achievements</h3>
            {achievements.length ? (
              <div className="space-y-2">
                {achievements.map(a => (
                  <div key={a.key} className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                    <span className="text-2xl">🏅</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{a.label}</div>
                      <div className="text-xs text-slate-400">{a.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400">Keep completing tasks to unlock achievements 🚀</div>
            )}
          </div>
        </div>
      </div>
    </WorkerLayout>
  )
}