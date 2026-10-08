import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSocket } from '../utils/socket'
import toast from 'react-hot-toast'

const RELEVANT_EVENTS = [
  'task.assigned',
  'task.verification_completed',
  'task.issue_reported',
  'complaint.assigned',
  'complaint.status_changed',
  'complaint.resolved',
]

/**
 * Keeps the worker dashboard in sync with realtime server events.
 * Invalidate worker + notification query keys so the UI reflects new
 * assignments, status changes, verification results and resolutions.
 */
export default function useWorkerSocket() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const refetchAll = () => {
      queryClient.invalidateQueries(['worker-overview'])
      queryClient.invalidateQueries(['worker-tasks'])
      queryClient.invalidateQueries(['worker-route'])
      queryClient.invalidateQueries(['worker-me'])
      queryClient.invalidateQueries(['worker-notif-count'])
      queryClient.invalidateQueries(['notifications'])
    }

    const onEvent = (event, data) => {
      switch (event) {
        case 'task.assigned':
        case 'complaint.assigned':
          toast.success('New task assigned to you')
          break
        case 'task.verification_completed':
          toast(`Verification: ${data?.verification?.status === 'verified' ? '✅ Cleanup verified' : '🟡 Needs review'}`)
          break
        case 'complaint.resolved':
          toast.success('A cleanup was completed')
          break
        case 'task.issue_reported':
          toast('Task returned to authority')
          break
        case 'notification.created':
          queryClient.invalidateQueries(['worker-notif-count'])
          queryClient.invalidateQueries(['notifications'])
          return
        default:
          break
      }
      refetchAll()
    }

    RELEVANT_EVENTS.forEach(event => socket.on(event, (data) => onEvent(event, data)))
    socket.on('notification.created', (data) => onEvent('notification.created', data))

    return () => {
      RELEVANT_EVENTS.forEach(event => socket.off(event))
      socket.off('notification.created')
    }
  }, [queryClient])
}