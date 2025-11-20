const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * Trigger Routes
 * Manual triggers for daily update jobs
 */

// Trigger morning update manually
router.post('/morning-update', async (req, res) => {
  try {
    logger.info('[Trigger API] Manual morning update requested');

    if (!req.app.locals.dailyUpdates) {
      return res.status(503).json({
        success: false,
        error: 'Daily updates job not initialized'
      });
    }

    await req.app.locals.dailyUpdates.testMorningUpdate();

    res.json({
      success: true,
      message: 'Morning update sent to WhatsApp group'
    });
  } catch (error) {
    logger.error('[Trigger API] Error in morning update:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Trigger afternoon update manually
router.post('/afternoon-update', async (req, res) => {
  try {
    logger.info('[Trigger API] Manual afternoon update requested');

    if (!req.app.locals.dailyUpdates) {
      return res.status(503).json({
        success: false,
        error: 'Daily updates job not initialized'
      });
    }

    await req.app.locals.dailyUpdates.testAfternoonUpdate();

    res.json({
      success: true,
      message: 'Afternoon update sent to WhatsApp group'
    });
  } catch (error) {
    logger.error('[Trigger API] Error in afternoon update:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
