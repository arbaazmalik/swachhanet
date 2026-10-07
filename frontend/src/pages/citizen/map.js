'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { mapAPI } from '../../utils/api'
import CitizenLayout from '../../components/shared/CitizenLayout'
import { SectionCard } from '../../components/ui'
import toast from 'react-hot-toast'
import { RECYCLING_CENTERS } from '../../utils/centersData'
import { calculateDistance, formatDistance } from '../../utils/geoUtils'

// Dynamic import for Leaflet map component (SSR: false)
const LeafletMap = dynamic(() => import('../../components/shared/LeafletMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">Loading map...</div>
})

const FILTERS = [
  { value: '',          label: 'All Centers',   emoji: '🏢' },
  { value: 'recycling', label: 'Recycling',      emoji: '♻️' },
  { value: 'scrap',     label: 'Scrap Dealers',  emoji: '🔧' },
  { value: 'ewaste',    label: 'E-Waste',         emoji: '💻' },
  { value: 'organic',   label: 'Compost/Organic', emoji: '🌱' },
]

const CITIES = [
  { name: 'Pune (Ward 14)', lat: 18.5204, lng: 73.8567 },
  { name: 'Dhampur',        lat: 29.2882, lng: 78.5031 },
  { name: 'New Delhi',      lat: 28.6139, lng: 77.2090 },
  { name: 'Mumbai',         lat: 19.0760, lng: 72.8777 },
]

export default function MapPage() {
  const [filter,      setFilter]      = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [centers,     setCenters]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [userLoc,     setUserLoc]     = useState(null)
  const [locating,    setLocating]    = useState(false)
  const [hoveredId,   setHoveredId]   = useState(null)

  const DEFAULT_LOC = { lat: 18.5204, lng: 73.8567 } // Pune Ward 14

  const locateUser = (isManual = false) => {
    setLocating(true)

    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser')
      setUserLoc(prev => prev || DEFAULT_LOC)
      setLocating(false)
      return
    }

    // Always show the map immediately with a default so the spinner never blocks
    setUserLoc(prev => prev || DEFAULT_LOC)

    const onSuccess = pos => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setUserLoc(coords)
      setLocating(false)
      if (isManual) toast.success('📍 Located your current position!')
    }

    const onError = (err, retried = false) => {
      console.warn('Geolocation error:', err.message)
      if (!retried) {
        // Retry without high accuracy (works better on desktop / some browsers)
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          e => onError(e, true),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        )
      } else {
        setLocating(false)
        if (isManual) toast.error('Could not get your location. Using default.')
      }
    }

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      err => onError(err, false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    )
  }

  useEffect(() => {
    locateUser(false)
  }, [])

  useEffect(() => { 
    if (userLoc) fetchCenters(userLoc.lat, userLoc.lng, filter) 
  }, [userLoc, filter])

  const fetchCenters = async (lat, lng, type) => {
    setLoading(true)
    try {
      const { data } = await mapAPI.centers(lat, lng, 5000, type)
      const apiCenters = data?.centers || []
      
      if (apiCenters.length > 0) {
        setCenters(apiCenters)
      } else {
        setCenters(RECYCLING_CENTERS)
      }
    } catch (err) { 
      setCenters(RECYCLING_CENTERS)
    } finally { 
      setLoading(false) 
    }
  }

  // Derived filtered & sorted list
  const displayCenters = centers
    .filter(c => !filter || c.type === filter)
    .filter(c => !searchQuery || 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.address.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .map(c => ({
      ...c,
      distance: userLoc ? calculateDistance(userLoc.lat, userLoc.lng, c.lat, c.lng) : null
    }))
    .sort((a, b) => (a.distance || 0) - (b.distance || 0))

  return (
    <div className="pb-10">
      <div className="page-header">
        <div>
          <h1 className="page-title text-3xl font-bold text-slate-800">Map & Recycling Centers</h1>
          <p className="page-sub text-slate-500 mt-1">Find nearby recycling centers, scrap dealers, and drop-off points</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => locateUser(true)}
            disabled={locating}
            className="btn-primary flex items-center gap-2 text-sm shadow-md"
          >
            <span>📍</span> {locating ? 'Locating...' : 'Locate Me'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Map Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            {/* Filter pills */}
            <div className="flex gap-2 flex-wrap items-center">
              {FILTERS.map(f => (
                <button 
                  key={f.value} 
                  onClick={() => setFilter(f.value)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 border
                    ${filter === f.value 
                      ? 'bg-green-600 text-white border-green-600 shadow-md shadow-green-100' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-green-400 hover:bg-green-50'}`}
                >
                  {f.emoji} {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                aria-label="City preset"
                className="select text-xs py-2 px-3 border border-slate-200 rounded-xl bg-white"
                onChange={e => {
                  const city = CITIES.find(c => c.name === e.target.value)
                  if (city) {
                    setUserLoc({ lat: city.lat, lng: city.lng })
                    toast.success(`Location set to ${city.name}`)
                  }
                }}
              >
                <option value="">Jump to City...</option>
                {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>

              {/* Search */}
              <div className="relative flex-1 md:w-56">
                <input 
                  type="text" 
                  placeholder="Search name/area..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
                />
                <span className="absolute right-3 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden shadow-xl border-none ring-1 ring-slate-100 rounded-2xl">
            <div className="w-full h-[520px]">
              {userLoc ? (
                <LeafletMap 
                  center={[userLoc.lat, userLoc.lng]} 
                  zoom={14} 
                  markers={displayCenters} 
                  userLoc={userLoc}
                  hoveredId={hoveredId}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <p className="text-sm font-medium">Initializing Map...</p>
                </div>
              )}
            </div>
          </div>
          {loading && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce delay-75"></div>
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce delay-150"></div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Updating Results</span>
            </div>
          )}
        </div>

        {/* Centers list */}
        <div className="flex flex-col h-full">
          <SectionCard 
            title={`Nearby Results (${displayCenters.length})`}
            className="h-full flex flex-col shadow-lg border-none rounded-2xl overflow-hidden"
          >
            <div className="divide-y divide-slate-100 overflow-y-auto custom-scrollbar" style={{ maxHeight: '600px' }}>
              {displayCenters.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <div className="text-4xl">🏜️</div>
                  <h3 className="text-slate-800 font-semibold">No centers found</h3>
                  <p className="text-sm text-slate-400">Try adjusting your filters or search query.</p>
                  <button 
                    onClick={() => {setFilter(''); setSearchQuery('')}}
                    className="text-xs font-bold text-green-600 hover:underline"
                  >
                    Reset all filters
                  </button>
                </div>
              ) : displayCenters.map(c => (
                <div 
                  key={c.id} 
                  onMouseEnter={() => setHoveredId(c.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`group flex items-start gap-4 px-5 py-4 transition-all cursor-pointer border-l-4
                    ${hoveredId === c.id ? 'bg-green-50 border-green-500' : 'hover:bg-slate-50 border-transparent'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 transition-transform group-hover:scale-110 shadow-sm
                    ${c.type === 'recycling' ? 'bg-green-100 text-green-600' : 
                      c.type === 'ewaste' ? 'bg-blue-100 text-blue-600' :
                      c.type === 'organic' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                    {c.type === 'recycling' ? '♻️' : c.type === 'ewaste' ? '💻' : c.type === 'organic' ? '🌱' : '🔧'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-800 truncate">{c.name}</h3>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter whitespace-nowrap">
                        {c.type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
                      <span className="opacity-50">📍</span> {c.address}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      {c.distance !== null && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md font-bold">
                            {formatDistance(c.distance)}
                          </span>
                        </div>
                      )}
                      {c.rating && (
                        <div className="flex items-center gap-0.5 text-xs text-amber-500 font-bold">
                          <span>★</span> {c.rating}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  )
}

MapPage.getLayout = page => <CitizenLayout>{page}</CitizenLayout>

