const express = require('express');
const router = express.Router();
const { handleLogin, handleLogout, checkAuth } = require('../middleware/auth');

// Login endpoint
router.post('/', handleLogin);

// Logout endpoint  
router.post('/logout', handleLogout);

// Check auth status
router.get('/status', checkAuth);

module.exports = router;

