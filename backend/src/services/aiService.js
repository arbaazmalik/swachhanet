const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

const rawAIML = (process.env.AIML_SERVICE_URL || process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const AIML_BASE_URL = rawAIML.endsWith('/api/v1') ? rawAIML : `${rawAIML}/api/v1`;

class AIService {
  async predictWaste(fileBuffer, mimeType, filename, retries = 2) {
    let delay = 500;
    for (let i = 0; i < retries; i++) {
      try {
        const form = new FormData();
        form.append('file', fileBuffer, {
          filename: filename || 'waste-image.jpg',
          contentType: mimeType || 'image/jpeg',
        });

        const response = await axios.post(`${AIML_BASE_URL}/predict-waste`, form, {
          headers: form.getHeaders(),
          timeout: 10000,
        });

        if (response.data && response.data.class) {
          return response.data;
        }
      } catch (error) {
        logger.warn(`AIML /predict-waste attempt ${i + 1} failed: ${error.message}`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // No fake classification fallback - strictly throw so callers handle degraded / pending state properly
    const err = new Error('Waste classification service is temporarily unavailable.');
    err.code = 'AI_SERVICE_UNAVAILABLE';
    logger.error('AIML service unreachable after retries. Classification failed.');
    throw err;
  }

  async checkReadiness() {
    try {
      const response = await axios.get(`${AIML_BASE_URL}/ready`, { timeout: 3000 });
      return response.data;
    } catch (error) {
      return { ready: false, error: error.message };
    }
  }

  async classifyFromUrl(imageUrl) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
      const fileBuffer = Buffer.from(imageResponse.data);
      return this.predictWaste(fileBuffer, contentType, 'remote-image');
    } catch (error) {
      logger.error('Error classifying image from URL:', error.message);
      throw error;
    }
  }

  async detectHotspots(coordinates) {
    try {
      const response = await axios.post(`${AIML_BASE_URL}/detect-hotspot`, { coordinates }, {
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      logger.error('Error calling AIML /detect-hotspot:', error.message);
      throw error;
    }
  }

  async predictTrend(historicalData, forecastDays = 30) {
    try {
      const response = await axios.post(`${AIML_BASE_URL}/predict-trend`, {
        historical_data: historicalData,
        forecast_days: forecastDays,
      }, {
        timeout: 60000,
      });
      return response.data;
    } catch (error) {
      logger.error('Error calling AIML /predict-trend:', error.message);
      throw error;
    }
  }
}

module.exports = new AIService();
