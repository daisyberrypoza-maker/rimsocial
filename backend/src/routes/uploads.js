const router = require('express').Router();
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const sessions = require('../services/uploadSessions');

// Start a chunked upload: returns the upload id and the part size (1 MB)
router.post('/init', requireAuth, async (req, res, next) => {
  try { res.status(201).json(await sessions.startSession(req.user.id, req.body || {})); }
  catch (e) { next(e); }
});

// Which parts the server already has, so an interrupted upload resumes where it stopped
router.get('/:id', requireAuth, async (req, res, next) => {
  try { res.json(await sessions.sessionStatus(req.params.id, req.user.id)); }
  catch (e) { next(e); }
});

// One raw 1 MB part (application/octet-stream body)
router.put('/:id/parts/:index', requireAuth, express.raw({ type: 'application/octet-stream', limit: sessions.CHUNK_BYTES + 1024 }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) throw require('../utils/httpError')(400, 'Send the part as application/octet-stream');
    res.json(await sessions.storePart(req.params.id, req.user.id, req.params.index, req.body));
  } catch (e) { next(e); }
});

// Assemble the parts into the finished file
router.post('/:id/complete', requireAuth, async (req, res, next) => {
  try { res.json(await sessions.completeSession(req.params.id, req.user.id)); }
  catch (e) { next(e); }
});

module.exports = router;
