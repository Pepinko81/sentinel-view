const express = require('express');
const router = express.Router();
const axios = require('axios');
const servers = require('../services/servers');
const f2b = require('../services/f2b');
const { generateSignature } = require('../utils/hmac');

/**
 * GET /api/servers
 * Get all connected servers
 */
router.get('/', async (req, res, next) => {
  try {
    const serverList = servers.getAllServers();
    
    res.json({
      success: true,
      servers: serverList,
      count: serverList.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/servers/:id
 * Get server details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const serverId = req.params.id;
    const server = servers.getServerById(serverId);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }
    
    res.json({
      success: true,
      server: server,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/servers/:id/unban
 * Unban IP on remote server (forwards to agent via action)
 */
router.post('/:id/unban', async (req, res, next) => {
  try {
    const serverId = req.params.id;
    const { jail, ip } = req.body;
    
    if (!jail || !ip) {
      return res.status(400).json({
        success: false,
        error: 'Jail and IP are required',
      });
    }
    
    // Check if server exists
    const server = servers.getServerById(serverId);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }
    
    // If server is local or no remoteUrl, reject (HQ should not execute remote actions)
    if (serverId === 'local' || !server.remoteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Local server actions should use /api/bans/unban endpoint',
      });
    }
    
    // Remote unban - forward to agent
    try {
      const secret = servers.getServerSecret(serverId);
      if (!secret) {
        return res.status(500).json({
          success: false,
          error: 'Server secret not found',
        });
      }
      
      const payload = {
        action: 'unban',
        params: { jail, ip },
      };
      
      const signature = generateSignature(secret, payload);
      
      const response = await axios.post(
        `${server.remoteUrl}/api/action`,
        payload,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'x-signature': signature,
          },
        }
      );
      
      if (response.data && response.data.ok) {
        return res.json({
          success: true,
          jail: jail,
          ip: ip,
          message: response.data.result || 'IP unbanned successfully',
        });
      } else {
        return res.status(500).json({
          success: false,
          error: response.data?.error || 'Remote action failed',
        });
      }
    } catch (err) {
      console.error('[SERVERS] Remote unban failed:', err.message);
      return res.status(500).json({
        success: false,
        error: err.response?.data?.error || err.message || 'Failed to connect to remote agent',
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/servers/:id/action
 * Execute action on remote server (start|stop|restart jail or restart_fail2ban)
 */
router.post('/:id/action', async (req, res, next) => {
  try {
    const serverId = req.params.id;
    let { action, jailName } = req.body;
    
    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required',
      });
    }
    
    // Check if server exists
    const server = servers.getServerById(serverId);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }
    
    // Handle restart_fail2ban (no jailName required)
    if (action === 'restart_fail2ban') {
      // If server is local or no remoteUrl, reject (HQ should not execute remote actions)
      if (serverId === 'local' || !server.remoteUrl) {
        return res.status(400).json({
          success: false,
          error: 'Local server actions should use /api/system/restart endpoint',
        });
      }
      
      // Remote restart - forward to agent
      try {
        const secret = servers.getServerSecret(serverId);
        if (!secret) {
          return res.status(500).json({
            success: false,
            error: 'Server secret not found',
          });
        }
        
        const payload = {
          action: 'restart_fail2ban',
          params: {},
        };
        
        const signature = generateSignature(secret, payload);
        
        const response = await axios.post(
          `${server.remoteUrl}/api/action`,
          payload,
          {
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json',
              'x-signature': signature,
            },
          }
        );
        
        if (response.data && response.data.ok) {
          return res.json({
            success: true,
            action: action,
            message: response.data.result || 'Fail2ban restarted successfully',
          });
        } else {
          return res.status(500).json({
            success: false,
            error: response.data?.error || 'Remote action failed',
          });
        }
      } catch (err) {
        console.error('[SERVERS] Remote restart failed:', err.message);
        return res.status(500).json({
          success: false,
          error: err.response?.data?.error || err.message || 'Failed to connect to remote agent',
        });
      }
    }
    
    // Handle jail actions (start, stop, restart)
    if (!jailName) {
      return res.status(400).json({
        success: false,
        error: 'jailName is required for this action',
      });
    }
    
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action must be start, stop, restart, or restart_fail2ban',
      });
    }
    
    // If server is local or no remoteUrl, reject (HQ should not execute remote actions)
    if (serverId === 'local' || !server.remoteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Local server actions should use /api/jails/:name/start or /api/jails/:name/stop endpoints',
      });
    }
    
    // Remote action - forward to agent
    try {
      const secret = servers.getServerSecret(serverId);
      if (!secret) {
        return res.status(500).json({
          success: false,
          error: 'Server secret not found',
        });
      }
      
      const payload = {
        action: action,
        params: { jail: jailName },
      };
      
      const signature = generateSignature(secret, payload);
      
      const response = await axios.post(
        `${server.remoteUrl}/api/action`,
        payload,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'x-signature': signature,
          },
        }
      );
      
      if (response.data && response.data.ok) {
        return res.json({
          success: true,
          action: action,
          jail: jailName,
          message: response.data.result || 'Action executed successfully',
        });
      } else {
        return res.status(500).json({
          success: false,
          error: response.data?.error || 'Remote action failed',
        });
      }
    } catch (err) {
      console.error('[SERVERS] Remote action failed:', err.message);
      return res.status(500).json({
        success: false,
        error: err.response?.data?.error || err.message || 'Failed to connect to remote agent',
      });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;

