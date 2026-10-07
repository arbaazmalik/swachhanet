const express = require('express');
const router = express.Router();

const Worker = require('../models/Worker');
const Complaint = require('../models/Complaint');
const { authenticate, authorize } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const { findBestWorker } = require('../services/workforceService');
const logger = require('../utils/logger');
const {
  emitComplaintAssigned,
  emitWorkerLocation,
  emitWorkerStatus,
} = require('../services/socketService');

function resolveWardScope(req, requestedWardId) {
  if (req.user.role === 'authority') {
    const ownWardId = req.user.wardId ? String(req.user.wardId) : null;
    if (!ownWardId) {
      return { error: { status: 403, message: 'Authority account is not assigned to any ward.' } };
    }
    if (requestedWardId && String(requestedWardId) !== ownWardId) {
      return { error: { status: 403, message: 'Authority users can only access their assigned ward.' } };
    }
    return { wardId: ownWardId };
  }
  return { wardId: requestedWardId || req.user.wardId || undefined };
}

// POST /workforce - Add a new worker
router.post('/', authenticate, authorize('authority', 'admin'), async (req, res, next) => {
  try {
    const { name, phone, employeeId, zone, role, lat, lng, wardId } = req.body;

    if (!name || !role) return fail(res, 400, 'Name and role are required');

    const targetWardId = wardId || req.user.wardId;
    if (req.user.role === 'authority' && !req.user.wardId) {
      return fail(res, 403, 'Authority account is not assigned to any ward.');
    }

    const worker = await Worker.create({
      name,
      phone,
      employeeId,
      zone,
      role,
      wardId: targetWardId,
      currentLocation: {
        type: 'Point',
        coordinates: [parseFloat(lng) || 0, parseFloat(lat) || 0]
      },
      status: 'available'
    });

    emitWorkerStatus(worker);

    return ok(res, { worker }, 'Worker added to workforce', 201);
  } catch (err) { next(err); }
});

// GET /workforce - List all workers with status
router.get('/', authenticate, authorize('authority', 'admin'), async (req, res, next) => {
  try {
    const { role, status, ward_id } = req.query;
    const filter = {};
    const scope = resolveWardScope(req, ward_id);
    if (scope.error) return fail(res, scope.error.status, scope.error.message);
    if (scope.wardId) filter.wardId = scope.wardId;
    if (role) filter.role = role;
    if (status) filter.status = status;

    const workers = await Worker.find(filter)
      .populate('wardId', 'name')
      .populate('assignedTasks', 'issueType status priority')
      .sort({ name: 1 })
      .lean();

    return ok(res, { workers }, 'Workforce fetched');
  } catch (err) { next(err); }
});

// PATCH /workforce/assign - Smart Auto-Assignment
router.patch('/assign', authenticate, authorize('authority', 'admin'), async (req, res, next) => {
  try {
    const { complaint_id } = req.body;
    if (!complaint_id) return fail(res, 400, 'complaint_id is required');

    const complaint = await Complaint.findById(complaint_id);
    if (!complaint) return fail(res, 404, 'Complaint not found');
    if (complaint.status === 'resolved' || complaint.status === 'rejected') {
      return fail(res, 400, `Complaint is already ${complaint.status}`);
    }

    if (req.user.role === 'authority' && (!req.user.wardId || String(complaint.wardId) !== String(req.user.wardId))) {
      return fail(res, 403, 'Authority can only assign complaints within their assigned ward.');
    }

    const bestWorker = await findBestWorker(complaint);
    if (!bestWorker) {
      logger.info(`No available worker found for complaint ${complaint_id}`);
      return fail(res, 404, 'No available workers found nearby for this ward.');
    }

    // Perform assignment
    const [updatedComplaint, updatedWorker] = await Promise.all([
      Complaint.findByIdAndUpdate(complaint_id, {
        status: 'assigned',
        $push: {
          assignments: {
            workerId: bestWorker._id,
            assignedBy: req.user._id,
            notes: bestWorker.reason || 'Auto-assigned by Workforce Smart Logic'
          }
        }
      }, { new: true }),
      Worker.findByIdAndUpdate(bestWorker._id, {
        status: 'busy',
        $push: { assignedTasks: complaint_id },
        lastActiveAt: new Date()
      }, { new: true })
    ]);

    emitComplaintAssigned(updatedComplaint, updatedWorker);
    emitWorkerStatus(updatedWorker);

    logger.info(`Complaint ${complaint_id} smart-assigned to worker ${bestWorker.name} (Dist: ${bestWorker.distanceKm}km, Score: ${bestWorker.score})`);

    return ok(res, {
      worker: bestWorker,
      complaint: updatedComplaint,
      assignment: {
        workerId: bestWorker._id,
        distanceKm: bestWorker.distanceKm,
        score: bestWorker.score,
        reason: bestWorker.reason,
      }
    }, `Smart assigned to ${bestWorker.name} (${bestWorker.distanceKm}km away)`);
  } catch (err) { next(err); }
});

// PATCH /workforce/:id/location - Update worker location dynamically
router.patch('/:id/location', authenticate, async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) return fail(res, 400, 'lat and lng required');

    const worker = await Worker.findByIdAndUpdate(req.params.id, {
      currentLocation: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
      lastActiveAt: new Date()
    }, { new: true });

    if (!worker) return fail(res, 404, 'Worker not found');
    emitWorkerLocation(worker);
    return ok(res, { worker }, 'Location updated');
  } catch (err) { next(err); }
});

module.exports = router;
