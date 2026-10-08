import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { workerAPI } from '../../../utils/api'
import WorkerLayout from '../../../components/worker/WorkerLayout'
import PhotoCapture from '../../../components/worker/PhotoCapture'
import useWorkerSocket from '../../../hooks/useWorkerSocket'
import { PageLoader, PriorityBadge, Badge, Modal } from '../../../components/ui'
import { formatDistance } from '../../../utils/geoUtils'
import toast from 'react-hot-toast'

const WorkerMap = dynamic(() => import('../../../components/worker/WorkerMap'), { ssr: false })

const ISSUE_EMOJI = {
  full_dustbin: '🗑️', illegal_dumping: '⚠️', burning_waste: '🔥',
  missed_collection: '🚛', overflowing_bin: '💧', stray_animal_waste: '🐾', other: '📍',
}

const REASONS = [
  { value: 'unable_to_access', label: 'Unable to access the location' },
  { value: 'unsafe_location', label: 'Location is unsafe' },
  { value: 'waste_already_removed', label: 'Waste already removed' },
  { value: 'wrong_location', label: 'Wrong location / cannot find it' },
  { value: 'excessive_waste_volume', label: 'Too much waste for manual cleanup' },
  { value: 'requires_special_equipment', label: 'Needs special equipment' },
  { value: 'hazardous_material', label: 'Hazardous material' },
  { value: 'other', label: 'Other' },
]

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

function VerificationBadge({ verification }) {
  if (!verification || verification.status === 'pending') {
    return <span className="badge-gray">⏳ Not verified</span>
  }
  if (verification.status === 'verified') {
    return <span className="badge-resolved">✅ Verified · {(verification.cleanupScore * 100).toFixed(0)}%</span>
  }
  return <span className="badge-pending">🟡 Review required</span>
}

export default function WorkerTaskDetail() {
  const router = useRouter()
  const id = router.query.id
  const queryClient = useQueryClient()
  const [userLoc, setUserLoc] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportForm, setReportForm] = useState({ reason: '', notes: '', file: null })
  useWorkerSocket()

  useEffect(() => {
    if (!id || typeof window === 'undefined') return
    getPosition().then(pos => setUserLoc(pos))
  }, [id])

  const { data: task, isLoading } = useQuery({
    queryKey: ['worker-task', id],
    queryFn: () => workerAPI.task(id),
    select: d => d.data,
    enabled: Boolean(id),
    refetchInterval: 30_000,
  })

  const assignment = task?.assignment
  const status = assignment?.status
  const invalidate = () => {
    queryClient.invalidateQueries(['worker-task', id])
    queryClient.invalidateQueries(['worker-overview'])
    queryClient.invalidateQueries(['worker-tasks'])
    queryClient.invalidateQueries(['worker-me'])
  }

  const acceptMutation = useMutation({
    mutationFn: () => workerAPI.accept(id),
    onSuccess: () => { toast.success('Task accepted'); invalidate() },
    onError: () => toast.error('Could not accept task'),
  })

  const startMutation = useMutation({
    mutationFn: async () => {
      const pos = await getPosition()
      return workerAPI.start(id, pos?.lat || userLoc?.lat, pos?.lng || userLoc?.lng)
    },
    onSuccess: () => { toast.success('Cleanup started — capture BEFORE evidence'); invalidate() },
    onError: (err) => {
      const code = err?.response?.data?.code
      if (code === 'LOCATION_VERIFICATION_FAILED') toast.error('You are too far from the complaint — travel to the site')
      else toast.error(err?.response?.data?.message || 'Could not start task')
    },
  })

  const pauseMutation = useMutation({
    mutationFn: () => workerAPI.pause(id),
    onSuccess: () => { toast('Cleanup paused'); invalidate() },
  })

  const resumeMutation = useMutation({
    mutationFn: () => workerAPI.resume(id),
    onSuccess: () => { toast('Cleanup resumed'); invalidate() },
  })

  const evidenceMutation = useMutation({
    mutationFn: (formData) => workerAPI.evidence(id, formData),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Evidence saved')
      invalidate()
    },
    onError: () => toast.error('Upload failed'),
  })

  const verifyMutation = useMutation({
    mutationFn: () => workerAPI.verify(id),
    onSuccess: (res) => {
      const v = res.data?.verification
      if (v?.status === 'verified') toast.success(v.reason || 'Cleanup verified ✓')
      else toast(v.reason || 'Submitted for review')
      invalidate()
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Verification failed'),
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      const pos = await getPosition()
      return workerAPI.complete(id, pos?.lat || userLoc?.lat, pos?.lng || userLoc?.lng)
    },
    onSuccess: () => {
      toast.success('Task completed! Well done 🎉')
      invalidate()
      router.push('/worker/dashboard')
    },
    onError: (err) => {
      const code = err?.response?.data?.code
      if (code === 'EVIDENCE_REQUIRED') toast.error('After-cleanup photo is required before completing')
      else toast.error(err?.response?.data?.message || 'Could not complete task')
    },
  })

  const reportMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('reason', reportForm.reason)
      fd.append('notes', reportForm.notes || '')
      if (reportForm.file) fd.append('image', reportForm.file)
      return workerAPI.reportIssue(id, fd)
    },
    onSuccess: () => {
      toast.success('Issue reported — task returned to authority')
      setReportOpen(false)
      invalidate()
    },
    onError: () => toast.error('Could not report issue'),
  })

  if (isLoading || !task) return <WorkerLayout><PageLoader /></WorkerLayout>

  const loc = task.location || {}

  return (
    <WorkerLayout>
      <div className="space-y-5 max-w-3xl">
        <Link href="/worker/tasks">
          <span className="text-xs text-amber-700 font-medium hover:underline">← Back to tasks</span>
        </Link>

        <div className="card p-5">
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center text-2xl flex-shrink-0">
              {ISSUE_EMOJI[task.issueType] || '📍'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="page-title !text-xl capitalize">{task.issueLabel}</h1>
                {task.priority && <PriorityBadge priority={task.priority} />}
              </div>
              <p className="text-sm text-slate-400 mt-1">{task.address || 'Location captured'} · {formatDistance(task.distanceKm)} away</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge status={task.status === 'resolved' ? 'resolved' : task.status === 'pending' ? 'pending' : task.status} />
                <VerificationBadge verification={assignment?.verification} />
              </div>
            </div>
          </div>

          {task.description && (
            <p className="text-sm text-slate-600 mt-4 bg-slate-50 rounded-xl p-3">{task.description}</p>
          )}

          {task.hotspot && (
            <div className="mt-3 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
              🔥 Within {formatDistance(task.hotspot.distanceKm)} of an AI hotspot (severity {task.hotspot.severityScore}) — prioritize this.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="rounded-xl border border-slate-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">AI Type</div>
              <div className="text-sm font-semibold text-slate-800 capitalize">{task.aiResult?.wasteType || '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Confidence</div>
              <div className="text-sm font-semibold text-slate-800">{task.aiResult?.confidence ? (task.aiResult.confidence * 100).toFixed(0) + '%' : '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Reporter</div>
              <div className="text-sm font-semibold text-slate-800">{task.citizen?.name || 'Citizen'}</div>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Timer</div>
              <div className="text-sm font-semibold text-slate-800">
                {assignment?.timerSeconds ? `${Math.floor(assignment.timerSeconds / 60)} min` : '—'}
              </div>
            </div>
          </div>

          {/* Lifecycle actions */}
          {['assigned', 'accepted', 'in_progress'].includes(status) && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
              {status === 'assigned' && (
                <button className="btn-primary" onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                  {acceptMutation.isPending ? '…' : '🤝 Accept Task'}
                </button>
              )}
              {status === 'accepted' && (
                <button className="btn-primary" onClick={() => startMutation.mutate()} disabled={startMutation.isPending || !userLoc}>
                  {startMutation.isPending ? 'Verifying…' : '📍 Start Cleanup (GPS)'}
                </button>
              )}
              {status === 'in_progress' && (
                <>
                  <button
                    className={`btn-secondary`}
                    onClick={() => (assignment.paused ? resumeMutation.mutate() : pauseMutation.mutate())}
                  >
                    {assignment.paused ? '▶️ Resume' : '⏸ Pause'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {status === 'in_progress' && (
          <>
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">📍 Site Location</h3>
              </div>
              <div className="h-[260px]">
                {loc.lat && (
                  <WorkerMap
                    center={[loc.lat, loc.lng]}
                    userLoc={userLoc}
                    zoom={15}
                    tasks={[{ ...task, location: loc }]}
                  />
                )}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">📸 Evidence</h3>
                  <p className="text-xs text-slate-400 mt-0.5">BEFORE + AFTER photos are required for completion</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PhotoCapture
                  type="before"
                  label="BEFORE cleanup"
                  hint="Capture the waste pile before you start"
                  existingImage={assignment?.beforeImage}
                  isUploading={evidenceMutation.isPending}
                  onUpload={evidenceMutation.mutate}
                  onUploaded={invalidate}
                />
                <PhotoCapture
                  type="after"
                  label="AFTER cleanup"
                  hint="Capture the clean site when done"
                  existingImage={assignment?.afterImage}
                  isUploading={evidenceMutation.isPending}
                  onUpload={evidenceMutation.mutate}
                  onUploaded={invalidate}
                />
              </div>

              {assignment?.verification && assignment.verification.status !== 'pending' && (
                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm">
                  <div className="font-semibold text-slate-700 mb-1">Verification result</div>
                  <div className="text-slate-500">{assignment.verification.reason}</div>
                  {assignment.verification.method === 'ai_classifier_heuristic' && (
                    <div className="text-[11px] text-slate-400 mt-2">
                      Method: AI classifier heuristic · before {assignment.verification.beforeClassification?.class} ({((assignment.verification.beforeClassification?.confidence || 0) * 100).toFixed(0)}%) → after {assignment.verification.afterClassification?.class} ({((assignment.verification.afterClassification?.confidence || 0) * 100).toFixed(0)}%)
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                  title="Run AI verification on the captured evidence"
                >
                  {verifyMutation.isPending ? 'Analyzing…' : '🪄 Run AI Verification'}
                </button>
                <button
                  className={`btn-primary ${assignment?.afterImage ? '' : 'opacity-50'}`}
                  onClick={() => {
                    if (!assignment?.afterImage) return toast.error('After-cleanup photo is required first')
                    completeMutation.mutate()
                  }}
                  disabled={completeMutation.isPending}
                >
                  {completeMutation.isPending ? 'Completing…' : '✅ Mark Complete'}
                </button>
                <button className="btn-danger btn-sm" onClick={() => setReportOpen(true)}>
                  ↩️ Report Issue
                </button>
              </div>
            </div>
          </>
        )}

        {status === 'completed' && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">✅ Completed</h3>
            <div className="text-sm text-slate-500">
              Completed {assignment.completedAt ? format(new Date(assignment.completedAt), 'd MMM yyyy, h:mm a') : ''}.{' '}
              {assignment.verification?.status === 'verified' && `AI cleanup score ${(assignment.verification.cleanupScore * 100).toFixed(0)}%.`}
            </div>
            {assignment?.reportIssue && (
              <div className="mt-2 text-sm text-amber-700">Reported issue: {assignment.reportIssue.reason}</div>
            )}
            <Link href="/worker/history"><button className="btn-secondary btn-sm mt-4">View history →</button></Link>
          </div>
        )}

        {status === 'reassigned' && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">↩️ Returned to authority</h3>
            <p className="text-sm text-slate-500">This task was reported back and is no longer on your queue.</p>
          </div>
        )}
      </div>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report an issue">
        <div className="space-y-4">
          <div>
            <label className="label">Reason</label>
            <select className="select" value={reportForm.reason} onChange={e => setReportForm({ ...reportForm, reason: e.target.value })}>
              <option value="">Select a reason…</option>
              {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={3}
              value={reportForm.notes}
              onChange={e => setReportForm({ ...reportForm, notes: e.target.value })}
              placeholder="Describe what happened (optional)"
            />
          </div>
          <div>
            <label className="label">Photo (optional)</label>
            <input
              type="file"
              accept=".jpeg,.jpg,.png,.webp"
              className="input"
              onChange={e => setReportForm({ ...reportForm, file: e.target.files?.[0] || null })}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-secondary btn-sm" onClick={() => setReportOpen(false)}>Cancel</button>
            <button
              className="btn-danger btn-sm"
              disabled={!reportForm.reason || reportMutation.isPending}
              onClick={() => reportMutation.mutate()}
            >
              {reportMutation.isPending ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </div>
      </Modal>
    </WorkerLayout>
  )
}