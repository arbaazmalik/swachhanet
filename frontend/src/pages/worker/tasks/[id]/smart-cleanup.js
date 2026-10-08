import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workerAPI } from '../../../../utils/api'
import WorkerLayout from '../../../../components/worker/WorkerLayout'
import useWorkerSocket from '../../../../hooks/useWorkerSocket'
import { PageLoader } from '../../../../components/ui'
import { formatDistance } from '../../../../utils/geoUtils'
import toast from 'react-hot-toast'

const ISSUE_EMOJI = {
  full_dustbin: '🗑️', illegal_dumping: '⚠️', burning_waste: '🔥',
  missed_collection: '🚛', overflowing_bin: '💧', stray_animal_waste: '🐾', other: '📍',
}

// Honest status presentation — never fabricate AI output.
function AIStatus({ status }) {
  switch (status) {
    case 'completed':
      return <span className="badge-resolved">✅ AI analysis completed</span>
    case 'processing':
      return <span className="badge-progress">⚙️ AI analysis in progress…</span>
    case 'failed':
      return <span className="badge-pending">⚠️ AI analysis failed</span>
    default:
      return <span className="badge-gray">⏳ AI analysis queued</span>
  }
}

// Static field SOP per waste type — clearly marked as standard guidelines,
// NOT machine-generated. Keeps AI honesty honest.
const SOP = {
  wet: {
    icon: '🍌', color: 'bg-green-50 text-green-700 border-green-100',
    steps: ['Use gloves + a pick-up claw', 'Collect into a sealed biodegradable bag', 'Keep wet waste separate from dry', 'Dispose at the nearest organic/compost collection point'],
  },
  dry: {
    icon: '📦', color: 'bg-blue-50 text-blue-700 border-blue-100',
    steps: ['Use gloves + a pick-up claw', 'Collect into a dry-waste bag', 'Quick sort: paper, glass, metal, plastic', 'Hand recyclables to the nearest dry-waste center'],
  },
  plastic: {
    icon: '🥤', color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    steps: ['Use gloves + a pick-up claw', 'Pick up visibly scattered plastic litter', 'Avoid mixing with wet/organic waste', 'Hand to the nearest plastic recycling drop point'],
  },
  hazardous: {
    icon: '☣️', color: 'bg-red-50 text-red-700 border-red-100',
    steps: ['STOP and assess — do NOT touch with bare hands', 'Use thick chemical gloves and mask', 'Quarantine the area and clearly mark it', 'Escalate to your supervisor — hazardous material alert'],
  },
  mixed: {
    icon: '♻️', color: 'bg-amber-50 text-amber-700 border-amber-100',
    steps: ['Separate wet vs dry at the source if safe', 'Bag both streams separately', 'Follow the composition you can see (see highlighted materials)', 'Report unusually large or unsafe piles'],
  },
}

const DEFAULT_SOP = SOP.mixed

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

export default function WorkerSmartCleanup() {
  const router = useRouter()
  const id = router.query.id
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState([])
  useWorkerSocket()

  const { data: task, isLoading } = useQuery({
    queryKey: ['worker-task', id],
    queryFn: () => workerAPI.task(id),
    select: d => d.data,
    enabled: Boolean(id),
    refetchInterval: 30_000,
  })

  const sop = SOP[task?.aiResult?.wasteType] || DEFAULT_SOP
  const status = task?.aiResult?.status || 'pending'

  const invalidate = () => {
    queryClient.invalidateQueries(['worker-task', id])
    queryClient.invalidateQueries(['worker-overview'])
  }

  const startMutation = useMutation({
    mutationFn: async () => {
      const pos = await getPosition()
      return workerAPI.start(id, pos?.lat, pos?.lng)
    },
    onSuccess: () => { toast.success('Cleanup started'); invalidate(); router.push(`/worker/tasks/${id}`) },
    onError: (err) => {
      const code = err?.response?.data?.code
      if (code === 'LOCATION_VERIFICATION_FAILED') toast.error('You are too far from the complaint — travel to the site')
      else toast.error('Start from the task page (you must be near the site)')
    },
  })

  if (isLoading || !task) return <WorkerLayout><PageLoader /></WorkerLayout>

  const acknowledged = sop.steps.length && checked.length >= sop.steps.length
  const allDone = checked.length > 0 && checked.length === sop.steps.length

  return (
    <WorkerLayout>
      <div className="space-y-5 max-w-3xl">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Link href={`/worker/tasks/${id}`}><span className="text-amber-700 font-medium hover:underline">← Task</span></Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500 font-medium">Smart Cleanup Assistant</span>
        </div>

        <div className="card p-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center text-2xl flex-shrink-0">
              {ISSUE_EMOJI[task.issueType] || '📍'}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="page-title !text-lg capitalize">{task.issueLabel}</h1>
              <p className="text-xs text-slate-400">{task.address || 'Location captured'} · {formatDistance(task.distanceKm)} away</p>
            </div>
          </div>
        </div>

        {/* AI classification — honest regardless of state */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-slate-800">🧠 On-the-Spot AI Analysis</h3>
            <AIStatus status={status} />
          </div>

          {status === 'completed' ? (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 p-4">
              <span className={`w-12 h-12 rounded-xl ${sop.color} flex items-center justify-center text-2xl`}>{sop.icon}</span>
              <div>
                <div className="text-sm font-semibold text-slate-800 capitalize">{task.aiResult.wasteType}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Model confidence {(task.aiResult.confidence * 100).toFixed(0)}% — review the site before relying on it
                </div>
              </div>
            </div>
          ) : status === 'failed' ? (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
              The AI could not analyse this complaint&apos;s photo. Proceed with the standard guidelines below and manual judgement.
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-700">
              Analysis is {status}. Use the standard guidelines below meanwhile.
            </div>
          )}
        </div>

        {/* Standard field SOP checklist */}
        <div className="card p-5">
          <div className="mb-1">
            <h3 className="text-sm font-semibold text-slate-800">📋 Standard Cleanup Steps {task.aiResult?.wasteType && <span className="capitalize">·{task.aiResult.wasteType}</span>}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">SOP from the field handbook — tick each step as you complete it</p>
          </div>

          <div className="mt-4 space-y-2">
            {sop.steps.map((step, i) => {
              const done = checked.includes(i)
              return (
                <button
                  key={i}
                  onClick={() => setChecked(c => done ? c.filter(x => x !== i) : [...c, i])}
                  className={`w-full flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                    done ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100 hover:border-amber-200'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                    done ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300 text-transparent'
                  }`}>
                    ✓
                  </span>
                  <span className={`text-sm ${done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    <span className="font-mono text-xs text-slate-400 mr-2">{i + 1}.</span>{step}
                  </span>
                </button>
              )
            })}
          </div>

          {acknowledged && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3 flex items-center gap-2 text-sm text-amber-700">
              ⚠️ Follow site safety: gloves, mask, closed shoes. Move to the task page to start the official timer and capture photos.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 sticky bottom-20 lg:bottom-4 justify-end pb-4 lg:pb-0">
          <Link href={`/worker/tasks/${id}`}><button className="btn-secondary btn-sm">Back to task</button></Link>
          {task.assignment.status === 'accepted' && (
            <button className="btn-primary btn-sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              {startMutation.isPending ? 'Starting…' : '📍 Start Cleanup'}
            </button>
          )}
          {task.assignment.status === 'in_progress' && (
            <Link href={`/worker/tasks/${id}`}><button className="btn-primary btn-sm">Continue task →</button></Link>
          )}
        </div>
      </div>
    </WorkerLayout>
  )
}