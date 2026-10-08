'use client'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const ISSUE_EMOJI = {
  full_dustbin: '🗑️', illegal_dumping: '⚠️', burning_waste: '🔥',
  missed_collection: '🚛', overflowing_bin: '💧', stray_animal_waste: '🐾', other: '📍',
}

const PRIORITY_RING = { 3: 'ring-red-500', 2: 'ring-amber-500', 1: 'ring-emerald-500' }

function ChangeView({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [center, zoom, map])
  return null
}

export default function WorkerMap({ center, zoom = 14, tasks = [], userLoc, onSelect }) {
  const markerRefs = useRef({})

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {userLoc && (
        <Marker
          position={[userLoc.lat, userLoc.lng]}
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `
              <div class="relative flex items-center justify-center">
                <div class="absolute w-8 h-8 bg-amber-500 rounded-full opacity-20 animate-ping"></div>
                <div class="w-4 h-4 rounded-full bg-amber-600 border-2 border-white shadow-xl z-10"></div>
              </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          })}
        >
          <Popup className="custom-popup">
            <div className="text-sm font-semibold">You are here</div>
          </Popup>
        </Marker>
      )}

      {tasks.map((t) => (
        <Marker
          key={t.id}
          ref={el => { if (el) markerRefs.current[t.id] = el }}
          position={[t.location.lat, t.location.lng]}
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `
              <div class="relative">
                <div class="w-10 h-10 rounded-2xl ${PRIORITY_RING[t.priority] || 'ring-slate-300'} ring-2 border-2 border-white bg-white shadow-lg flex items-center justify-center text-lg">
                  ${ISSUE_EMOJI[t.issueType] || '📍'}
                </div>
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-r border-b border-white"></div>
              </div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40],
          })}
        >
          <Popup className="custom-popup">
            <div className="w-56 p-1">
              <div className="text-sm font-bold text-slate-800 capitalize">{t.issueLabel}</div>
              <div className="text-xs text-slate-500 mt-1">{t.address || 'Location captured'}</div>
              <div className="mt-2 text-xs font-semibold text-slate-600">
                {t.distanceKm ? `${(t.distanceKm < 1 ? t.distanceKm * 1000 + ' m' : t.distanceKm.toFixed(1) + ' km')} away` : '—'}
              </div>
              {onSelect && (
                <button
                  onClick={() => onSelect(t)}
                  className="mt-2 w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-center rounded-lg text-[11px] font-bold uppercase tracking-wide"
                >
                  Open task →
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      {userLoc && <ChangeView center={[userLoc.lat, userLoc.lng]} zoom={zoom} />}

      <style jsx global>{`
        .leaflet-popup-content-wrapper {
          border-radius: 16px;
          padding: 4px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </MapContainer>
  )
}