import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import toast from 'react-hot-toast'
import useAuthStore from '../context/authStore'

export default function LoginPage() {
  const router  = useRouter()
  const login   = useAuthStore(s => s.login)
  const [portal, setPortal]   = useState('authority') // Default to authority or citizen, tab selection
  const [form, setForm]       = useState({ phone: '+919876543211', password: 'authority123' })
  const [loading, setLoading] = useState(false)

  const handlePortalSwitch = (selectedPortal) => {
    setPortal(selectedPortal)
    if (selectedPortal === 'authority') {
      setForm({ phone: '+919876543211', password: 'authority123' })
    } else {
      setForm({ phone: '+919876543210', password: 'citizen123' })
    }
  }

  const handleSubmit = async (e, customPhone, customPass) => {
    if (e) e.preventDefault()
    setLoading(true)
    const phoneToUse = customPhone || form.phone
    const passToUse  = customPass  || form.password

    try {
      const { role } = await login(phoneToUse, passToUse)
      toast.success(`Welcome back! Logged in as ${role === 'authority' || role === 'admin' ? 'ULB Authority' : 'Citizen'}`)
      router.push(role === 'authority' || role === 'admin' ? '/authority/dashboard' : '/citizen/dashboard')
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Invalid credentials'
      if (err.response?.data?.code === 'UNVERIFIED') {
        toast.error('Phone not verified')
        router.push(`/verify-otp?phone=${phoneToUse}`)
      } else {
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-slate-900 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 text-white">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center text-2xl shadow-lg">🌿</div>
          <div>
            <div className="text-2xl font-bold">SwachhaNet</div>
            <div className="text-green-400 text-sm">Digital Brain for Waste Management</div>
          </div>
        </div>
        <h1 className="text-4xl font-bold leading-tight mb-4">
          Cleaner Cities,<br/>Smarter Management
        </h1>
        <p className="text-slate-400 text-lg mb-8 leading-relaxed">
          AI-powered waste management platform for Urban Local Bodies (ULBs) and Citizens.
          Real-time heatmap tracking, AI waste classification, and workforce allocation.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: '🏛️', title: 'Authority Portal', desc: 'Manage complaints, workforce, & AI hotspots' },
            { icon: '📸', title: 'AI Waste Classifier', desc: 'Auto-identify wet, dry, plastic, & hazardous' },
            { icon: '🗺️', title: 'Live Heatmaps', desc: 'Visualize complaint intensity across ULB wards' },
            { icon: '🏆', title: 'Citizen Gamification', desc: 'Reward citizens for verified reports & quizzes' },
          ].map(f => (
            <div key={f.title} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-green-500/50 transition-all">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="font-semibold text-sm mb-1">{f.title}</div>
              <div className="text-slate-400 text-xs">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="auth-card w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center text-xl">🌿</div>
            <div className="font-bold text-slate-800">SwachhaNet</div>
          </div>

          {/* Portal Selector Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-6 border border-slate-200">
            <button
              type="button"
              onClick={() => handlePortalSwitch('authority')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                portal === 'authority'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏛️ Authority Section
            </button>
            <button
              type="button"
              onClick={() => handlePortalSwitch('citizen')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                portal === 'citizen'
                  ? 'bg-green-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👤 Citizen Section
            </button>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            {portal === 'authority' ? 'Authority Portal Login' : 'Citizen Login'}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {portal === 'authority'
              ? 'Access ULB ward oversight, complaints dashboard & workforce'
              : 'Sign in to report waste and view eco leaderboard'}
          </p>

          {/* Quick Demo Login Buttons */}
          <div className="mb-6 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider flex items-center gap-1">
              <span>⚡</span> 1-Click Demo Login:
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  handlePortalSwitch('authority')
                  handleSubmit(null, '+919876543211', 'authority123')
                }}
                className="py-2 px-3 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all"
              >
                🏛️ Authority Demo
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePortalSwitch('citizen')
                  handleSubmit(null, '+919876543210', 'citizen123')
                }}
                className="py-2 px-3 bg-green-50 border border-green-200 hover:bg-green-100 text-green-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all"
              >
                👤 Citizen Demo
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Mobile Number</label>
              <input type="tel" placeholder="+919876543211" className="input"
                value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" placeholder="Enter your password" className="input"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 mt-2 rounded-xl text-white font-semibold transition-all shadow-md ${
                portal === 'authority' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {loading ? 'Signing in...' : `Sign In to ${portal === 'authority' ? 'Authority Portal' : 'Citizen Section'}`}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            New to SwachhaNet?{' '}
            <Link href="/register" className="text-green-600 font-medium hover:underline">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
