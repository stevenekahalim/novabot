/**
 * Metrics API Routes
 *
 * Provides endpoints for monitoring Nova's daily operations
 */

const express = require('express');
const router = express.Router();
const MetricsService = require('../services/metricsService');
const logger = require('../utils/logger');

/**
 * GET /api/metrics/daily
 *
 * Returns daily metrics for monitoring dashboard
 * Query params:
 *   - date (optional): YYYY-MM-DD format, defaults to yesterday
 */
router.get('/daily', async (req, res) => {
  try {
    // Get supabase client from app locals
    const supabaseClient = req.app.locals.supabase;
    if (!supabaseClient) {
      return res.status(500).json({ error: 'Supabase client not initialized' });
    }

    const metricsService = new MetricsService(supabaseClient);

    // Parse date if provided
    let targetDate = null;
    if (req.query.date) {
      targetDate = new Date(req.query.date);
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
    }

    const metrics = await metricsService.getDailyMetrics(targetDate);

    logger.info(`[Metrics API] Served daily metrics for ${metrics.date}`);

    res.json(metrics);

  } catch (error) {
    logger.error('[Metrics API] Error fetching daily metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/health
 *
 * Quick health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const supabaseClient = req.app.locals.supabase;
    if (!supabaseClient) {
      return res.status(500).json({ error: 'Supabase client not initialized' });
    }

    const metricsService = new MetricsService(supabaseClient);
    const health = await metricsService.getSystemHealth();

    res.json(health);

  } catch (error) {
    logger.error('[Metrics API] Error fetching health:', error);
    res.status(500).json({
      error: 'Failed to fetch health',
      message: error.message
    });
  }
});

module.exports = router;
