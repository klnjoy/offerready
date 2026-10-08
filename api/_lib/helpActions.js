/**
 * helpActions.js — deterministic "take me there" buttons for the help bot.
 *
 * Maps the user's question (and, secondarily, the model's answer) to product
 * screens in the OfferReady app with plain keyword rules. No model call, so the
 * buttons are cheap, predictable and can never point at a route that doesn't
 * exist. Question matches win over answer matches (the answer often mentions
 * several features in passing).
 *
 * Output: [{ label, route }] — at most MAX_ACTIONS, de-duplicated by route.
 */

'use strict';

const MAX_ACTIONS = 2;

// Order matters inside each text: earlier rules win ties.
const RULES = [
  { route: '/simulator', label: 'Start a mock interview', re: /\b(mock|simulat\w*)/ },
  { route: '/defend', label: 'Defend a scenario', re: /\b(scenarios?|defend\w*|trade[- ]?offs?)\b/ },
  { route: '/fit', label: 'Check my fit', re: /\b(resumes?|résumé|cv|fit|match(es|ing)?|match score|gap analysis)\b/ },
  { route: '/analyze', label: 'Analyze a job', re: /\b(analy[sz]e|analy[sz]ing|analysis|job descriptions?|jds?|job posts?|job postings?)\b/ },
  { route: '/questions', label: 'Get tailored questions', re: /\b(interview questions|tailored questions|practice questions|questions for (this|my) (job|role)|generate questions)\b/ },
  { route: '/practice', label: 'Open practice', re: /\b(practi[cs]e|practi[cs]ing|flashcards?|drills?|question bank|questions?)\b/ },
  { route: '/dashboard', label: 'View my readiness', re: /\b(readiness|ready|score|scores|progress|dashboard)\b/ },
  { route: '/jobs', label: 'Open my jobs', re: /\b(my jobs|saved jobs?|job list)\b/ },
  { route: '/account', label: 'See plans', re: /\b(pricing|price|upgrade|pro|plans?|subscription|billing|free tier|paid)\b/ },
];

const ROUTES = new Set(RULES.map((r) => r.route));

function matchRules(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return [];
  // Collect each rule's first match position, then order by rule priority.
  return RULES.filter((r) => r.re.test(t));
}

/**
 * suggestActions(question, answer, opts?)
 *   opts.currentPath — the app route the user is on; that route is skipped.
 */
function suggestActions(question, answer, opts) {
  const current = opts && typeof opts.currentPath === 'string' ? opts.currentPath.replace(/\/+$/, '') || '/' : '';
  const out = [];
  const seen = new Set();
  const add = (r) => {
    if (out.length >= MAX_ACTIONS || seen.has(r.route) || r.route === current) return;
    seen.add(r.route);
    out.push({ label: r.label, route: r.route });
  };
  matchRules(question).forEach(add);
  matchRules(answer).forEach(add);
  return out;
}

module.exports = { suggestActions, MAX_ACTIONS, ROUTES };
