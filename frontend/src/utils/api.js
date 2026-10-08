import axios from 'axios'
import Cookies from 'js-cookie'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'
let refreshPromise = null

function clearAuthCookies() {
  Cookies.remove('accessToken')
  Cookies.remove('refreshToken')
}

async function refreshAccessToken() {
  const refreshToken = Cookies.get('refreshToken')
  if (!refreshToken) {
    throw new Error('Missing refresh token')
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
      .then(({ data }) => {
        const payload = data?.data || data
        Cookies.set('accessToken', payload.accessToken, { expires: 1 / 96 }) // 15min
        Cookies.set('refreshToken', payload.refreshToken, { expires: 7 })
        return payload.accessToken
      })
      .catch((err) => {
        clearAuthCookies()
        throw err
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => {
    if (res?.data && typeof res.data === 'object' && Object.prototype.hasOwnProperty.call(res.data, 'success')) {
      res.data = res.data.data ?? res.data
    }
    return res
  },
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const code = error.response?.data?.code
    const refreshToken = Cookies.get('refreshToken')
    const isAuthPath = typeof original?.url === 'string' && original.url.startsWith('/auth/')
    const canRetryWithRefresh =
      status === 401 &&
      !original?._retry &&
      !!refreshToken &&
      !isAuthPath

    if (canRetryWithRefresh) {
      original._retry = true
      try {
        const accessToken = await refreshAccessToken()
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch {
        clearAuthCookies()
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }

    // If token is expired and we cannot refresh, force clean logout state.
    if (status === 401 && (code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED' || !refreshToken)) {
      clearAuthCookies()
    }
    return Promise.reject(error)
  }
)

export default api

// ── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (phone, password) => api.post('/auth/login', { phone, password }),
  verifyOTP: (phone, otp) => api.post('/auth/otp/verify', { phone, otp }),
  sendOTP: (phone) => api.post('/auth/otp/send', { phone }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
  updateMe: (payload) => api.put('/auth/me', payload),
  getSettings: () => api.get('/auth/settings'),
  updateSettings: (payload) => api.put('/auth/settings', payload),
}

// ── Complaints ───────────────────────────────────────────────────────────────
export const complaintsAPI = {
  submit: (formData) => api.post('/complaints', formData),
  list: (params) => api.get('/complaints', { params }),
  get: (id) => api.get(`/complaints/${id}`),
  updateStatus: (id, status, note) =>
    api.put(`/complaints/${id}/status`, { status, rejection_note: note }),
  assign: (id, workerId, notes) =>
    api.post(`/complaints/${id}/assign`, { worker_id: workerId, notes }),
  upvote: (id) => api.post(`/complaints/${id}/upvote`),
}

// ── AI ───────────────────────────────────────────────────────────────────────
export const aiAPI = {
  classify: (formData) => api.post('/ai/classify', formData),
  status: () => api.get('/ai/status'),
  hotspots: (params) => api.get('/ai/hotspots', { params }),
  refreshHotspots: (wardId, days = 7) => api.post('/ai/hotspots/refresh', { ward_id: wardId, days }),
  heatmap: (params) => api.get('/ai/heatmap', { params }),

  predictWaste: (formData) => api.post('/ai/predict-waste', formData),
  detectHotspot: (coordinates) => api.post('/ai/detect-hotspot', { coordinates }),
  predictTrend: (historicalData, forecastDays) => api.post('/ai/predict-trend', { 
    historical_data: historicalData, 
    forecast_days: forecastDays 
  }),
}

// ── Map ──────────────────────────────────────────────────────────────────────
export const mapAPI = {
  centers: (lat, lng, radius, type) =>
    api.get('/map/centers', { params: { lat, lng, radius, type } }),
  bins: (wardId) => api.get('/map/bins', { params: { ward_id: wardId } }),
}

export const learningAPI = {
  modules: (category) => api.get('/learning/modules', { params: category ? { category } : {} }),
  module: (id) => api.get(`/learning/module/${id}`),
}

export const quizAPI = {
  getByModule: (moduleId) => api.get(`/quiz/${moduleId}`),
  submit: (payload) => api.post('/quiz/submit', payload),
  result: (moduleId) => api.get(`/quiz/${moduleId}/result`),
}

export const userAPI = {
  progress: () => api.get('/user/progress'),
}

// ── Gamification ──────────────────────────────────────────────────────────────
export const gamificationAPI = {
  leaderboard: (wardId) => api.get('/gamification/leaderboard', { params: { ward_id: wardId } }),
  me: () => api.get('/gamification/me'),
  update: (payload) => api.post('/gamification/update', payload),
}

// ── Workers ──────────────────────────────────────────────────────────────────
export const workersAPI = {
  list: (params) => api.get('/workers', { params }),
  createDemo: () => api.post('/workers/demo'),
  updateStatus: (id, status, lat, lng) =>
    api.put(`/workers/${id}/status`, { status, lat, lng }),
}

export const workforceAPI = {
  list: (params) => api.get('/workforce', { params }),
  add: (data) => api.post('/workforce', data),
  assign: (complaintId) => api.patch('/workforce/assign', { complaint_id: complaintId }),
  updateLocation: (id, lat, lng) => api.patch(`/workforce/${id}/location`, { lat, lng }),
}

// ── Worker Self-Service (mobile field dashboard) ─────────────────────────────
export const workerAPI = {
  me: () => api.get('/workforce/me'),
  overview: () => api.get('/workforce/overview'),
  tasks: (status) => api.get('/workforce/tasks', { params: status ? { status } : {} }),
  task: (id) => api.get(`/workforce/tasks/${id}`),
  updateStatus: (status) => api.patch('/workforce/status', { status }),
  updateLocation: (lat, lng) => api.patch('/workforce/location', { lat, lng }),
  accept: (id) => api.post(`/workforce/tasks/${id}/accept`),
  start: (id, lat, lng) => api.post(`/workforce/tasks/${id}/start`, { lat, lng }),
  pause: (id) => api.post(`/workforce/tasks/${id}/pause`),
  resume: (id) => api.post(`/workforce/tasks/${id}/resume`),
  evidence: (id, formData) => api.post(`/workforce/tasks/${id}/evidence`, formData),
  verify: (id) => api.post(`/workforce/tasks/${id}/verify`),
  complete: (id, lat, lng) => api.post(`/workforce/tasks/${id}/complete`, { lat, lng }),
  reportIssue: (id, formData) => api.post(`/workforce/tasks/${id}/report-issue`, formData),
  route: () => api.get('/workforce/route'),
  performance: () => api.get('/workforce/performance'),
  history: (params) => api.get('/workforce/history', { params }),
}

// ── Reports ──────────────────────────────────────────────────────────────────
export const reportsAPI = {
  dashboard: (params) => api.get('/reports/dashboard', { params }),
  export: (params) => api.get('/reports/export', { params, responseType: 'blob' }),
  participation: (wardId) =>
    api.get('/reports/citizen-participation', { params: { ward_id: wardId } }),
}

// ── Notifications ────────────────────────────────────────────────────────────
export const notificationsAPI = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
}
