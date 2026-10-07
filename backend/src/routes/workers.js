const router = require('express').Router();
const Worker = require('../models/Worker');
const { authenticate, authorize } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const mongoose = require('mongoose');

const { emitWorkerStatus, emitWorkerLocation } = require('../services/socketService');

function resolveWardScope(req, requestedWardId) {
  if (requestedWardId && !mongoose.isValidObjectId(requestedWardId)) {
    return { error: { status: 400, message: 'Invalid ward_id' } };
  }

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

// GET /workers
router.get('/', authenticate, authorize('authority', 'admin'), async (req, res, next) => {
  try {
    const { status, ward_id } = req.query;
    const filter = {};
    const scope = resolveWardScope(req, ward_id);
    if (scope.error) return fail(res, scope.error.status, scope.error.message);
    if (scope.wardId) filter.wardId = scope.wardId;
    if (status) filter.status = status;

    const workers = await Worker.find(filter)
      .populate('wardId', 'name')
      .sort({ name: 1 })
      .lean();

    return ok(res, { workers }, 'Workers fetched');
  } catch (err) { next(err); }
});

// GET /workers/:id
router.get('/:id', authenticate, authorize('authority', 'admin'), async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id).populate('wardId', 'name city').lean();
    if (!worker) return fail(res, 404, 'Worker not found');
    return ok(res, worker, 'Worker fetched');
  } catch (err) { next(err); }
});

// PUT /workers/:id/status
router.put('/:id/status', authenticate, authorize('authority', 'admin', 'worker'), async (req, res, next) => {
  try {
    const { status, lat, lng } = req.body;
    const update = { status, lastActiveAt: new Date() };
    if (lat && lng) update.currentLocation = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };

    const worker = await Worker.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!worker) return fail(res, 404, 'Worker not found');
    
    emitWorkerStatus(worker);
    if (lat && lng) emitWorkerLocation(worker);

    return ok(res, worker, 'Worker status updated');
  } catch (err) { next(err); }
});

// POST /workers/demo — Development and demo environments only
router.post('/demo', authenticate, authorize('authority', 'admin'), async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return fail(res, 403, 'Demo worker creation is disabled in production mode.');
    }

    const demoDefs = [
      { name: 'Suresh Mane',  phone: '+919876543300', employeeId: 'EMP-001', zone: 'Zone A', role: 'driver',     lat: 18.521, lng: 73.852 },
      { name: 'Priya Kamble', phone: '+919876543301', employeeId: 'EMP-002', zone: 'Zone B', role: 'cleaner',    lat: 18.519, lng: 73.858 },
      { name: 'Rajan Desai',  phone: '+919876543302', employeeId: 'EMP-003', zone: 'Zone C', role: 'supervisor', lat: 18.524, lng: 73.862 },
    ];

    const targetWardId = req.user.wardId || undefined;
    const createdOrUpdated = [];

    for (const d of demoDefs) {
      let worker = await Worker.findOne({ employeeId: d.employeeId });
      if (!worker) {
        worker = await Worker.create({
          name: d.name,
          phone: d.phone,
          employeeId: d.employeeId,
          zone: d.zone,
          role: d.role,
          wardId: targetWardId,
          status: 'available',
          currentLocation: { type: 'Point', coordinates: [d.lng, d.lat] },
        });
      } else {
        worker.status = 'available';
        if (targetWardId) worker.wardId = targetWardId;
        await worker.save();
      }
      createdOrUpdated.push(worker);
    }

    return ok(res, { workers: createdOrUpdated, worker: createdOrUpdated[0] }, 'Demo workers ready', 201);
  } catch (err) { next(err); }
});

module.exports = router;
