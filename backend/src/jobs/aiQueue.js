const Bull      = require('bull');
const Complaint = require('../models/Complaint');
const logger    = require('../utils/logger');
const aiService = require('../services/aiService');

const aiQueue = new Bull('ai-classification', {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
});

const { emitComplaintUpdated } = require('../services/socketService');

aiQueue.process('classify_waste', 5, async (job) => {
  const { complaintId, imageUrl } = job.data;
  logger.info(`Processing AI classification for complaint ${complaintId} (attempt ${job.attemptsMade + 1})`);

  try {
    const prediction = await aiService.classifyFromUrl(imageUrl);
    const { class: label, confidence, probabilities, model_version } = prediction;

    const updated = await Complaint.findByIdAndUpdate(
      complaintId,
      {
        classificationStatus: 'completed',
        aiResult: {
          wasteType:    label,
          confidence,
          modelVersion: model_version || 'v1.0',
          allScores:    probabilities,
          processedAt:  new Date(),
        },
      },
      { new: true }
    );

    if (updated) {
      emitComplaintUpdated(updated);
    }
    logger.info(`AI result saved: ${label} (${confidence}) for complaint ${complaintId}`);
    return prediction;
  } catch (err) {
    if (job.attemptsMade + 1 >= (job.opts?.attempts || 3)) {
      const failedDoc = await Complaint.findByIdAndUpdate(
        complaintId,
        { classificationStatus: 'failed' },
        { new: true }
      );
      if (failedDoc) {
        emitComplaintUpdated(failedDoc);
      }
      logger.error(`AI classification permanently failed for complaint ${complaintId}: ${err.message}`);
    }
    throw err;
  }
});

aiQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} for complaint ${job.data?.complaintId} failed on attempt ${job.attemptsMade}:`, err.message);
});

async function queueAIClassification(data) {
  return aiQueue.add('classify_waste', data);
}

module.exports = { aiQueue, queueAIClassification };
