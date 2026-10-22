/**
 * api/lib/http.js — shared CORS + JSON helpers (Phase 3).
 * Mirrors the exact-origin CORS logic used by analyze-job.js / ask.js so all
 * endpoints behave identically. Adds Authorization to allowed headers because
 * premium endpoints require a Bearer token.
 */

'use strict';

function getAllowedOrigins() {
  return [...new Set((process.env.ALLOWED_ORIGIN || 'https://klnjoy.github.io')
    .split(',')
    .map(value => value.trim().replace(/\/+$/, ''))
    .filter(Boolean))];
}

function getDefaultOrigin() {
  return getAllowedOrigins()[0] || 'https://klnjoy.github.io';
}

/**
 * Path the product app is mounted at on `origin`, for Stripe return URLs.
 * GitHub Pages serves it under /offerready-app (or APP_BASE_PATH); a custom
 * domain such as https://getofferready.app serves it at the root.
 */
function appBasePath(origin) {
  let host = '';
  try { host = new URL(String(origin || '')).hostname; } catch (e) { host = ''; }
  if (host.endsWith('github.io')) return (process.env.APP_BASE_PATH || '/offerready-app').replace(/\/+$/, '');
  return '';
}

function setCors(res, origin) {
  const allowed = getAllowedOrigins();
  const reqOrigin = (origin || '').replace(/\/+$/, '');
  const value = reqOrigin && allowed.includes(reqOrigin) ? origin : getDefaultOrigin();
  res.setHeader('Access-Control-Allow-Origin', value);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

module.exports = { setCors, send, getDefaultOrigin, appBasePath };
