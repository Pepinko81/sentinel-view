const express = require('express');
const router = express.Router();
const f2b = require('../services/f2b');

/**
 * GET /api/jail-config/:name
 * Read jail configuration file
 */
router.get('/:name', async (req, res, next) => {
  try {
    const jailName = req.params.name;
    const config = await f2b.readJailConfig(jailName);
    res.json({
      success: true,
      jail: jailName,
      content: config.content,
      path: config.path,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jail-config/:name
 * Write jail configuration file
 */
router.post('/:name', async (req, res, next) => {
  try {
    const jailName = req.params.name;
    const { content, targetPath } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Configuration content is required',
      });
    }
    
    const result = await f2b.writeJailConfig(jailName, content, targetPath);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

