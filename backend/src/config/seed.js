require('dotenv').config();
const mongoose     = require('mongoose');
const bcrypt       = require('bcryptjs');

const User         = require('../models/User');
const Ward         = require('../models/Ward');
const Worker       = require('../models/Worker');
const Complaint    = require('../models/Complaint');
const Gamification = require('../models/Gamification');
const Hotspot      = require('../models/Hotspot');
const { TrainingModule, QuizAttempt, ModuleProgress } = require('../models/Training');
const { Notification }   = require('../models/Notification');
const logger       = require('../utils/logger');

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/swachhanet';
  await mongoose.connect(uri);
  logger.info('Connected to MongoDB');

  // Clean existing data
  await Promise.all([
    User.deleteMany({}), Ward.deleteMany({}), Worker.deleteMany({}),
    Complaint.deleteMany({}), Gamification.deleteMany({}),
    Hotspot.deleteMany({}), TrainingModule.deleteMany({}),
    QuizAttempt.deleteMany({}), ModuleProgress.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  logger.info('Cleared existing data');

  // ── Wards ─────────────────────────────────────────────────────────────────
  const ward = await Ward.create({
    name: 'Ward 14 - Laxmi Road', ulbCode: 'PMC-14', city: 'Pune', state: 'Maharashtra',
    boundary: {
      type: 'Polygon',
      coordinates: [[
        [73.8480, 18.5260],
        [73.8660, 18.5260],
        [73.8660, 18.5140],
        [73.8480, 18.5140],
        [73.8480, 18.5260],
      ]],
    },
  });
  const ward2 = await Ward.create({
    name: 'Ward 7 - Nagar Road', ulbCode: 'PMC-07', city: 'Pune', state: 'Maharashtra',
    boundary: {
      type: 'Polygon',
      coordinates: [[
        [73.8560, 18.5320],
        [73.8780, 18.5320],
        [73.8780, 18.5180],
        [73.8560, 18.5180],
        [73.8560, 18.5320],
      ]],
    },
  });
  logger.info('Wards seeded');

  // ── Users ─────────────────────────────────────────────────────────────────
  const citizenHash   = await bcrypt.hash('citizen123', 12);
  const authorityHash = await bcrypt.hash('authority123', 12);
  const workerHash    = await bcrypt.hash('worker123', 12);

  const citizen = await User.create({
    name: 'Rahul Kumar', phone: '+919876543210', email: 'rahul@example.com',
    passwordHash: citizenHash, role: 'citizen', wardId: ward._id, isVerified: true,
    location: { type: 'Point', coordinates: [73.8567, 18.5204] },
  });

  const authority = await User.create({
    name: 'Sneha Gupta', phone: '+919876543211', email: 'sneha@pmc.gov.in',
    passwordHash: authorityHash, role: 'authority', wardId: ward._id, isVerified: true,
  });

  const citizen2 = await User.create({
    name: 'Priya Shah', phone: '+919876543212', email: 'priya@example.com',
    passwordHash: citizenHash, role: 'citizen', wardId: ward._id, isVerified: true,
  });

  // Worker login account — linked to a Worker profile below via userId.
  const workerUser = await User.create({
    name: 'Suresh Mane', phone: '+919876543300', email: 'suresh.mane@swachhanet.in',
    passwordHash: workerHash, role: 'worker', wardId: ward._id, isVerified: true,
  });

  logger.info('Users seeded');

  // ── Workers ───────────────────────────────────────────────────────────────
  const workers = await Worker.insertMany([
    { name: 'Suresh Mane',   phone: '+919876543300', userId: workerUser._id, zone: 'Zone A', wardId: ward._id,  status: 'available', currentLocation: { type: 'Point', coordinates: [73.852, 18.521] } },
    { name: 'Priya Kamble',  phone: '+919876543301', zone: 'Zone B', wardId: ward._id,  status: 'busy',      currentLocation: { type: 'Point', coordinates: [73.858, 18.519] } },
    { name: 'Rajan Desai',   phone: '+919876543302', zone: 'Zone C', wardId: ward2._id, status: 'break',     currentLocation: { type: 'Point', coordinates: [73.862, 18.524] } },
  ]);
  const suresh = workers[0];
  logger.info('Workers seeded');

  // ── Complaints ────────────────────────────────────────────────────────────
  const complaintDefs = [
    { issueType: 'full_dustbin',    lat: 18.5204, lng: 73.8567, priority: 2, status: 'pending',     userId: citizen._id  },
    { issueType: 'illegal_dumping', lat: 18.5210, lng: 73.8580, priority: 3, status: 'in_progress', userId: citizen._id  },
    { issueType: 'burning_waste',   lat: 18.5198, lng: 73.8555, priority: 3, status: 'pending',     userId: citizen2._id },
    { issueType: 'missed_collection', lat: 18.5220, lng: 73.8600, priority: 1, status: 'resolved',  userId: citizen._id, resolvedAt: new Date() },
    { issueType: 'overflowing_bin', lat: 18.5190, lng: 73.8540, priority: 2, status: 'assigned',   userId: citizen2._id },
    { issueType: 'illegal_dumping', lat: 18.5215, lng: 73.8572, priority: 3, status: 'pending',    userId: citizen._id  },
  ];

  const complaints = await Complaint.insertMany(
    complaintDefs.map(c => ({
      userId:    c.userId,
      wardId:    ward._id,
      issueType: c.issueType,
      status:    c.status,
      priority:  c.priority,
      location:  { type: 'Point', coordinates: [c.lng, c.lat] },
      address:   'Laxmi Road, Pune, Maharashtra',
      description: 'Reported by citizen via SwachhaNet app',
      resolvedAt: c.resolvedAt,
      aiResult: {
        wasteType:    ['wet','dry','plastic','hazardous','mixed'][Math.floor(Math.random()*5)],
        confidence:   +(0.65 + Math.random() * 0.30).toFixed(3),
        modelVersion: 'v1.0',
        processedAt:  new Date(),
      },
    }))
  );

  // ── Worker task pipeline (additive demo data) ─────────────────────────────
  // Give Suresh one completed (with verification), one in-progress and one
  // fresh assigned complaint so the worker dashboard has real lifecycle data.
  const assignedComplaint   = complaints.find(c => c.issueType === 'overflowing_bin'); // status 'assigned'
  const inProgressComplaint = complaints.find(c => c.issueType === 'illegal_dumping'); // status 'in_progress'
  const completedComplaint  = complaints.find(c => c.issueType === 'missed_collection'); // status 'resolved'

  const daysAgo            = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const startLoc           = { type: 'Point', coordinates: [73.8547, 18.5202] };
  const demoBeforeImage    = '/uploads/evidence/demo-before.jpg';
  const demoAfterImage     = '/uploads/evidence/demo-after.jpg';

  if (assignedComplaint) {
    assignedComplaint.assignments.push({
      workerId: suresh._id,
      status: 'assigned',
      assignedAt: daysAgo(0.5),
      verification: { status: 'pending', method: 'ai_classifier_heuristic', verifiedAt: null },
    });
    await assignedComplaint.save();
    suresh.assignedTasks.push(assignedComplaint._id);
  }

  if (inProgressComplaint) {
    inProgressComplaint.assignments.push({
      workerId: suresh._id,
      status: 'in_progress',
      assignedAt: daysAgo(1),
      startedAt: daysAgo(0.9),
      activeSince: daysAgo(0.9),
      startLocation: startLoc,
      beforeImage: demoBeforeImage,
      beforeCapturedAt: daysAgo(0.9),
      afterCapturedAt: null,
      timerSeconds: 7200,
      paused: false,
      verification: { status: 'pending', method: 'ai_classifier_heuristic', verifiedAt: null },
    });
    await inProgressComplaint.save();
    suresh.assignedTasks.push(inProgressComplaint._id);
  }

  if (completedComplaint) {
    completedComplaint.assignments.push({
      workerId: suresh._id,
      status: 'completed',
      assignedAt: daysAgo(3),
      acceptedAt: daysAgo(2.9),
      startedAt: daysAgo(2.8),
      completedAt: daysAgo(2.6),
      startLocation: startLoc,
      completionLocation: { type: 'Point', coordinates: [73.8545, 18.5202] },
      beforeImage: demoBeforeImage,
      afterImage: demoAfterImage,
      beforeCapturedAt: daysAgo(2.8),
      afterCapturedAt: daysAgo(2.6),
      timerSeconds: 4200,
      paused: false,
      activeSince: null,
      verification: {
        status: 'verified',
        method: 'ai_classifier_heuristic',
        cleanupScore: 0.87,
        beforeClassification: { class: 'plastic', confidence: 0.81 },
        afterClassification: { class: 'wet', confidence: 0.72 },
        reason: 'Waste signal reduced between before and after evidence.',
        verifiedAt: daysAgo(2.6),
      },
    });
    await completedComplaint.save();
  }

  // Worker counter book-keeping mirrors the complete flow outcomes.
  suresh.tasksCompleted = 1;
  suresh.performanceScore = 92;
  suresh.lastActiveAt = daysAgo(1);
  await suresh.save();

  logger.info('Complaints seeded');

  // ── Gamification ──────────────────────────────────────────────────────────
  await Gamification.create({
    userId: citizen._id, totalPoints: 640, level: 3,
    badges: ['first_report', 'eco_learner', 'streak_7'],
    reportsCount: 3, quizzesPassed: 2, streakDays: 7,
  });
  await Gamification.create({
    userId: citizen2._id, totalPoints: 210, level: 2,
    badges: ['first_report'], reportsCount: 2, quizzesPassed: 1, streakDays: 2,
  });
  logger.info('Gamification seeded');

  // ── Hotspots ──────────────────────────────────────────────────────────────
  await Hotspot.insertMany([
    { wardId: ward._id, centroid: { type: 'Point', coordinates: [73.8575, 18.5207] }, complaintCount: 4, severityScore: 2.8, dominantType: 'illegal_dumping', periodDays: 7 },
    { wardId: ward._id, centroid: { type: 'Point', coordinates: [73.8545, 18.5195] }, complaintCount: 2, severityScore: 1.5, dominantType: 'full_dustbin',    periodDays: 7 },
  ]);
  logger.info('Hotspots seeded');

  // ── Training Modules ──────────────────────────────────────────────────────
  await TrainingModule.insertMany([
    {
      title: 'Waste Segregation Basics',
      category: 'segregation',
      contentType: 'video',
      contentUrl: 'https://www.youtube.com/watch?v=1pG0e8D6Wm0',
      pointsReward: 30,
      durationMins: 5,
      sortOrder: 0,
      description: 'Learn the 3-bin system for effective waste separation at source.',
    },
    {
      title: 'Home Composting Guide',
      category: 'composting',
      contentType: 'article',
      contentUrl: 'https://swachhbharatmission.gov.in',
      pointsReward: 25,
      durationMins: 8,
      sortOrder: 1,
      description: 'Turn kitchen waste into rich compost in 3 simple steps.',
    },
    {
      title: 'Plastic Recycling Quiz',
      category: 'recycling',
      contentType: 'quiz',
      pointsReward: 100,
      durationMins: 3,
      sortOrder: 2,
      description: 'Test your knowledge on plastic recycling categories and codes.',
      quizQuestions: [
        {
          question: 'Which bin should you use for clean plastic bottles?',
          options: ['Wet bin', 'Dry/Recyclable bin', 'Hazardous bin', 'Do not dispose'],
          answerIndex: 1,
        },
        {
          question: 'What should you do before recycling food containers?',
          options: ['Leave food residue', 'Rinse and dry the container', 'Burn it', 'Crush and bury it'],
          answerIndex: 1,
        },
        {
          question: 'Which item is generally not recyclable in home collection?',
          options: ['Newspaper', 'Glass bottle', 'Used battery', 'Cardboard box'],
          answerIndex: 2,
        },
      ],
    },
    {
      title: 'E-Waste Disposal Rules',
      category: 'awareness',
      contentType: 'infographic',
      contentUrl: 'https://cpcb.nic.in/e-waste',
      pointsReward: 20,
      durationMins: 4,
      sortOrder: 3,
      description: 'Understand how to safely dispose of electronics and batteries.',
    },
    {
      title: 'Dry Waste and Recycling',
      category: 'recycling',
      contentType: 'video',
      contentUrl: 'https://www.youtube.com/watch?v=sQkHf4lkrxQ',
      pointsReward: 30,
      durationMins: 6,
      sortOrder: 4,
      description: 'Complete guide to sorting paper, glass, metal, and plastic.',
    },
    {
      title: 'Wet Waste to Compost Quiz',
      category: 'composting',
      contentType: 'quiz',
      pointsReward: 90,
      durationMins: 4,
      sortOrder: 5,
      description: 'Test your understanding of home composting methods.',
      quizQuestions: [
        {
          question: 'Which material is best for balancing wet kitchen waste in compost?',
          options: ['Dry leaves', 'Plastic wrappers', 'Glass pieces', 'Aluminium foil'],
          answerIndex: 0,
        },
        {
          question: 'How often should compost be turned for aeration?',
          options: ['Never', 'Once every 1-2 days', 'Once every 2-3 weeks', 'Every month'],
          answerIndex: 1,
        },
        {
          question: 'Which waste should NOT go into home compost?',
          options: ['Fruit peels', 'Tea leaves', 'Cooked oily food in excess', 'Vegetable scraps'],
          answerIndex: 2,
        },
      ],
    },
    {
      title: 'Community Cleanliness Awareness',
      category: 'awareness',
      contentType: 'article',
      contentUrl: 'https://www.mygov.in/campaigns/swachh-bharat',
      pointsReward: 20,
      durationMins: 5,
      sortOrder: 6,
      description: 'Best practices for maintaining cleaner streets and public spaces.',
    },
    {
      title: 'Segregation Master Quiz',
      category: 'segregation',
      contentType: 'quiz',
      pointsReward: 120,
      durationMins: 5,
      sortOrder: 7,
      description: 'Advanced segregation scenarios for daily household waste.',
      quizQuestions: [
        {
          question: 'Milk packets after rinsing should be disposed in which bin?',
          options: ['Wet bin', 'Dry bin', 'Hazardous bin', 'Sanitary bin'],
          answerIndex: 1,
        },
        {
          question: 'Broken CFL bulbs should be disposed as:',
          options: ['Regular dry waste', 'Wet waste', 'Hazardous/e-waste', 'Compost'],
          answerIndex: 2,
        },
        {
          question: 'Used tissue paper is generally categorized as:',
          options: ['Wet waste', 'Dry recyclable waste', 'E-waste', 'Metal scrap'],
          answerIndex: 0,
        },
      ],
    },
  ]);
  logger.info('Training modules seeded');

  // ── Sample Notifications ──────────────────────────────────────────────────
  await Notification.insertMany([
    { userId: citizen._id, title: 'Complaint Resolved!', body: 'Your missed collection complaint on MG Road has been resolved.', type: 'complaint_update', isRead: false },
    { userId: citizen._id, title: 'Tip: Segregate your waste', body: 'Did you know proper waste segregation reduces landfill waste by 60%?', type: 'awareness', isRead: true },
    { userId: citizen._id, title: '🏆 Badge Earned!', body: 'You earned the "7-Day Streak" badge. Keep it up!', type: 'reward', isRead: false },
  ]);
  logger.info('Notifications seeded');

  logger.info('\n✅ Seed complete!');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('Demo credentials:');
  logger.info('  Citizen:   +919876543210 / citizen123');
  logger.info('  Authority: +919876543211 / authority123');
  logger.info('  Worker:    +919876543300 / worker123');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
