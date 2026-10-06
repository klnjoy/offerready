/**
 * api/lib/http.js — shared CORS + JSON helpers (Phase 3).
 * Mirrors the exact-origin CORS logic used by analyze-job.js / ask.js so all
 * endpoints behave identically. Adds Authorization to allowed headers because
 * premium endpoints require a Bearer token.
 */

'use strict';

function setCors(res, origin) {
  const allowed = (process.env.ALLOWED_ORIGIN || 'https://klnjoy.github.io').replace(/\/+$/, '');
  const reqOrigin = (origin || '').replace(/\/+$/, '');
  const value = reqOrigin && reqOrigin === allowed ? origin : allowed;
  res.setHeader('Access-Control-Allow-Origin', value);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

module.exports = { setCors, send };
