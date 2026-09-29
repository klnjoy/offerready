# OfferReady — Product North Star (steering)

This steers every change to the OfferReady site. When a request conflicts with
this doc, surface the conflict rather than silently diverging.

## What OfferReady is

A **personalized interview-preparation system built around a real job**, not an
AI chatbot and not a documentation library. The product is the loop:

```
REAL JOB → UNDERSTAND → IDENTIFY GAPS → LEARN → PRACTICE → DEFEND → MOCK INTERVIEW → IMPROVE → REPEAT
```

Positioning: **"Turn any job description into a personalized interview
preparation plan."** Primary CTA: *Analyze My Job*.

The existing learning content is the **supporting knowledge layer**, reached
*from* a job workflow ("You need RAG for this job → Study / Practice / Defend").
It is not the homepage experience.

## Core value (in priority order)

1. **Analyze a real job** → role understanding + skill map + gap analysis.
2. **Defend Your Decision** scenarios — the paid differentiator; teach defending
   engineering decisions under follow-up pressure, not memorizing answers.
3. Practice engine, Mock Interview, Progress/Readiness tracking.

## Hard rules (do not violate)

- **No employment-outcome promises.** No "guaranteed offer", no "X% chance of
  getting hired". Feedback is an *"Interview Practice Assessment"*, AI-generated.
- **Backend enforces entitlements**, never the frontend. A user must not bypass
  Free/Pro limits by editing client JS. Access = server-side entitlement check.
- **No secrets in the frontend or git.** All AI/premium calls go through the
  backend. API keys live in server env vars only.
- **Never fabricate user experience.** If the resume lacks evidence, say
  "Insufficient information to assess" — do not assert the user lacks a skill.
- **Label AI output as AI-generated** (role analysis, assessment).
- **Treat resumes + job descriptions as sensitive data.** Per-user isolation
  (RLS), deletion support, clear privacy copy. No "enterprise-grade security"
  claims beyond what's implemented.
- **Do not scrape arbitrary job URLs** without regard to terms/robots.
- **Build incrementally; preserve existing valuable content.** Don't rewrite the
  site wholesale. Don't add new learning modules until the core loop is
  excellent.
- No fake testimonials / user counts / logos / success rates. No buzzword
  overload, excessive gradients, or gratuitous animation.

## Freemium (start with Free + Pro only)

- **Free**: 1 job analysis, basic skill extraction + gap analysis, limited
  practice, limited progress. Must be genuinely useful (demonstrates value).
- **Pro**: multiple/unlimited job analyses, resume comparison, prep plans,
  unlimited practice + defense scenarios, mock interviews, detailed feedback,
  saved jobs, advanced analysis.
- Premium/power-user tier is a *later* option. Do not launch many plans at once.

## AI architecture

Provider-abstracted (OpenAI / Bedrock / future) behind a server-side interface,
switchable by config. Every AI op handles timeout, rate limit, invalid/empty
response, provider/network failure with **actionable** messages (never a bare
"Something went wrong") and saves user work where possible.

## MVP definition (the bar for "done")

The full journey must work reliably end to end:
`sign up → paste real JD → analyze → skill requirements → personalized gaps →
prep plan → practice → complete a Defense scenario → mock interview → feedback →
save progress.` Output must **meaningfully differ by job** (AI Engineer vs
Solutions Architect vs FDE produce different requirements/plans/questions).

## Current build status (keep updated)

Built: Analyze My Job, Defend-Your-Decision scenario engine (7 scenarios),
Practice mode, Keep-Asking-Why, Master Simulator, Progress; Supabase auth +
schema + RLS (verified); entitlement-gated premium API; Practice front-door.
Backend host = Vercel serverless (`api/`). DB = Supabase. Site = MkDocs on
GitHub Pages (`https://klnjoy.github.io/offerready/`).

Not yet done: saved-jobs / "My Jobs" dashboard; server-side Free/Pro limit
enforcement on Analyze + Practice; Stripe; onboarding + first-value moment;
homepage/landing redesign to the clean SaaS structure; mobile nav; structured
mock-interview feedback UI.

## Working order (don't jump ahead)

1. Verify auth → entitlement → gated content end to end (in progress).
2. Saved jobs / My Jobs dashboard (persist Analyze results per user).
3. Server-side Free/Pro limit enforcement on Analyze + Practice.
4. Homepage/landing + onboarding + first-value polish; mobile nav.
5. Stripe subscriptions (last).
