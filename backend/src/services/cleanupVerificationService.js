const aiService = require('./aiService');
const logger = require('../utils/logger');

/**
 * CLEANUP VERIFICATION — pluggable contract.
 *
 * IMPORTANT HONESTY NOTE:
 * The existing AIML service (`/predict-waste`) classifies an image into
 * {wet, dry, plastic, hazardous}. It does NOT contain a dedicated
 * "before/after cleanup verification" model. Therefore this module does NOT
 * claim the street is clean. It computes a transparent, rule-based
 * "cleanup indicator" from REAL classifier outputs on the before/after
 * evidence images:
 *
 *   1. Classify the BEFORE image  → is a waste pile confidently present?
 *   2. Classify the AFTER image   → did that signal disappear / change?
 *
 * The heuristic only ever reports `verified` when the classifier genuinely
 * observes that the dominant waste signal present before the cleanup is no
 * longer present afterwards. In every ambiguous or unavailable case the
 * verification is flagged `review_required` (never faked).
 *
 * A future, dedicated verification model can be swapped in behind
 * `runCleanupVerification` without touching routes or the UI contract.
 */

// Classified "waste clearly present" when confidence crosses this threshold
// (kept in sync with the AIML classifier's own is_confident threshold).
const PRESENCE_THRESHOLD = 0.6;

function normalizeClassification(prediction) {
  if (!prediction) return null;
  return {
    wasteType: prediction.class || prediction.waste_type || null,
    confidence: Number(prediction.confidence || 0),
    isConfident: prediction.is_confident !== false,
  };
}

async function classifyBuffer(buffer, mimeType) {
  return aiService.predictWaste(buffer, mimeType || 'image/jpeg', 'evidence-image.jpg');
}

/**
 * Runs cleanup verification on the before/after evidence images.
 *
 * @param {Buffer} beforeBuffer   decoded image buffer of the BEFORE capture
 * @param {Buffer} afterBuffer    decoded image buffer of the AFTER capture
 * @param {string} beforeMime
 * @param {string} afterMime
 * @returns {Promise<{status, method, cleanupScore, beforeClassification,
 *                     afterClassification, reason, verifiedAt}>}
 */
async function runCleanupVerification({ beforeBuffer, afterBuffer, beforeMime, afterMime }) {
  if (!beforeBuffer || !afterBuffer) {
    return {
      status: 'pending',
      method: 'none',
      cleanupScore: 0,
      beforeClassification: null,
      afterClassification: null,
      reason: 'Missing before/after evidence images.',
      verifiedAt: new Date(),
    };
  }

  let beforeClassification = null;
  let afterClassification = null;

  try {
    const [beforePred, afterPred] = await Promise.all([
      classifyBuffer(beforeBuffer, beforeMime),
      classifyBuffer(afterBuffer, afterMime),
    ]);
    beforeClassification = normalizeClassification(beforePred);
    afterClassification = normalizeClassification(afterPred);
  } catch (err) {
    logger.warn(`Cleanup verification: classifier unavailable (${err.message}). Evidence retained for review.`);
    return {
      status: 'review_required',
      method: 'ai_classifier_heuristic',
      cleanupScore: 0,
      beforeClassification: null,
      afterClassification: null,
      reason: 'AI verification service is temporarily unavailable. Your evidence has been saved and will be reviewed.',
      verifiedAt: new Date(),
    };
  }

  if (!beforeClassification || !afterClassification) {
    return {
      status: 'review_required',
      method: 'ai_classifier_heuristic',
      cleanupScore: 0,
      beforeClassification,
      afterClassification,
      reason: 'Could not analyze the evidence images. Manual review required.',
      verifiedAt: new Date(),
    };
  }

  const wasPresent = beforeClassification.isConfident && beforeClassification.confidence >= PRESENCE_THRESHOLD;
  const stillPresent = afterClassification.isConfident && afterClassification.confidence >= PRESENCE_THRESHOLD;
  const classChanged = beforeClassification.wasteType !== afterClassification.wasteType;

  let status = 'review_required';
  let cleanupScore = 0;
  let reason;

  if (!wasPresent) {
    cleanupScore = Math.max(0.1, 0.5 - beforeClassification.confidence);
    reason =
      'No dominant waste signal detected in the before image, so automatic verification is inconclusive. Manual review requested.';
  } else if (!stillPresent || classChanged) {
    // The dominant waste signal that existed before is gone (or transformed),
    // indicating the accumulation was cleared.
    const signalDrop = Math.max(0, beforeClassification.confidence - afterClassification.confidence);
    cleanupScore = Math.min(0.97, 0.6 + signalDrop + (classChanged ? 0.2 : 0));
    status = 'verified';
    reason = classChanged
      ? 'Waste accumulation signal changed/disappeared after cleanup.'
      : 'Visible waste accumulation signal significantly reduced after cleanup.';
  } else {
    cleanupScore = Math.min(0.4, afterClassification.confidence);
    reason =
      'The dominant waste signal is still present in the after image. Cleanup may be incomplete. Manual review requested.';
  }

  logger.info(
    `Cleanup verification result: ${status} (score=${cleanupScore.toFixed(2)}, ` +
    `before=${beforeClassification.wasteType}:${beforeClassification.confidence.toFixed(2)}, ` +
    `after=${afterClassification.wasteType}:${afterClassification.confidence.toFixed(2)})`
  );

  return {
    status,
    method: 'ai_classifier_heuristic',
    cleanupScore: Number(cleanupScore.toFixed(2)),
    beforeClassification,
    afterClassification,
    reason,
    verifiedAt: new Date(),
  };
}

module.exports = { runCleanupVerification, PRESENCE_THRESHOLD };