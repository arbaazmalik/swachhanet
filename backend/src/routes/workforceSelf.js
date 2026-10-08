const router = require('express').Router();
const mongoose = require('mongoose');
const axios = require('axios');

const Worker = require('../models/Worker');
const Complaint = require('../models/Complaint');
const Ward = require('../models/Ward');
const Hotspot = require('../models/Hotspot');
const User = require('../models/User');

const { authenticate } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');
const { emitRealtimeEvent } = require('../services/socketService');
const { createNotification } = require('../services/notificationService');
const { notifyCitizen } = require('../services/notificationService');
const { runCleanupVerification } = require('../services/cleanupVerificationService');
const {
  getWorkerForUser,
  findWorkerAssignment,
  listWorkerComplaints,
  normalizeTaskView,
  distanceMeters,
} = require('../services/workerService');
const { evidenceUpload, uploadToStorage, ALLOWED_IMAGE_MIME } = require('../utils/uploadHelpers');

const WORKER_STATUSES = ['available', 'busy', 'break', 'offline'];
const EVIDENCE_TYPES = ['before', 'after'];
const ISSUE_REASONS = [
  'unable_to_access',
  'unsafe_location',
  'waste_already_removed',
  'wrong_location',
  'excessive_waste_volume',
  'requires_special_equipment',
  'hazardous_material',
  'other',
];

const VERIFY_RADIUS_M = Number(process.env.WORKER_VERIFY_RADIUS_M || 200);
const SLA_HOURS = { 3: 12, 2: 24, 1: 48 };

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Middleware: only an authenticated worker may use these endpoints, and the
 * Worker profile is ALWAYS derived from the JWT user context.
 */
async function requireWorker(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'worker') {
      return fail(res, 403, 'Insufficient permissions');
    }
    const worker = await getWorkerForUser(req.user);
    if (!worker) {
      return fail(res, 403, 'Worker profile not found. Contact your authority.');
    }
    req.worker = worker;
    return next();
  } catch (err) {
    return next(err);
  }
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

/**
 * Loads a complaint that the worker owns (has an assignment on).
 * Returns { complaint, assignment } or null.
 */
async function loadOwnTask(complaintId, workerId) {
  if (!isValidId(complaintId)) return null;
  const complaint = await Complaint.findOne({
    _id: complaintId,
    'assignments.workerId': workerId,
  })
    .populate('wardId', 'name city')
    .populate('userId', 'name')
    .populate('assignments.workerId', 'name role')
    .lean();
  if (!complaint) return null;
  const assignment = findWorkerAssignment(complaint, workerId);
  return { complaint, assignment };
}

function hourDiff(from, to) {
  return (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function fetchImageBuffer(imageUrl) {
  const raw = typeof imageUrl === 'string' ? imageUrl : '';
  if (!raw) return null;
  try {
    let absolute = raw;
    if (raw.startsWith('/uploads/')) {
      absolute = `${process.env.API_URL || 'http://localhost:5000'}${raw}`;
    }
    const res = await axios.get(absolute, { responseType: 'arraybuffer', timeout: 10000 });
    const contentType = res.headers['content-type'] || 'image/jpeg';
    return { buffer: Buffer.from(res.data), contentType };
  } catch (err) {
    return null;
  }
}

async function nearestHotspotTo(complaint) {
  const [lng, lat] = complaint.location?.coordinates || [0, 0];
  if (!lng && !lat) return null;
  const wardId = complaint.wardId?._id ? String(complaint.wardId._id) : complaint.wardId ? String(complaint.wardId) : null;
  const hots = await Hotspot.find({ ...(wardId ? { wardId } : {}) })
    .sort({ severityScore: -1 })
    .limit(20)
    .lean();
  let best = null;
  for (const h of hots) {
    const [hlng, hlat] = h.centroid?.coordinates || [0, 0];
    const d = distanceMeters(lat, lng, hlat, hlng) / 1000;
    if (d < 1.5 && (!best || d < best.distanceKm)) {
      best = { hotspot: h, distanceKm: d };
    }
  }
  return best ? { ...best.hotspot, distanceKm: best.distanceKm } : null;
}

/**
 * Recommendation score — lower is better.
 * Combines priority, straight-line distance, complaint age and (nearby)
 * hotspot severity. Pure heuristic; intentionally simple and configurable.
 */
function recommendationScore(task, workerLat, workerLng) {
  const [tlng, tlat] = task.location?.coordinates || [0, 0];
  const distKm = distanceMeters(workerLat, workerLng, tlat, tlng) / 1000;
  const priorityScore = 4 - (task.priority || 1); // p3 -> 1, p2 -> 2, p1 -> 3
  const ageHours = hourDiff(task.createdAt || new Date(), new Date());
  const hotspotBonus = Math.min(20, (task.hotspotSeverity || 0) * 5);
  return priorityScore * 100 + distKm * 30 + Math.min(ageHours, 48) * 1.5 - hotspotBonus;
}

// ────────────────────────────────────────────────────────────────────────────
// GET /workforce/me — worker's own profile
// ────────────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, requireWorker, async (req, res, next) => {
  try {
    const w = req.worker;
    const ward = w.wardId ? await Ward.findById(w.wardId).select('name city').lean() : null;
    const activeCount = await Complaint.countDocuments({
      'assignments.workerId': w._id,
      'assignments.status': { $in: ['assigned', 'accepted', 'in_progress'] },
    });
    return ok(res, {
      worker: {
        id: w._id,
        name: w.name,
        phone: w.phone,
        employeeId: w.employeeId,
        zone: w.zone,
        role: w.role,
        status: w.status,
        wardId: w.wardId,
        wardName: ward?.name || null,
        city: ward?.city || null,
        currentLocation: w.currentLocation,
        tasksCompleted: w.tasksCompleted || 0,
        performanceScore: w.performanceScore || 0,
        activeTasks: activeCount,
        lastActiveAt: w.lastActiveAt,
        createdAt: w.createdAt,
      },
    }, 'Worker profile fetched');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /workforce/overview — dashboard data (summary + next task + active tasks)
// ────────────────────────────────────────────────────────────────────────────
router.get('/overview', authenticate, requireWorker, async (req, res, next) => {
  try {
    const worker = req.worker;
    const all = await listWorkerComplaints(worker._id);
    const [wLng, wLat] = worker.currentLocation?.coordinates || [0, 0];

    const enriched = await Promise.all(all.map(async (c) => {
      const assignment = findWorkerAssignment(c, worker._id);
      if (!assignment) return null;
      const h = assignment.status === 'reassigned' ? null : await nearestHotspotTo(c);
      return { complaint: c, assignment, hotspot: h };
    }));
    const valid = enriched.filter(Boolean);

    const active = valid.filter(({ assignment }) => ['assigned', 'accepted', 'in_progress'].includes(assignment.status));
    const completed = valid.filter(({ assignment }) => assignment.status === 'completed');

    const today = startOfDay(new Date());
    const summary = {
      assigned_today: all.filter(c => startOfDay(c.createdAt).getTime() === today.getTime()).length,
      pending: active.filter(({ assignment }) => ['assigned', 'accepted'].includes(assignment.status)).length,
      in_progress: active.filter(({ assignment }) => assignment.status === 'in_progress').length,
      completed: completed.length,
    };

    const activeTasks = active
      .map(({ complaint, assignment, hotspot }) => {
        const view = normalizeTaskView(complaint, worker, assignment);
        view.hotspot = hotspot ? { level: hotspot.level, severityScore: hotspot.severityScore, distanceKm: hotspot.distanceKm } : null;
        view.recScore = recommendationScore(
          { location: complaint.location, priority: complaint.priority, createdAt: complaint.createdAt, hotspotSeverity: hotspot?.severityScore || 0 },
          wLat, wLng
        );
        return view;
      })
      .sort((a, b) => (a.assignment.status === 'in_progress' ? -1 : 1) - (b.assignment.status === 'in_progress' ? -1 : 1) || a.recScore - b.recScore);

    const nextTask = activeTasks.length ? activeTasks[0] : null;

    return ok(res, { summary, nextTask, tasks: activeTasks }, 'Worker overview fetched');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /workforce/tasks — worker's own tasks (filters)
// ────────────────────────────────────────────────────────────────────────────
router.get('/tasks', authenticate, requireWorker, async (req, res, next) => {
  try {
    const worker = req.worker;
    const { status } = req.query;
    const validFilter = ['assigned', 'accepted', 'in_progress', 'completed', 'reassigned'];
    if (status && !validFilter.includes(status)) return fail(res, 400, 'Invalid status filter');

    const all = await listWorkerComplaints(worker._id);
    const tasks = all
      .map(c => {
        const assignment = findWorkerAssignment(c, worker._id);
        return assignment ? normalizeTaskView(c, worker, assignment) : null;
      })
      .filter(Boolean)
      .filter(t => !status || t.assignment.status === status);

    return ok(res, { tasks, counts: {
      assigned: all.filter(c => findWorkerAssignment(c, worker._id)?.status === 'assigned').length,
      accepted: all.filter(c => findWorkerAssignment(c, worker._id)?.status === 'accepted').length,
      in_progress: all.filter(c => findWorkerAssignment(c, worker._id)?.status === 'in_progress').length,
      completed: all.filter(c => findWorkerAssignment(c, worker._id)?.status === 'completed').length,
    }}, 'Worker tasks fetched');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /workforce/tasks/:id — task detail
// ────────────────────────────────────────────────────────────────────────────
router.get('/tasks/:id', authenticate, requireWorker, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    const view = normalizeTaskView(complaint, req.worker, assignment);
    view.hotspot = await nearestHotspotTo(complaint);
    view.citizen = complaint.userId ? { name: complaint.userId.name } : null;
    return ok(res, view, 'Task fetched');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /workforce/status — worker changes own status
// ────────────────────────────────────────────────────────────────────────────
router.patch('/status', authenticate, requireWorker, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!WORKER_STATUSES.includes(status)) return fail(res, 400, 'Invalid status');
    const worker = await Worker.findByIdAndUpdate(
      req.worker._id,
      { status, lastActiveAt: new Date() },
      { new: true }
    );
    emitRealtimeEvent({ event: 'worker.status_changed', data: { workerId: worker._id, status: worker.status }, wardId: worker.wardId });
    return ok(res, { worker: { id: worker._id, status: worker.status, lastActiveAt: worker.lastActiveAt } }, 'Worker status updated');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /workforce/location — worker updates own live location
// ────────────────────────────────────────────────────────────────────────────
router.patch('/location', authenticate, requireWorker, async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return fail(res, 400, 'Valid lat and lng required');
    }
    const worker = await Worker.findByIdAndUpdate(
      req.worker._id,
      {
        currentLocation: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        lastActiveAt: new Date(),
      },
      { new: true }
    );
    emitRealtimeEvent({
      event: 'worker.location_updated',
      data: { workerId: worker._id, location: worker.currentLocation },
      wardId: worker.wardId,
    });
    return ok(res, { location: worker.currentLocation }, 'Location updated');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /workforce/tasks/:id/accept
// ────────────────────────────────────────────────────────────────────────────
router.post('/tasks/:id/accept', authenticate, requireWorker, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    if (assignment.status === 'completed' || assignment.status === 'reassigned') return fail(res, 400, 'Task is already closed');
    if (!['assigned', 'accepted'].includes(assignment.status)) return fail(res, 400, `Cannot accept task in "${assignment.status}" state`);

    await Complaint.findOneAndUpdate(
      { _id: complaint._id, 'assignments.workerId': req.worker._id },
      {
        $set: {
          'assignments.$.acceptedAt': new Date(),
          'assignments.$.status': 'accepted',
        },
      }
    );
    await Worker.findByIdAndUpdate(req.worker._id, { status: 'busy', lastActiveAt: new Date() });

    return ok(res, { status: 'accepted' }, 'Task accepted');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /workforce/tasks/:id/start — location-verified start
// ────────────────────────────────────────────────────────────────────────────
router.post('/tasks/:id/start', authenticate, requireWorker, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    if (['completed', 'reassigned'].includes(assignment.status)) return fail(res, 400, 'Task is already closed');
    if (assignment.status === 'in_progress') return fail(res, 400, 'Task already in progress');

    const [clng, clat] = complaint.location?.coordinates || [0, 0];

    let { lat, lng } = req.body || {};
    if (lat !== undefined && lng !== undefined) {
      lat = Number(lat);
      lng = Number(lng);
    } else {
      const [wLng, wLat] = req.worker.currentLocation?.coordinates || [null, null];
      if (wLat == null || wLng == null || (wLat === 0 && wLng === 0)) {
        return fail(res, 400, 'GPS location is required to start this task');
      }
      lat = wLat;
      lng = wLng;
    }

    const distM = distanceMeters(lat, lng, clat, clng);
    if (distM > VERIFY_RADIUS_M) {
      return fail(res, 409, 'Location verification failed. You are too far from the complaint location.', {
        code: 'LOCATION_VERIFICATION_FAILED',
        distance_m: Math.round(distM),
        required_radius_m: VERIFY_RADIUS_M,
      });
    }

    await Complaint.findOneAndUpdate(
      { _id: complaint._id, 'assignments.workerId': req.worker._id },
      {
        $set: {
          status: 'in_progress',
          'assignments.$.status': 'in_progress',
          'assignments.$.startedAt': new Date(),
          'assignments.$.activeSince': new Date(),
          'assignments.$.startLocation': { type: 'Point', coordinates: [lng, lat] },
        },
      }
    );
    await Worker.findByIdAndUpdate(req.worker._id, { status: 'busy', lastActiveAt: new Date() });
    emitRealtimeEvent({
      event: 'complaint.status_changed',
      data: { complaintId: complaint._id, status: 'in_progress' },
      wardId: complaint.wardId,
      userId: complaint.userId,
    });

    return ok(res, { status: 'in_progress', distance_m: Math.round(distM) }, 'Task started');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /workforce/tasks/:id/pause | /resume
// ────────────────────────────────────────────────────────────────────────────
router.post('/tasks/:id/pause', authenticate, requireWorker, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    if (assignment.status !== 'in_progress') return fail(res, 400, `Cannot pause task in "${assignment.status}" state`);
    if (assignment.paused) return fail(res, 400, 'Task is already paused');

    const now = new Date();
    const elapsed = (now.getTime() - new Date(assignment.activeSince || assignment.startedAt || now).getTime()) / 1000;
    await Complaint.findOneAndUpdate(
      { _id: complaint._id, 'assignments.workerId': req.worker._id },
      {
        $set: {
          'assignments.$.paused': true,
          'assignments.$.pausedAt': now,
          'assignments.$.activeSince': null,
          'assignments.$.timerSeconds': (assignment.timerSeconds || 0) + Math.max(0, Math.round(elapsed)),
        },
      }
    );
    return ok(res, { status: 'paused' }, 'Cleanup paused');
  } catch (err) {
    return next(err);
  }
});

router.post('/tasks/:id/resume', authenticate, requireWorker, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    if (assignment.status !== 'in_progress') return fail(res, 400, `Cannot resume task in "${assignment.status}" state`);
    if (!assignment.paused) return fail(res, 400, 'Task is not paused');

    await Complaint.findOneAndUpdate(
      { _id: complaint._id, 'assignments.workerId': req.worker._id },
      {
        $set: {
          'assignments.$.paused': false,
          'assignments.$.pausedAt': null,
          'assignments.$.activeSince': new Date(),
        },
      }
    );
    return ok(res, { status: 'in_progress' }, 'Cleanup resumed');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /workforce/tasks/:id/evidence — upload BEFORE or AFTER cleanup photo
// ────────────────────────────────────────────────────────────────────────────
router.post('/tasks/:id/evidence', authenticate, requireWorker, (req, res, next) => {
  evidenceUpload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 400, 'Image size exceeds 8MB');
      if (err.code === 'INVALID_FILE_TYPE') return fail(res, 400, err.message);
      return fail(res, 400, err.message || 'Invalid image upload');
    }
    return next();
  });
}, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    if (['completed', 'reassigned'].includes(assignment.status)) return fail(res, 400, 'Task is already closed');

    const type = req.body?.type;
    if (!EVIDENCE_TYPES.includes(type)) return fail(res, 400, 'evidence type must be "before" or "after"');
    if (!req.file) return fail(res, 400, 'Image is required');

    const imageUrl = await uploadToStorage(req.file.buffer, req.file.mimetype, 'evidence');

    const patch = {};
    const now = new Date();
    if (type === 'before') {
      patch['assignments.$.beforeImage'] = imageUrl;
      patch['assignments.$.beforeCapturedAt'] = now;
    } else {
      patch['assignments.$.afterImage'] = imageUrl;
      patch['assignments.$.afterCapturedAt'] = now;
    }

    // GPS of the capture (optional, validated if present).
    const { lat, lng } = req.body || {};
    if (lat !== undefined && lng !== undefined && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      patch['assignments.$.completionLocation'] = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
    }

    const updated = await Complaint.findOneAndUpdate(
      { _id: complaint._id, 'assignments.workerId': req.worker._id },
      { $set: patch },
      { new: true }
    );
    const updatedAssignment = findWorkerAssignment(updated, req.worker._id);
    return ok(res, {
      type,
      imageUrl,
      capturedAt: now,
      hasBefore: !!updatedAssignment.beforeImage,
      hasAfter: !!updatedAssignment.afterImage,
    }, `${type} evidence saved`);
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /workforce/tasks/:id/verify — run (pluggable) AI cleanup verification
// ────────────────────────────────────────────────────────────────────────────
router.post('/tasks/:id/verify', authenticate, requireWorker, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    if (['completed', 'reassigned'].includes(assignment.status)) return fail(res, 400, 'Task is already closed');

    if (!assignment.beforeImage || !assignment.afterImage) {
      return fail(res, 400, 'Both BEFORE and AFTER evidence images are required before verification');
    }

    const [beforeImg, afterImg] = await Promise.all([
      fetchImageBuffer(assignment.beforeImage),
      fetchImageBuffer(assignment.afterImage),
    ]);
    if (!beforeImg || !afterImg) return fail(res, 422, 'Could not read evidence images for verification');

    const result = await runCleanupVerification({
      beforeBuffer: beforeImg.buffer,
      afterBuffer: afterImg.buffer,
      beforeMime: beforeImg.contentType,
      afterMime: afterImg.contentType,
    });

    const updated = await Complaint.findOneAndUpdate(
      { _id: complaint._id, 'assignments.workerId': req.worker._id },
      { $set: { 'assignments.$.verification': result } },
      { new: true }
    );
    const updatedAssignment = findWorkerAssignment(updated, req.worker._id);

    emitRealtimeEvent({
      event: 'task.verification_completed',
      data: { complaintId: complaint._id, workerId: req.worker._id, verification: result },
      wardId: complaint.wardId,
      userId: complaint.userId,
    });

    return ok(res, {
      verification: updatedAssignment.verification,
      status: updatedAssignment.verification.status,
      cleanupScore: updatedAssignment.verification.cleanupScore,
    }, result.reason);
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /workforce/tasks/:id/complete — verified task completion
// ────────────────────────────────────────────────────────────────────────────
router.post('/tasks/:id/complete', authenticate, requireWorker, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    if (['completed', 'reassigned'].includes(assignment.status)) return fail(res, 400, 'Task is already closed');
    if (assignment.status !== 'in_progress') return fail(res, 400, `Cannot complete task in "${assignment.status}" state. Start it first.`);

    // Evidence is mandatory before completion.
    if (!assignment.afterImage) {
      return fail(res, 400, 'After-cleanup evidence photograph is required before completing this task.', {
        code: 'EVIDENCE_REQUIRED',
      });
    }

    // Run verification if it has not been run yet (evidence-driven, honest).
    let verification = assignment.verification;
    if (!verification || verification.status === 'pending') {
      const [beforeImg, afterImg] = await Promise.all([
        fetchImageBuffer(assignment.beforeImage),
        fetchImageBuffer(assignment.afterImage),
      ]);
      if (!beforeImg || !afterImg) {
        return fail(res, 422, 'Could not read evidence images for verification.');
      }
      verification = await runCleanupVerification({
        beforeBuffer: beforeImg.buffer,
        afterBuffer: afterImg.buffer,
        beforeMime: beforeImg.contentType,
        afterMime: afterImg.contentType,
      });
    }

    const now = new Date();
    const elapsed = (now.getTime() - new Date(assignment.activeSince || assignment.startedAt || now).getTime()) / 1000;
    const timerSeconds = (assignment.timerSeconds || 0) + Math.max(0, Math.round(elapsed));

    let { lat, lng } = req.body || {};
    if (lat !== undefined && lng !== undefined) {
      lat = Number(lat);
      lng = Number(lng);
    } else {
      const [wLng, wLat] = req.worker.currentLocation?.coordinates || [null, null];
      if (wLat != null && wLng != null && !(wLat === 0 && wLng === 0)) {
        lat = wLat;
        lng = wLng;
      }
    }
    const completionLocation = (lat !== undefined && lng !== undefined)
      ? { type: 'Point', coordinates: [lng, lat] }
      : assignment.completionLocation || null;

    await Complaint.findOneAndUpdate(
      { _id: complaint._id, 'assignments.workerId': req.worker._id },
      {
        $set: {
          status: 'resolved',
          resolvedAt: now,
          'assignments.$.status': 'completed',
          'assignments.$.completedAt': now,
          'assignments.$.timerSeconds': timerSeconds,
          'assignments.$.activeSince': null,
          'assignments.$.paused': false,
          'assignments.$.verification': verification,
          ...(completionLocation ? { 'assignments.$.completionLocation': completionLocation } : {}),
        },
      }
    );

    // Worker workload book-keeping (safe, additive).
    const currentScore = req.worker.performanceScore || 0;
    const completed = req.worker.tasksCompleted || 0;
    const onTime = hourDiff(assignment.assignedAt || complaint.createdAt, now) <= (SLA_HOURS[complaint.priority] || 48);
    const verified = verification.status === 'verified';
    const base = (onTime ? 92 : 76) + (verified ? 4 : 0);
    const performanceScore = Math.min(100, Math.round(((currentScore * completed) + base) / (completed + 1)));

    await Worker.findByIdAndUpdate(req.worker._id, {
      status: 'available',
      lastActiveAt: now,
      tasksCompleted: completed + 1,
      performanceScore,
      $pull: { assignedTasks: complaint._id },
    });

    // Notify citizen + authorities so the loop closes.
    await notifyCitizen(
      complaint.userId?._id || complaint.userId,
      'Complaint resolved',
      `Your complaint "${String(complaint.issueType || 'waste').replace(/_/g, ' ')}" has been resolved.`,
      { complaintId: complaint._id, workerId: req.worker._id }
    );
    const wardId = complaint.wardId?._id ? String(complaint.wardId._id) : complaint.wardId ? String(complaint.wardId) : null;
    if (wardId) {
      const authUsers = await User.find({ role: { $in: ['authority', 'admin'] }, $or: [{ wardId }, { wardId: { $exists: false } }] }).select('_id').lean();
      await Promise.all(authUsers.map(u =>
        createNotification(
          u._id,
          'Task completed by worker',
          `${req.worker.name} resolved complaint ${complaint._id}.`,
          'complaint_update',
          { complaintId: complaint._id, workerId: req.worker._id }
        )
      ));
    }

    emitRealtimeEvent({
      event: 'complaint.resolved',
      data: { complaintId: complaint._id, workerId: req.worker._id, resolvedAt: now, verification: verification.status },
      wardId: complaint.wardId,
      userId: complaint.userId,
    });

    return ok(res, {
      status: 'completed',
      timerSeconds,
      performanceScore,
      verification: {
        status: verification.status,
        cleanupScore: verification.cleanupScore,
        reason: verification.reason,
        verifiedAt: verification.verifiedAt,
      },
      resolvedAt: now,
    }, 'Task completed');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /workforce/tasks/:id/report-issue
// ────────────────────────────────────────────────────────────────────────────
router.post('/tasks/:id/report-issue', authenticate, requireWorker, (req, res, next) => {
  evidenceUpload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 400, 'Image size exceeds 8MB');
      return fail(res, 400, err.message || 'Invalid image upload');
    }
    return next();
  });
}, async (req, res, next) => {
  try {
    const owned = await loadOwnTask(req.params.id, req.worker._id);
    if (!owned) return fail(res, 404, 'Task not found');
    const { complaint, assignment } = owned;
    if (['completed', 'reassigned'].includes(assignment.status)) return fail(res, 400, 'Task is already closed');

    const reason = req.body?.reason;
    if (!ISSUE_REASONS.includes(reason)) {
      return fail(res, 400, 'A valid issue reason is required');
    }
    const notes = req.body?.notes ? String(req.body.notes).slice(0, 500) : '';
    let imageUrl = null;
    if (req.file) imageUrl = await uploadToStorage(req.file.buffer, req.file.mimetype, 'issue-reports');

    const now = new Date();
    await Complaint.findOneAndUpdate(
      { _id: complaint._id, 'assignments.workerId': req.worker._id },
      {
        $set: {
          status: 'pending',
          'assignments.$.status': 'reassigned',
          'assignments.$.notes': notes || 'Reported issue - returned to authority',
          'assignments.$.reportIssue': { reason, notes, imageUrl, reportedAt: now },
          'assignments.$.activeSince': null,
          'assignments.$.paused': false,
        },
      }
    );
    await Worker.findByIdAndUpdate(req.worker._id, {
      status: 'available',
      lastActiveAt: now,
      $pull: { assignedTasks: complaint._id },
    });

    const wardId = complaint.wardId?._id ? String(complaint.wardId._id) : complaint.wardId ? String(complaint.wardId) : null;
    if (wardId) {
      const authUsers = await User.find({ role: { $in: ['authority', 'admin'] }, $or: [{ wardId }, { wardId: { $exists: false } }] }).select('_id').lean();
      await Promise.all(authUsers.map(u =>
        createNotification(
          u._id,
          'Worker reported an issue',
          `${req.worker.name} reported "${reason.replace(/_/g, ' ')}" on complaint ${complaint._id}.`,
          'complaint_update',
          { complaintId: complaint._id, workerId: req.worker._id, reason }
        )
      ));
    }
    emitRealtimeEvent({
      event: 'task.issue_reported',
      data: { complaintId: complaint._id, workerId: req.worker._id, reason },
      wardId: complaint.wardId,
      userId: complaint.userId,
    });

    return ok(res, { status: 'reassigned', reason }, 'Issue reported. Task returned to authority.');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /workforce/route — recommended order for today's active tasks
// ────────────────────────────────────────────────────────────────────────────
router.get('/route', authenticate, requireWorker, async (req, res, next) => {
  try {
    const worker = req.worker;
    const all = await listWorkerComplaints(worker._id);
    const [wLng, wLat] = worker.currentLocation?.coordinates || [0, 0];

    const active = [];
    for (const c of all) {
      const assignment = findWorkerAssignment(c, worker._id);
      if (!assignment || !['assigned', 'accepted', 'in_progress'].includes(assignment.status)) continue;
      const [clng, clat] = c.location?.coordinates || [0, 0];
      const distKm = distanceMeters(wLat, wLng, clat, clng) / 1000;
      const hotspot = await nearestHotspotTo(c);
      active.push({
        view: normalizeTaskView(c, worker, assignment),
        distKm,
        score: recommendationScore(
          { location: c.location, priority: c.priority, createdAt: c.createdAt, hotspotSeverity: hotspot?.severityScore || 0 },
          wLat, wLng
        ),
        hotspot,
      });
    }

    // Current in-progress task leads the route; the rest follow the heuristic.
    active.sort((a, b) => {
      const aOn = a.view.assignment.status === 'in_progress' ? -1 : 0;
      const bOn = b.view.assignment.status === 'in_progress' ? -1 : 0;
      if (aOn !== bOn) return aOn - bOn;
      return a.score - b.score;
    });

    let runningDist = 0;
    const route = active.map(({ view, distKm, hotspot, score }) => {
      runningDist += distKm;
      return {
        id: view.id,
        issueType: view.issueType,
        issueLabel: view.issueLabel,
        priority: view.priority,
        status: view.assignment.status,
        address: view.address,
        distanceKm: Number(distKm.toFixed(2)),
        cumulativeKm: Number(runningDist.toFixed(2)),
        score: Number(score || 0),
        hotspot: hotspot ? { level: hotspot.level, severityScore: hotspot.severityScore, distanceKm: Number(hotspot.distanceKm.toFixed(2)) } : null,
        location: view.location,
      };
    });

    const totalKm = route.reduce((s, r) => s + r.distanceKm, 0);
    // Walking pace ~4.5 km/h for field estimates.
    const estMinutes = totalKm > 0 ? Math.round((totalKm / 4.5) * 60 + route.length * 4) : 0;

    return ok(res, {
      route,
      summary: {
        totalKm: Number(totalKm.toFixed(2)),
        estMinutes,
        taskCount: route.length,
        priorityTasks: route.filter(r => r.priority >= 3).length,
      },
      startLocation: worker.currentLocation,
    }, 'Smart route generated');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /workforce/performance — worker's own performance analytics
// ────────────────────────────────────────────────────────────────────────────
router.get('/performance', authenticate, requireWorker, async (req, res, next) => {
  try {
    const worker = req.worker;
    const all = await listWorkerComplaints(worker._id);

    const completedItems = [];
    for (const c of all) {
      const a = findWorkerAssignment(c, worker._id);
      if (a && a.status === 'completed') completedItems.push({ c, a });
    }

    const thisWeek = startOfDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    const thisWeekCount = completedItems.filter(({ a }) => new Date(a.completedAt) >= thisWeek).length;

    const resolutionMinutesArr = completedItems.map(({ c, a }) => {
      const start = a.acceptedAt || a.assignedAt || c.createdAt;
      return Math.max(0, (new Date(a.completedAt) - new Date(start)) / 60000);
    });
    const avgResolutionMinutes = resolutionMinutesArr.length
      ? Math.round(resolutionMinutesArr.reduce((s, x) => s + x, 0) / resolutionMinutesArr.length)
      : 0;

    let onTime = 0;
    completedItems.forEach(({ c, a }) => {
      const start = a.assignedAt || c.createdAt;
      if (hourDiff(start, a.completedAt) <= (SLA_HOURS[c.priority] || 48)) onTime += 1;
    });
    const onTimePct = completedItems.length ? Math.round((onTime / completedItems.length) * 100) : 0;

    const verifiedCount = completedItems.filter(({ a }) => a.verification?.status === 'verified').length;
    const reviewCount = completedItems.filter(({ a }) => a.verification?.status === 'review_required').length;
    const verificationSuccessRate = (verifiedCount + reviewCount) ? Math.round((verifiedCount / (verifiedCount + reviewCount)) * 100) : 0;

    const returnedCount = all.filter(c => findWorkerAssignment(c, worker._id)?.status === 'reassigned').length;

    // Daily completion streak (consecutive days, current streak ending today or yesterday).
    const dayCounts = {};
    completedItems.forEach(({ a }) => {
      const day = startOfDay(a.completedAt).toISOString().slice(0, 10);
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    let streak = 0;
    let cursor = startOfDay(new Date());
    if (!dayCounts[cursor.toISOString().slice(0, 10)]) cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    while (dayCounts[cursor.toISOString().slice(0, 10)]) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    }

    // Worker achievements (isolated from citizen gamification).
    const achievements = [];
    if (worker.tasksCompleted >= 50) achievements.push({ key: 'clean_streets_champion', label: 'Clean Streets Champion', description: '50 tasks completed' });
    if (completedItems.filter(({ c, a }) => c.priority >= 3 && hourDiff(a.assignedAt || c.createdAt, a.completedAt) <= (SLA_HOURS[3] || 12)).length >= 10) {
      achievements.push({ key: 'rapid_responder', label: 'Rapid Responder', description: '10 high-priority tasks completed within SLA' });
    }
    if (worker.tasksCompleted >= 20) achievements.push({ key: 'route_master', label: 'Route Master', description: '20 optimized routes completed' });
    if (worker.tasksCompleted >= 100) achievements.push({ key: 'eco_warrior', label: 'Eco Warrior', description: '100 complaints resolved' });

    // 7-day completion trend.
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfDay(new Date()).getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      trend.push({ date: key, count: dayCounts[key] || 0 });
    }

    return ok(res, {
      tasksCompleted: worker.tasksCompleted || 0,
      thisWeek: thisWeekCount,
      avgResolutionMinutes,
      onTimePct,
      verificationSuccessRate,
      returnedTasks: returnedCount,
      currentStreak: streak,
      achievements,
      trend,
      performanceScore: worker.performanceScore || 0,
      slaHours: SLA_HOURS,
    }, 'Worker performance fetched');
  } catch (err) {
    return next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /workforce/history — worker's own completed-task history
// ────────────────────────────────────────────────────────────────────────────
router.get('/history', authenticate, requireWorker, async (req, res, next) => {
  try {
    const worker = req.worker;
    const { period, start_date, end_date, page = 1, limit = 20 } = req.query;
    const skip = (Math.max(1, Number(page || 1)) - 1) * Number(limit || 20);

    let from = null;
    let to = null;
    if (period === 'today') from = startOfDay(new Date());
    else if (period === 'week') from = startOfDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    else if (period === 'month') from = startOfDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
    else if (period === 'custom') {
      if (start_date) from = new Date(start_date);
      if (end_date) to = startOfDay(new Date(end_date));
    }

    const all = await listWorkerComplaints(worker._id);
    let items = all
      .map(c => ({ c, a: findWorkerAssignment(c, worker._id) }))
      .filter(({ a }) => a && a.status === 'completed');

    if (from) items = items.filter(({ a }) => new Date(a.completedAt) >= from);
    if (to) items = items.filter(({ a }) => new Date(a.completedAt) <= to);

    const total = items.length;
    const paged = items.slice(skip, skip + Number(limit || 20));

    const history = paged.map(({ c, a }) => ({
      id: c._id,
      issueType: c.issueType,
      issueLabel: String(c.issueType || 'other').replace(/_/g, ' '),
      priority: c.priority,
      address: c.address || null,
      completedAt: a.completedAt,
      resolutionMinutes: Math.round((new Date(a.completedAt) - new Date(a.acceptedAt || a.assignedAt || c.createdAt)) / 60000),
      verificationStatus: a.verification?.status || 'pending',
      cleanupScore: a.verification?.cleanupScore || 0,
      location: c.location?.coordinates
        ? { lat: c.location.coordinates[1], lng: c.location.coordinates[0] }
        : { lat: 0, lng: 0 },
    }));

    return ok(res, {
      history,
      meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit || 20)) },
    }, 'Worker history fetched');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;