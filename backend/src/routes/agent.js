const express = require('express');
const router = express.Router();
const servers = require('../services/servers');

/**
 * POST /api/agent/push
 * Receive data from agent
 * Headers: X-Sentinel-ID, X-Sentinel-Key
 */
router.post('/push', async (req, res, next) => {
  try {
    const serverId = req.headers['x-sentinel-id'];
    const secret = req.headers['x-sentinel-key'];
    
    if (!serverId || !secret) {
      return res.status(401).json({
        success: false,
        error: 'Missing X-Sentinel-ID or X-Sentinel-Key headers',
      });
    }
    
    // Extract IP from request
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check if server exists
    const existingServer = servers.getServerById(serverId);
    const isNewServer = !existingServer;
    
    // Verify secret (if server exists)
    if (!isNewServer) {
      const isValid = servers.verifyServerSecret(serverId, secret);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid secret key',
        });
      }
    }
    
    // Extract remoteUrl from request body if provided
    const remoteUrl = req.body.remoteUrl || null;
    
    // Register/update server
    const server = servers.registerServer(
      serverId,
      secret,
      req.body.name || null,
      clientIp,
      remoteUrl
    );
    
    // Store server data
    servers.storeServerData(serverId, {
      jails: req.body.jails || [],
      bans: req.body.bans || [],
      logTail: req.body.logTail || [],
    });
    
    res.json({
      success: true,
      message: 'Data received',
      serverId: serverId,
    });
  } catch (err) {
    console.error('[AGENT] Error processing push:', err);
    next(err);
  }
});

module.exports = router;

