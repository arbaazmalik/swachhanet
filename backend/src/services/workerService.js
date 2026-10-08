const Worker = require('../models/Worker');
const Complaint = require('../models/Complaint');
const Hotspot = require('../models/Hotspot');
const { calculateDistance } = require('./workforceService');

const WORKER_ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'in_progress', 'completed', 'reassigned'];

/**
 * Resolves the Worker profile for an authenticated user.
 * Worker identity is ALWAYS derived from the authenticated user context
 * (req.user) — never from a client-supplied workerId.
 *
 * 1. Match by linked `userId` (preferred).
 * 2. Fallback: match by phone number (legacy Worker records without a userId).
 */
async function getWorkerForUser(user) {
  if (!user || !user._id) return null;
  let worker = await Worker.findOne({ userId: user._id }).lean();
  if (!worker && user.phone) {
    worker = await Worker.findOne({ phone: user.phone }).lean();
  }
  return worker || null;
}

/**
 * Finds the assignment sub-document belonging to a given worker within a
 * complaint's assignment history. Returns the most recent one if multiple
 * (e.g. after a reassignment cycle).
 */
function findWorkerAssignment(complaint, workerId) {
  if (!complaint || !Array.isArray(complaint.assignments)) return null;
  const owned = complaint.assignments.filter(
    a => a && a.workerId && String(a.workerId) === String(workerId)
  );
  return owned.length ? owned[owned.length - 1] : null;
}

/**
 * Lists complaints ever assigned to the worker, populated with ward info.
 */
async function listWorkerComplaints(workerId) {
  return Complaint.find({ 'assignments.workerId': workerId })
    .populate('wardId', 'name city')
    .populate('assignments.workerId', 'name status')
    .sort({ createdAt: -1 })
    .lean();
}

function normalizeTaskView(complaint, worker, assignment) {
  const [lng, lat] = complaint.location?.coordinates || [0, 0];
  const [wLng, wLat] = worker?.currentLocation?.coordinates || [0, 0];
  const distanceKm = calculateDistance(lat, lng, wLat, wLng);

  return {
    id: complaint._id,
    issueType: complaint.issueType,
    issueLabel: String(complaint.issueType || 'other').replace(/_/g, ' '),
    priority: complaint.priority,
    status: complaint.status,
    address: complaint.address || null,
    description: complaint.description || null,
    imageUrl: complaint.imageUrl || null,
    upvotes: complaint.upvotes || 0,
    createdAt: complaint.createdAt,
    resolvedAt: complaint.resolvedAt || null,
    aiResult: {
      wasteType: complaint.aiResult?.wasteType || null,
      confidence: complaint.aiResult?.confidence || null,
      status: complaint.aiResult?.status || 'pending',
    },
    ward: complaint.wardId ? { name: complaint.wardId.name, city: complaint.wardId.city } : null,
    location: { lat, lng },
    distanceKm: Number(distanceKm.toFixed(2)),
    assignment: assignment
      ? {
          status: assignment.status,
          assignedAt: assignment.assignedAt,
          acceptedAt: assignment.acceptedAt,
          startedAt: assignment.startedAt,
          completedAt: assignment.completedAt,
          notes: assignment.notes,
          beforeImage: assignment.beforeImage || null,
          afterImage: assignment.afterImage || null,
          beforeCapturedAt: assignment.beforeCapturedAt || null,
          afterCapturedAt: assignment.afterCapturedAt || null,
          paused: !!assignment.paused,
          timerSeconds: assignment.timerSeconds || 0,
          verification: assignment.verification || {
            status: 'pending',
            method: 'none',
            cleanupScore: 0,
          },
          reportIssue: assignment.reportIssue || null,
          startLocation: assignment.startLocation || null,
          completionLocation: assignment.completionLocation || null,
        }
      : null,
  };
}

/**
 * Distance (meters) between two lat/lng points.
 */
function distanceMeters(lat1, lng1, lat2, lng2) {
  return calculateDistance(lat1, lng1, lat2, lng2) * 1000;
}

module.exports = {
  WORKER_ASSIGNMENT_STATUSES,
  getWorkerForUser,
  findWorkerAssignment,
  listWorkerComplaints,
  normalizeTaskView,
  distanceMeters,
};