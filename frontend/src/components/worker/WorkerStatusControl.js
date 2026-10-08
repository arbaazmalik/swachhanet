import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workerAPI } from '../../utils/api'
import toast from 'react-hot-toast'

const STATUS_META = {
  available: { label: 'Available', dot: 'dot-green',  cls: 'badge-resolved', icon: '🟢' },
  busy:      { label: 'On Task',   dot: 'dot-amber',  cls: 'badge-pending',  icon: '🟠' },
  break:     { label: 'On Break',  dot: 'dot-gray',   cls: 'badge-gray',     icon: '⏸️' },
  offline:   { label: 'Offline',   dot: 'dot-gray',   cls: 'badge-gray',     icon: '⚪' },
}

export default function WorkerStatusControl() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: me } = useQuery({
    queryKey: ['worker-me'],
    queryFn: () => workerAPI.me(),
    select: d => d.data?.worker,
    refetchInterval: 30_000,
    enabled: typeof window !== 'undefined' && !!window.navigator.onLine,
    retry: false,
  })

  const current = STATUS_META[me?.status] || STATUS_META.available

  const mutation = useMutation({
    mutationFn: (status) => workerAPI.updateStatus(status),
    onSuccess: () => {
      queryClient.invalidateQueries(['worker-me'])
      toast.success('Status updated')
    },
    onError: () => toast.error('Could not update status'),
  })

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`${current.cls} btn-sm flex items-center gap-1.5 cursor-pointer`}
      >
        <span className={`${current.dot} inline-block`} />
        {current.label}
        <span className="text-[8px]">▼</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl border border-slate-100 shadow-2xl p-2 w-44">
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <button
                key={value}
                onClick={() => {
                  mutation.mutate(value)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className={meta.dot} />
                {meta.label}
                {me?.status === value && <span className="ml-auto text-green-600">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}