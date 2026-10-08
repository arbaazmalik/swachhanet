import Link from 'next/link'
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function RouteMap({ route, startLoc }) {
  const start = startLoc?.coordinates
    ? { lat: startLoc.coordinates[1], lng: startLoc.coordinates[0] }
    : null

  const points = route.filter(r => r.location?.lat).map(r => [r.location.lat, r.location.lng])
  const linePositions = start ? [[start.lat, start.lng], ...points] : points

  const center = points.length
    ? { lat: points.reduce((s, p) => s + p[0], 0) / points.length, lng: points.reduce((s, p) => s + p[1], 0) / points.length }
    : { lat: 18.5204, lng: 73.8567 }

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {start && (
        <Marker
          position={[start.lat, start.lng]}
          icon={L.divIcon({ className: 'custom-div-icon', html: '<div class="w-4 h-4 rounded-full bg-amber-600 border-2 border-white shadow-xl"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })}
        >
          <Popup><div className="text-sm font-semibold">Your location</div></Popup>
        </Marker>
      )}
      {linePositions.length > 1 && (
        <Polyline positions={linePositions} pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.8 }} />
      )}
      {route.map((r, i) => (
        <Marker
          key={r.id}
          position={[r.location.lat, r.location.lng]}
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `
              <div class="relative">
                <div class="w-9 h-9 rounded-full border-2 border-white bg-amber-600 text-white font-bold text-sm flex items-center justify-center shadow-lg">${i + 1}</div>
              </div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18],
          })}
        >
          <Tooltip direction="top" offset={[0, -18]} opacity={1}>
            <div className="text-xs font-semibold capitalize">{r.issueLabel}</div>
          </Tooltip>
          <Popup>
            <div className="w-48 p-1">
              <div className="text-sm font-bold text-slate-800 capitalize">{r.issueLabel}</div>
              <div className="text-xs text-slate-500 mt-1">{r.address || 'Location captured'}</div>
              <div className="text-[11px] font-semibold text-amber-700 mt-1.5">{r.distanceKm} km · cum. {r.cumulativeKm} km</div>
              <Link href={`/worker/tasks/${r.id}`}>
                <button className="mt-2 w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold uppercase">Open task</button>
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}