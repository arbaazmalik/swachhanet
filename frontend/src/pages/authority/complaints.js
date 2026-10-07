import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

import { complaintsAPI, workersAPI, workforceAPI } from '../../utils/api'
import useAuthStore from '../../context/authStore'
import AuthorityLayout from '../../components/authority/AuthorityLayout'
import { Badge, PriorityBadge, Tabs, SearchInput, SectionCard, Modal } from '../../components/ui'

const ISSUE_EMOJI = {
  full_dustbin: '🗑️',
  illegal_dumping: '⚠️',
  burning_waste: '🔥',
  missed_collection: '🚛',
  overflowing_bin: '💧',
  stray_animal_waste: '🐾',
  other: '📍',
}

const ISSUE_TYPES = [
  'full_dustbin',
  'illegal_dumping',
  'burning_waste',
  'missed_collection',
  'overflowing_bin',
  'stray_animal_waste',
  'other',
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'priority_high', label: 'Priority high to low' },
  { value: 'priority_low', label: 'Priority low to high' },
]

const resolveImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';
  return `${baseUrl}${path}`;
}

export default function AuthorityComplaints() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [status, setStatus] = useState('all')
  const [issueType, setIssueType] = useState('')
  const [sort, setSort] = useState('priority_high')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [assignModal, setAssignModal] = useState(null)
  const [workerId, setWorkerId] = useState('')
  const [notes, setNotes] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['auth-complaints', status, issueType, sort, page],
    queryFn: () =>
      complaintsAPI.list({
        status: status === 'all' ? undefined : status,
        issue_type: issueType || undefined,
        sort,
        ward_id: user?.wardId,
        page,
        limit: 20,
      }),
    select: d => d.data,
    keepPreviousData: true,
    refetchInterval: 30000,
    enabled: Boolean(user?.role && ['authority', 'admin'].includes(user.role)),
  })

  const { data: workersData } = useQuery({
    queryKey: ['workers', user?.wardId],
    queryFn: () => workersAPI.list({ ward_id: user?.wardId }),
    select: d => d.data,
    enabled: Boolean(user?.role && ['authority', 'admin'].includes(user.role)),
  })

  const assignMut = useMutation({
    mutationFn: ({ id, wid }) => complaintsAPI.assign(id, wid, notes),
    onSuccess: () => {
      toast.success('Assigned successfully')
      qc.invalidateQueries(['auth-complaints'])
      qc.invalidateQueries(['authority-dashboard'])
      setAssignModal(null)
      setWorkerId('')
      setNotes('')
    },
    onError: err => toast.error(err?.response?.data?.message || 'Assignment failed'),
  })

  const demoWorkerMut = useMutation({
    mutationFn: () => workersAPI.createDemo(),
    onSuccess: resp => {
      const demoWorker = resp?.data?.worker || (resp?.data?.workers && resp.data.workers[0])
      if (demoWorker?._id) {
        setWorkerId(demoWorker._id)
        toast.success(`Demo workers ready! Selected ${demoWorker.name}`)
      }
      qc.invalidateQueries(['workers', user?.wardId])
      qc.invalidateQueries(['all-workers-v2', user?.wardId])
    },
    onError: () => toast.error('Failed to create demo worker'),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status: nextStatus }) => complaintsAPI.updateStatus(id, nextStatus),
    onSuccess: () => {
      toast.success('Status updated')
      qc.invalidateQueries(['auth-complaints'])
    },
  })

  const smartAssignMut = useMutation({
    mutationFn: id => workforceAPI.assign(id),
    onSuccess: resp => {
      toast.success(`Smart-assigned to ${resp.worker?.name || 'nearest worker'}`)
      qc.invalidateQueries(['auth-complaints'])
      qc.invalidateQueries(['all-workers-v2'])
    },
    onError: err => toast.error(err?.response?.data?.message || 'Smart assignment failed'),
  })

  const complaints = data?.data || []
  const filteredComplaints = complaints.filter(c =>
    !search || c.address?.toLowerCase().includes(search.toLowerCase())
  )
  const selectedSortLabel = SORT_OPTIONS.find(option => option.value === sort)?.label || 'Priority high to low'

  const STATUS_TABS = [
    { value: 'all', label: 'All', count: data?.meta?.total },
    { value: 'pending', label: 'Pending' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
  ]

  return (
    <AuthorityLayout>
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">Complaint Management</h1>
            <p className="page-sub">Review, assign, and resolve waste complaints</p>
          </div>
          <button onClick={() => { window.location.href = '/authority/reports' }} className="btn-secondary">
            Export CSV
          </button>
        </div>

        <SectionCard>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 p-4 border-b border-slate-100">
            <Tabs tabs={STATUS_TABS} active={status} onChange={value => { setStatus(value); setPage(1) }} />
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="select w-auto text-sm"
                value={issueType}
                onChange={e => { setIssueType(e.target.value); setPage(1) }}
              >
                <option value="">All issue types</option>
                {ISSUE_TYPES.map(type => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <select
                aria-label="Sort complaints"
                className="select w-auto text-sm"
                value={sort}
                onChange={e => { setSort(e.target.value); setPage(1) }}
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <SearchInput value={search} onChange={setSearch} placeholder="Search location..." />
            </div>
          </div>
          <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100 bg-slate-50/60">
            Showing {filteredComplaints.length} of {complaints.length} complaints on this page, sorted by {selectedSortLabel.toLowerCase()}.
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-slate-400">Loading complaints...</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Issue</th>
                    <th>Location</th>
                    <th>Priority</th>
                    <th>AI Detection</th>
                    <th>Reporter</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComplaints.map(c => (
                    <tr key={c._id}>
                      <td>
                        {c.imageUrl ? (
                          <a href={resolveImageUrl(c.imageUrl)} target="_blank" rel="noreferrer" className="block w-12 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:opacity-80 transition-opacity">
                            <img src={resolveImageUrl(c.imageUrl)} alt="complaint" className="w-full h-full object-cover" />
                          </a>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 text-[10px]">
                            No image
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span>{ISSUE_EMOJI[c.issueType] || '📍'}</span>
                          <span className="font-medium capitalize">{c.issueType.replace(/_/g, ' ')}</span>
                        </div>
                      </td>
                      <td className="text-xs text-slate-500 max-w-[180px]">
                        <span className="font-medium text-slate-700 block truncate">{c.address || 'Location captured'}</span>
                        {c.location?.coordinates && (
                          <a 
                            href={`https://www.google.com/maps?q=${c.location.coordinates[1]},${c.location.coordinates[0]}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            📍 {c.location.coordinates[1].toFixed(5)}, {c.location.coordinates[0].toFixed(5)}
                          </a>
                        )}
                      </td>
                      <td><PriorityBadge priority={c.priority} /></td>
                      <td>
                        {c.aiResult?.wasteType ? (
                          <span className="text-xs text-green-700 font-medium capitalize">
                            {c.aiResult.wasteType} · {Math.round(c.aiResult.confidence * 100)}%
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-sm text-slate-600">{c.userId?.name || 'Citizen'}</td>
                      <td className="text-xs text-slate-400 whitespace-nowrap">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </td>
                      <td><Badge status={c.status} /></td>
                      <td>
                        <div className="flex flex-col sm:flex-row items-center gap-1">
                          {c.status === 'pending' && (
                            <button
                              onClick={() => smartAssignMut.mutate(c._id)}
                              disabled={smartAssignMut.isPending}
                              className="btn-primary btn-sm text-[10px] px-2 py-1"
                            >
                              {smartAssignMut.isPending ? '...' : 'Smart Assign'}
                            </button>
                          )}
                          <button
                            onClick={() => setAssignModal(c)}
                            className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-2 py-1 rounded text-[10px] font-medium transition-colors"
                          >
                            Manual
                          </button>
                          {c.status !== 'resolved' && (
                            <button
                              onClick={() => statusMut.mutate({ id: c._id, status: 'resolved' })}
                              className="btn-secondary btn-sm text-[10px] px-2 py-1"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredComplaints.length && (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-400">
                        {complaints.length ? 'No complaints match the current search' : 'No complaints found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {data?.meta && data.meta.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-sm">
              <span className="text-slate-500">
                Page {data.meta.page} of {data.meta.pages} · {data.meta.total} total
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="btn-secondary btn-sm"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(current => Math.min(data.meta.pages, current + 1))}
                  disabled={page === data.meta.pages}
                  className="btn-secondary btn-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Assign Complaint to Worker" width="max-w-md">
        {assignModal && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl text-sm">
              <div className="font-medium text-slate-800 capitalize">{assignModal.issueType?.replace(/_/g, ' ')}</div>
              <div className="text-slate-500 text-xs mt-1">{assignModal.address}</div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Select Worker</label>
                <button
                  type="button"
                  onClick={() => demoWorkerMut.mutate()}
                  disabled={demoWorkerMut.isPending}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 transition-all flex items-center gap-1"
                >
                  <span>➕</span> {demoWorkerMut.isPending ? 'Adding Demo Workers...' : 'Add Demo Workers'}
                </button>
              </div>

              <select className="select w-full mt-1" value={workerId} onChange={e => setWorkerId(e.target.value)}>
                <option value="">Choose worker to assign...</option>
                {(workersData?.workers || []).map(w => (
                  <option key={w._id} value={w._id}>
                    {w.name} ({w.zone || 'Zone A'}) — {w.status === 'available' ? '✅ Available' : `● ${w.status}`}
                  </option>
                ))}
              </select>
              {(!workersData?.workers || workersData.workers.length === 0) && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <span>⚠️</span> No workers in list. Click <strong>Add Demo Workers</strong> above!
                </p>
              )}
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea
                className="input resize-none h-20"
                placeholder="Instructions for the worker..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  if (!assignModal?._id || String(assignModal._id).length < 12) {
                    toast.error('Invalid complaint id')
                    return
                  }
                  assignMut.mutate({ id: assignModal._id, wid: workerId })
                }}
                disabled={!workerId || assignMut.isPending}
                className="btn-primary flex-1"
              >
                {assignMut.isPending ? 'Assigning...' : 'Assign Worker'}
              </button>
              <button onClick={() => setAssignModal(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </AuthorityLayout>
  )
}
