import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { formatDistance } from '../../utils/geoUtils'
import { PriorityBadge } from '../ui'

const ISSUE_EMOJI = {
  full_dustbin: '🗑️',
  illegal_dumping: '⚠️',
  burning_waste: '🔥',
  missed_collection: '🚛',
  overflowing_bin: '💧',
  stray_animal_waste: '🐾',
  other: '📍',
}

const ASSIGNMENT_BADGE = {
  assigned:     <span className="badge-assigned">👷 Assigned</span>,
  accepted:     <span className="badge-progress">🤝 Accepted</span>,
  in_progress:  <span className="badge-progress">🔄 On Site</span>,
  completed:    <span className="badge-resolved">✅ Completed</span>,
  reassigned:   <span className="badge-gray">↩️ Returned</span>,
}

export default function TaskCard({ task, href, onItem }) {
  const target = href || `/worker/tasks/${task.id}`

  return (
    <Link href={target} onClick={onItem} className="block">
      <div className="card-hover p-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-xl flex-shrink-0">
            {ISSUE_EMOJI[task.issueType] || '📍'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800 capitalize truncate">
                {task.issueLabel}
              </div>
              {task.priority && <PriorityBadge priority={task.priority} />}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{task.address || 'Location captured'}</p>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-[11px] text-slate-500 font-medium">📍 {formatDistance(task.distanceKm)}</span>
              <span className="text-[11px] text-slate-400">
                {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
              </span>
              {task.hotspot && (
                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                  🔥 Hotspot
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
          {ASSIGNMENT_BADGE[task.assignment?.status] || <span className="badge-gray">{task.assignment?.status}</span>}
          {task.aiResult?.wasteType && (
            <span className="text-[11px] text-green-700 font-medium capitalize">AI: {task.aiResult.wasteType} · {(task.aiResult.confidence * 100).toFixed(0)}%</span>
          )}
        </div>
      </div>
    </Link>
  )
}