const { createClient } = require('redis');
const logger = require('../utils/logger');

let client;

async function connectRedis() {
  try {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: { reconnectStrategy: false }
    });
    client.on('error', err => logger.warn('Redis error:', err.message || err));
    client.on('connect', () => logger.info('Redis connected'));
    await client.connect();
  } catch (err) {
    logger.warn(`Redis unavailable (${err.message}). Caching disabled.`);
    if (client) {
      try { await client.disconnect(); } catch (_) {}
    }
    client = null;
  }
}

function getRedis() {
  return client;
}

async function setEx(key, seconds, value) {
  if (!client) return;
  try {
    return await client.setEx(key, seconds, JSON.stringify(value));
  } catch (err) {
    logger.warn('Redis setEx failed:', err.message);
  }
}

async function get(key) {
  if (!client) return null;
  try {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn('Redis get failed:', err.message);
    return null;
  }
}

async function del(key) {
  if (!client) return;
  try {
    return await client.del(key);
  } catch (err) {
    logger.warn('Redis del failed:', err.message);
  }
}

module.exports = { connectRedis, getRedis, setEx, get, del };
