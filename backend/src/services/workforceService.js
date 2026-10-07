const Worker = require('../models/Worker');

/**
 * Calculates the Haversine distance between two points in km.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Finds the best worker for a given complaint based on:
 * 1. Status (must be 'available')
 * 2. Ward (must match)
 * 3. Distance (nearer is better)
 * 4. Load (fewer tasks is better)
 */
async function findBestWorker(complaint) {
  const coords = complaint.location?.coordinates || [73.8567, 18.5204];
  const lng = coords[0] ?? 73.8567;
  const lat = coords[1] ?? 18.5204;
  const wardId = complaint.wardId;

  // 1. Available workers in exact ward (highest preference)
  let candidatesPool = [];
  if (wardId) {
    candidatesPool = await Worker.find({ wardId, status: 'available' }).lean();
  }

  // 2. If none available in exact ward, check general available workers
  if (!candidatesPool.length) {
    candidatesPool = await Worker.find({ status: 'available' }).lean();
  }

  // 3. If no worker is available at all, do NOT create fake workers. Return null.
  if (!candidatesPool.length) {
    return null;
  }

  // Calculate transparent proximity and workload scores for eligible candidates
  const scoredCandidates = candidatesPool.map(worker => {
    const wCoords = worker.currentLocation?.coordinates || [73.8567, 18.5204];
    const wLng = wCoords[0] ?? 73.8567;
    const wLat = wCoords[1] ?? 18.5204;
    const distanceKm = calculateDistance(lat, lng, wLat, wLng);
    const currentLoad = (worker.assignedTasks || []).length;
    // Lower score is better: distance weighted at 10, current tasks weighted at 5
    const score = Number(((distanceKm * 10) + (currentLoad * 5)).toFixed(2));
    const isSameWard = wardId && String(worker.wardId) === String(wardId);
    return {
      ...worker,
      distance: Number(distanceKm.toFixed(2)),
      distanceKm: Number(distanceKm.toFixed(2)),
      score,
      reason: isSameWard
        ? `Ward-assigned available worker (${distanceKm.toFixed(2)}km away, ${currentLoad} active tasks)`
        : `Nearest available worker (${distanceKm.toFixed(2)}km away, ${currentLoad} active tasks)`
    };
  });

  scoredCandidates.sort((a, b) => a.score - b.score);
  return scoredCandidates[0];
}

module.exports = {
  calculateDistance,
  findBestWorker,
};
