const express = require('express');
const request = require('supertest');

const WORKER_ID = '507f1f77bcf86cd799439a01';
const TASK_ID   = '507f1f77bcf86cd799439a02';
const WARD_ID   = '507f1f77bcf86cd799439c01';
const CITIZEN_ID = '507f1f77bcf86cd799439b01';

// ── configurable mock fns ──────────────────────────────────────────────────
const mockOnFindOne = jest.fn();
const mockOnFindOneAndUpdate = jest.fn();
const mockOnCountDocuments = jest.fn();
const mockWorkerFindByIdAndUpdate = jest.fn();
const mockHotspotFind = jest.fn();
const mockUserFind = jest.fn();

let mockDistance = 0;
const mockGetWorkerForUser = jest.fn();
const mockFindWorkerAssignment = jest.fn();
const mockListWorkerComplaints = jest.fn();
const mockNormalizeTaskView = jest.fn();
const mockRunCleanupVerification = jest.fn();

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user = req.mockUser || { role: 'worker', _id: WORKER_ID, phone: '+919876543300' };
    next();
  },
  authorize: () => (req, _res, next) => next(),
}));

jest.mock('../../models/Complaint', () => ({
  findOne: (...args) => mockOnFindOne(...args),
  findOneAndUpdate: (...args) => mockOnFindOneAndUpdate(...args),
  countDocuments: (...args) => mockOnCountDocuments(...args),
}));

jest.mock('../../models/Worker', () => ({
  findByIdAndUpdate: (...args) => mockWorkerFindByIdAndUpdate(...args),
}));

jest.mock('../../models/Ward', () => ({
  findById: jest.fn(),
}));

jest.mock('../../models/Hotspot', () => ({
  find: (...args) => mockHotspotFind(...args),
}));

jest.mock('../../models/User', () => ({
  find: (...args) => mockUserFind(...args),
}));

jest.mock('../../services/workerService', () => ({
  getWorkerForUser: (...args) => mockGetWorkerForUser(...args),
  findWorkerAssignment: (...args) => mockFindWorkerAssignment(...args),
  listWorkerComplaints: (...args) => mockListWorkerComplaints(...args),
  normalizeTaskView: (...args) => mockNormalizeTaskView(...args),
  distanceMeters: () => mockDistance,
}));

jest.mock('../../services/cleanupVerificationService', () => ({
  runCleanupVerification: (...args) => mockRunCleanupVerification(...args),
  PRESENCE_THRESHOLD: 0.6,
}));

jest.mock('../../utils/uploadHelpers', () => {
  const real = jest.requireActual('../../utils/uploadHelpers');
  return {
    ...real,
    uploadToStorage: jest.fn().mockResolvedValue('https://cdn.swachhanet.test/evidence/up.jpg'),
  };
});

jest.mock('../../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
  notifyAuthorities: jest.fn().mockResolvedValue({}),
  notifyCitizen: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../services/socketService', () => ({
  emitRealtimeEvent: jest.fn(),
}));

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({
    data: Buffer.from('fake-jpeg-bytes'),
    headers: { 'content-type': 'image/jpeg' },
  }),
}));

const Workforce = require('../workforceSelf');

// ── fixtures ────────────────────────────────────────────────────────────────
function workerFixture(overrides = {}) {
  return {
    _id: WORKER_ID,
    name: 'Suresh Mane',
    phone: '+919876543300',
    employeeId: 'ZW-001',
    zone: 'Zone A',
    role: 'cleaner',
    status: 'busy',
    wardId: WARD_ID,
    currentLocation: { type: 'Point', coordinates: [73.854, 18.521] },
    assignedTasks: [],
    tasksCompleted: 5,
    performanceScore: 88,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function assignmentFixture(overrides = {}) {
  return {
    workerId: WORKER_ID,
    assignedBy: CITIZEN_ID,
    status: 'in_progress',
    notes: null,
    acceptedAt: new Date(Date.now() - 6000e3),
    startedAt: new Date(Date.now() - 3600e3),
    completedAt: null,
    activeSince: new Date(Date.now() - 3600e3),
    paused: false,
    pausedAt: null,
    timerSeconds: 300,
    startLocation: null,
    completionLocation: null,
    beforeImage: 'https://img.test/before.jpg',
    afterImage: null,
    beforeCapturedAt: new Date(Date.now() - 3600e3),
    afterCapturedAt: null,
    verification: { status: 'pending', method: 'ai_classifier_heuristic', cleanupScore: 0, verifiedAt: null },
    reportIssue: null,
    ...overrides,
  };
}

function complaintFixture(complaintStatus, assignmentOverrides = {}) {
  return {
    _id: TASK_ID,
    userId: CITIZEN_ID,
    wardId: { _id: WARD_ID, name: 'Ward 14 - Laxmi Road', city: 'Pune' },
    issueType: 'illegal_dumping',
    status: complaintStatus,
    priority: 3,
    location: { type: 'Point', coordinates: [73.8567, 18.5204] },
    address: 'Laxmi Road, Pune',
    description: 'Illegal dumping reported by citizen',
    createdAt: new Date(Date.now() - 7200e3),
    resolvedAt: null,
    aiResult: { status: 'completed', wasteType: 'plastic', confidence: 0.8 },
    assignments: [assignmentFixture(assignmentOverrides)],
  };
}

const VERIFIED_RESULT = {
  status: 'verified',
  method: 'ai_classifier_heuristic',
  cleanupScore: 0.87,
  beforeClassification: { class: 'plastic', confidence: 0.81 },
  afterClassification: { class: 'wet', confidence: 0.72 },
  reason: 'Waste accumulation signal reduced after cleanup.',
  verifiedAt: new Date(),
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    req.mockUser = { _id: WORKER_ID, role: role || 'worker', phone: '+919876543300' };
    next();
  });
  app.use('/api/v1/workforce', Workforce);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ success: false, data: null, message: err.message });
  });
  return app;
}

function queryChain(result, selectChain = false) {
  const q = {
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  return q;
}

describe('Worker Self-Service (worker dashboard) API Tests', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockDistance = 0;

    mockGetWorkerForUser.mockResolvedValue(workerFixture());
    mockFindWorkerAssignment.mockImplementation((complaint, workerId) =>
      complaint.assignments.find(a => String(a.workerId) === String(workerId)) || null
    );
    mockNormalizeTaskView.mockImplementation((complaint, _worker, assignment) => ({
      id: complaint._id,
      issueType: complaint.issueType,
      issueLabel: String(complaint.issueType || 'other').replace(/_/g, ' '),
      priority: complaint.priority,
      status: complaint.status,
      address: complaint.address,
      description: complaint.description,
      imageUrl: null,
      upvotes: 0,
      createdAt: complaint.createdAt,
      resolvedAt: complaint.resolvedAt,
      aiResult: { wasteType: complaint.aiResult?.wasteType || null, confidence: complaint.aiResult?.confidence || null, status: 'completed' },
      ward: { name: 'Ward 14 - Laxmi Road', city: 'Pune' },
      location: { lat: 18.5204, lng: 73.8567 },
      distanceKm: Number((mockDistance / 1000).toFixed(2)),
      assignment: {
        status: assignment.status,
        assignedAt: assignment.acceptedAt,
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
        verification: assignment.verification || { status: 'pending', method: 'none', cleanupScore: 0 },
        reportIssue: assignment.reportIssue || null,
        startLocation: assignment.startLocation || null,
        completionLocation: assignment.completionLocation || null,
      },
    }));
    mockListWorkerComplaints.mockResolvedValue([complaintFixture('in_progress')]);
    mockOnCountDocuments.mockResolvedValue(0);
    mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress')));
    mockHotspotFind.mockReturnValue(queryChain([]));
    mockUserFind.mockReturnValue(queryChain([]));
    require('../../models/Ward').findById.mockReturnValue(queryChain({ name: 'Ward 14 - Laxmi Road', city: 'Pune' }, true));
    mockWorkerFindByIdAndUpdate.mockImplementation(async (_id, update) =>
      workerFixture({ status: update?.status || 'busy' })
    );
    mockOnFindOneAndUpdate.mockResolvedValue(complaintFixture('in_progress'));
    mockRunCleanupVerification.mockResolvedValue(VERIFIED_RESULT);
  });

  describe('Auth isolation', () => {
    test('non-worker role is rejected with 403', async () => {
      const res = await request(app).get('/api/v1/workforce/me').set('x-test-role', 'authority');
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Insufficient permissions');
    });

    test('worker without a linked Worker profile gets 403', async () => {
      mockGetWorkerForUser.mockResolvedValue(null);
      const res = await request(app).get('/api/v1/workforce/me');
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Worker profile not found');
    });

    test('PATCH status accepts only own-status enum values', async () => {
      const bad = await request(app).patch('/api/v1/workforce/status').send({ status: 'asleep' });
      expect(bad.status).toBe(400);
      const good = await request(app).patch('/api/v1/workforce/status').send({ status: 'break' });
      expect(good.status).toBe(200);
      expect(good.body.data.worker.status).toBe('break');
      expect(mockWorkerFindByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('Profile & location', () => {
    test('GET /me returns the worker profile', async () => {
      const res = await request(app).get('/api/v1/workforce/me');
      expect(res.status).toBe(200);
      expect(res.body.data.worker).toMatchObject({ name: 'Suresh Mane', role: 'cleaner', tasksCompleted: 5 });
      expect(res.body.data.worker.wardName).toBe('Ward 14 - Laxmi Road');
    });

    test('PATCH location rejects missing coordinates', async () => {
      const res = await request(app).patch('/api/v1/workforce/location').send({});
      expect(res.status).toBe(400);
    });

    test('PATCH location updates worker location', async () => {
      const res = await request(app).patch('/api/v1/workforce/location').send({ lat: 18.52, lng: 73.85 });
      expect(res.status).toBe(200);
      expect(mockWorkerFindByIdAndUpdate).toHaveBeenCalledWith(
        WORKER_ID,
        expect.objectContaining({ currentLocation: { type: 'Point', coordinates: [73.85, 18.52] } }),
        expect.anything()
      );
    });
  });

  describe('Tasks list & detail', () => {
    test('GET /tasks rejects invalid status filter', async () => {
      const res = await request(app).get('/api/v1/workforce/tasks?status=bogus');
      expect(res.status).toBe(400);
    });

    test('GET /tasks returns owned tasks and counts', async () => {
      mockListWorkerComplaints.mockResolvedValue([
        complaintFixture('in_progress'),
        complaintFixture('resolved', { status: 'completed', completedAt: new Date() }),
      ]);
      const res = await request(app).get('/api/v1/workforce/tasks');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.tasks)).toBe(true);
      expect(res.body.data.tasks.length).toBe(2);
    });

    test('GET /tasks/:id with malformed id -> 404', async () => {
      const res = await request(app).get('/api/v1/workforce/tasks/not-an-objectid');
      expect(res.status).toBe(404);
      expect(mockOnFindOne).not.toHaveBeenCalled();
    });

    test('GET /tasks/:id hides tasks this worker does not own', async () => {
      mockOnFindOne.mockReturnValue(queryChain(null));
      const res = await request(app).get(`/api/v1/workforce/tasks/${TASK_ID}`);
      expect(res.status).toBe(404);
    });

    test('GET /tasks/:id returns owned detail with hotspot context', async () => {
      const res = await request(app).get(`/api/v1/workforce/tasks/${TASK_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(TASK_ID);
      expect(res.body.data.assignment.status).toBe('in_progress');
    });
  });

  describe('Task lifecycle', () => {
    test('POST /tasks/:id/accept rejects already in-progress task', async () => {
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/accept`);
      expect(res.status).toBe(400);
    });

    test('POST /tasks/:id/accept accepts an assigned task', async () => {
      mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress', {
        status: 'assigned', acceptedAt: null, startedAt: null,
      })));
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/accept`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('accepted');
    });

    test('POST /tasks/:id/start rejects when too far from complaint', async () => {
      mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress', { status: 'assigned', acceptedAt: null })));
      mockDistance = 5000;
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/start`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LOCATION_VERIFICATION_FAILED');
      expect(res.body.distance_m).toBe(5000);
    });

    test('POST /tasks/:id/start succeeds within the verification radius', async () => {
      mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress', { status: 'accepted', startedAt: null })));
      mockDistance = 50;
      const res = await request(app)
        .post(`/api/v1/workforce/tasks/${TASK_ID}/start`)
        .send({ lat: 18.5204, lng: 73.8567 });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_progress');
    });

    test('POST /tasks/:id/pause works on an in-progress task', async () => {
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/pause`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paused');
    });

    test('POST /tasks/:id/resume works on a paused task', async () => {
      mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress', { paused: true, pausedAt: new Date() })));
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/resume`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_progress');
    });
  });

  describe('Evidence & verification', () => {
    test('POST /tasks/:id/evidence rejects an unknown evidence type', async () => {
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/evidence`).send({ type: 'side' });
      expect(res.status).toBe(400);
    });

    test('POST /tasks/:id/evidence refuses uploads for unseen tasks', async () => {
      mockOnFindOne.mockReturnValue(queryChain(null));
      const res = await request(app)
        .post(`/api/v1/workforce/tasks/${TASK_ID}/evidence`)
        .field('type', 'after')
        .attach('image', Buffer.from('fake'), 'after.jpg');
      expect(res.status).toBe(404);
    });

    test('POST /tasks/:id/evidence saves an AFTER photo', async () => {
      const updated = complaintFixture('in_progress', {
        afterImage: 'https://cdn.swachhanet.test/evidence/up.jpg',
        afterCapturedAt: new Date(),
      });
      mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress')));
      mockOnFindOneAndUpdate.mockResolvedValue(updated);

      const res = await request(app)
        .post(`/api/v1/workforce/tasks/${TASK_ID}/evidence`)
        .field('type', 'after')
        .field('lat', '18.5205')
        .field('lng', '73.8568')
        .attach('image', Buffer.from('fake-jpeg'), 'after.jpg');

      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe('after');
      expect(res.body.data.hasAfter).toBe(true);
    });

    test('POST /tasks/:id/verify requires both evidence images', async () => {
      mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress', { afterImage: null })));
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/verify`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Both BEFORE and AFTER evidence images');
    });

    test('POST /tasks/:id/verify returns verified status', async () => {
      mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress', {
        afterImage: 'https://img.test/after.jpg',
        afterCapturedAt: new Date(),
      })));
      mockOnFindOneAndUpdate.mockResolvedValue(complaintFixture('in_progress', {
        afterImage: 'https://img.test/after.jpg',
        afterCapturedAt: new Date(),
        verification: VERIFIED_RESULT,
      }));
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/verify`);
      expect(res.status).toBe(200);
      expect(res.body.data.verification.status).toBe('verified');
      expect(mockRunCleanupVerification).toHaveBeenCalledWith(expect.objectContaining({
        beforeBuffer: expect.any(Buffer),
        afterBuffer: expect.any(Buffer),
      }));
    });
  });

  describe('Completion & reporting', () => {
    test('POST /tasks/:id/complete blocks without AFTER evidence', async () => {
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/complete`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('EVIDENCE_REQUIRED');
    });

    test('POST /tasks/:id/complete completes a verified task', async () => {
      mockOnFindOne.mockReturnValue(queryChain(complaintFixture('in_progress', {
        afterImage: 'https://img.test/after.jpg',
        afterCapturedAt: new Date(),
      })));
      const res = await request(app).post(`/api/v1/workforce/tasks/${TASK_ID}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.verification.status).toBe('verified');
      expect(res.body.data.performanceScore).toBeGreaterThan(0);
      expect(mockWorkerFindByIdAndUpdate).toHaveBeenCalledWith(
        WORKER_ID,
        expect.objectContaining({ tasksCompleted: 6 })
      );
    });

    test('POST /tasks/:id/report-issue rejects an invalid reason', async () => {
      const res = await request(app)
        .post(`/api/v1/workforce/tasks/${TASK_ID}/report-issue`)
        .send({ reason: 'upset_citizen' });
      expect(res.status).toBe(400);
    });

    test('POST /tasks/:id/report-issue reassigns the task to authority', async () => {
      const res = await request(app)
        .post(`/api/v1/workforce/tasks/${TASK_ID}/report-issue`)
        .send({ reason: 'unsafe_location', notes: 'Live wires at site' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('reassigned');
      expect(res.body.data.reason).toBe('unsafe_location');
      expect(mockOnFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: TASK_ID }),
        expect.objectContaining({ $set: expect.objectContaining({ 'assignments.$.status': 'reassigned' }) })
      );
    });
  });

  describe('Route, performance & history', () => {
    test('GET /route returns an ordered plan', async () => {
      mockListWorkerComplaints.mockResolvedValue([
        complaintFixture('in_progress'),
        complaintFixture('in_progress', { status: 'assigned', acceptedAt: null, startedAt: null }),
      ]);
      const res = await request(app).get('/api/v1/workforce/route');
      expect(res.status).toBe(200);
      expect(res.body.data.route.length).toBe(2);
      expect(res.body.data.summary.taskCount).toBe(2);
      expect(res.body.data.route[0].status).toBe('in_progress');
    });

    test('GET /performance returns analytics', async () => {
      mockListWorkerComplaints.mockResolvedValue([
        complaintFixture('resolved', {
          status: 'completed',
          completedAt: new Date(),
          afterImage: 'https://img.test/after.jpg',
          verification: VERIFIED_RESULT,
        }),
      ]);
      const res = await request(app).get('/api/v1/workforce/performance');
      expect(res.status).toBe(200);
      expect(res.body.data.tasksCompleted).toBe(5);
      expect(res.body.data.currentStreak).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.body.data.trend)).toBe(true);
    });

    test('GET /history returns paginated completed history', async () => {
      mockListWorkerComplaints.mockResolvedValue([
        complaintFixture('resolved', {
          status: 'completed',
          completedAt: new Date(),
          afterImage: 'https://img.test/after.jpg',
          verification: VERIFIED_RESULT,
        }),
      ]);
      const res = await request(app).get('/api/v1/workforce/history?period=month');
      expect(res.status).toBe(200);
      expect(res.body.data.meta.total).toBe(1);
      expect(res.body.data.history[0].verificationStatus).toBe('verified');
    });
  });
});