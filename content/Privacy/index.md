---
icon: material/shield-account
---

# Privacy Policy

*Last updated:* October 2026

!!! note "Plain-English summary, not legal advice"
    This page describes, in plain English, what OfferReady collects, why, and
    what you can do about it. It is not legal advice. Items marked
    **[Owner to confirm: …]** still need a decision from the business owner
    before launch.

## Who we are

OfferReady is an interview-preparation service: the OfferReady app
(`klnjoy.github.io/offerready-app`), this study library, and the OfferReady API
that powers the app. In this policy "OfferReady", "we" and "us" means
**[Owner to confirm: legal name of the business entity and its registered
address]**, which is responsible for your data.

Questions or requests about your data: see [Contact](../Contact/index.md).

## The short version

- You can read the study library without an account. Nothing you read is
  tracked by us.
- If you create an account, we store your **email address**, the **jobs** you
  save with their **analyses**, your **practice scores** and **usage counts**,
  and, if you turn it on, your **synced preparation data**.
- Text you send for AI features (job descriptions, resumes, answers,
  transcripts, questions) is processed by **OpenAI** to produce your result.
- Payments are handled by **Stripe**. We never see or store your full card
  number.
- We do not sell your data, and we do not use it for advertising.
- You can **download** your data and **delete** it from the Account page at any
  time.

## What we collect and why

| What | When | Why | Where it's kept |
|------|------|-----|-----------------|
| **Account email** (and sign-in details from Google or GitHub if you use them) | When you sign up | To sign you in and contact you about your account or billing | Supabase (our database and sign-in provider) |
| **Jobs and analyses**: the job title, description and the analysis we generate (skills, gaps, plan), plus resume-match scores, generated questions and readiness history for that job | When you save a job, run a resume match or practise against a job | So your plan and readiness follow you between visits and devices | Supabase, until you delete the job or your data |
| **Practice results**: scores, categories and dates of practice sessions you count toward a job | When you finish a drill or "Save to readiness" | To calculate readiness | Supabase |
| **Usage counts**: how many times you used each metered feature this month | When you use a metered feature (for example an analysis or a voice mock) | To apply plan limits fairly | Supabase |
| **Synced preparation data**: your plan progress, interview dates, STAR stories, interview debriefs, offers you're comparing, practice history and scores, help-chat conversations, and which job you're working on | While you are signed in. Sync is on by default and can be paused on each device from the Account page. | So the same preparation shows up on every device you sign in on | Supabase, until you delete it |
| **Your resume text** | Only if you turn on **resume sync** (off by default) | So you don't have to add your resume again on another device | Supabase, until you turn sync off and delete it, or delete your data. With resume sync off, your resume stays in your browser only. |
| **Billing details**: your Stripe customer id, plan, renewal and expiry dates | When you buy Pro or a Sprint pass | To give you the features you paid for | Supabase (status only) and Stripe (payment details) |
| **Error reports**: the page path (no query string), the error message and technical trace, your browser's user-agent, the app version, and your account id if you're signed in | When something breaks in the app | To find and fix bugs | Supabase. Before sending, the app removes query strings and anything that looks like an email address or a token, and sends at most 10 reports per visit. **[Owner to confirm: retention period for error reports, e.g. 90 days]** |
| **Product usage events**: which app pages you open and when you finish key steps (adding a job, practising a question, finishing a drill or mock, starting checkout), with a random browser id, a random visit id, the app version and your account id if you're signed in. Never the content: no job descriptions, resumes, answers or emails. | While you use the app, unless your browser sends "Do Not Track" | To see which steps people use and where they get stuck, so we fix the right things | Supabase, first-party only. At most 200 events per visit. |
| **Feedback you send**: your message, the optional 1-5 rating, the page you sent it from, the app version, your browser's user-agent, your account id if you're signed in, and whether we may email you about it | When you use **Send feedback** | To improve OfferReady and, if you ticked the box, to reply | Supabase |

### Data that stays on your device

The app saves its working data in your browser's local storage so you can
pick up where you left off. Some of it stays **only** on your device and is
never synced: your saved resume (unless you turn on resume sync), recent
voice-mock sessions with their transcripts, the last job analysis you ran, and
your preferences. The preparation data listed above is also kept locally, and
is copied to your account while you're signed in. Clearing your browser data,
or using **Delete my data**, removes it from that browser.

## AI processing

OfferReady uses **OpenAI** as a sub-processor to generate job analyses, resume
matches, interview questions, answer feedback, resume tailoring suggestions,
help-chat answers and the voice interviewer's follow-ups.

- Only the text needed for the request is sent (for example the job
  description and, if you include it, your resume).
- Our API does not store the text it sends to OpenAI, except where you save the
  result (for example a saved job keeps its description and analysis), and it
  does not write the content of your resume, answers or transcripts to its
  logs.
- OpenAI processes the text under its API terms. Under those terms, data sent
  through the API is not used to train OpenAI's models by default, and OpenAI
  may keep it for a limited period for abuse monitoring.
  **[Owner to confirm: OpenAI data-processing agreement in place, and whether
  zero data retention applies]**
- AI output can be wrong. See the [Disclaimer](../Disclaimer/index.md).

## Voice mock interviews

- **Speech recognition runs in your browser.** The app uses your browser's
  built-in speech recognition. Depending on the browser, your audio may be sent
  to the browser vendor's speech service (for example Google, in Chrome) to be
  turned into text. That happens under the browser vendor's privacy terms; we
  never receive your audio.
- **Transcripts are sent to our API for feedback.** The text of each answer is
  sent to the OfferReady API and on to OpenAI to produce the interviewer's
  follow-up and your feedback. The API does not store transcripts.
- **What is kept.** Your recent sessions (questions, transcripts and feedback)
  are saved in your browser only, so you can review them. They are not synced
  to your account. **Save to readiness** sends only the session's score and
  type to your account, not the transcript.

## Payments

Payments are processed by **Stripe**. When you subscribe or buy a Sprint pass,
you enter your card details on Stripe's checkout page, not on OfferReady.
Stripe tells us whether the payment succeeded, your plan and its renewal or
expiry date. We do not receive or store your full card number. Stripe's own
privacy policy applies to the data it handles.

## Service providers

We rely on these providers to run OfferReady. Each only receives the data it
needs for its part of the service.

| Provider | What it does |
|----------|--------------|
| Supabase | Database and sign-in |
| Vercel | Hosts the OfferReady API |
| GitHub Pages | Hosts the app and this study library |
| OpenAI | AI processing (see above) |
| Stripe | Payments and the billing portal |
| Google / GitHub | Sign-in, only if you choose "Continue with Google/GitHub" |
| Google Fonts | Serves the app's font (your browser requests it from Google) |
| Your browser vendor | Speech recognition in voice mock interviews |

When you import a job from a link, our API fetches that posting from the job
board (for example Greenhouse, Lever or Ashby). The job board sees a request
from our server, not from you.

## Cookies, analytics and tracking

- No advertising, no third-party analytics and no tracking pixels.
- We record a small set of first-party usage events (see the table above) in
  our own database. They use a random id kept in your browser's local storage,
  not a cookie, and are never shared with anyone. If your browser sends "Do
  Not Track", the app sends no usage events.
- The app keeps your sign-in session and preferences in your browser's local
  storage. These are needed for the app to work.
- Hosting providers (GitHub, Vercel) may keep standard server logs, such as IP
  addresses, as part of serving any website.

## How long we keep data

- Account data and saved preparation data: until you delete it or ask us to
  delete your account.
- Billing records: as long as the law requires us to keep them, even after you
  delete your account. **[Owner to confirm: billing record retention period]**
- Error reports: **[Owner to confirm: retention period, e.g. 90 days]**
- Usage events: **[Owner to confirm: retention period, e.g. 12 months]**
- Feedback: until it has been dealt with, or until you ask us to delete it.

## Your choices and rights

- **Download your data.** Account → Your data → **Download my data** gives you
  a JSON file with your saved jobs and their analyses, the preparation data
  synced to your account, and the OfferReady data in that browser.
- **Delete your data.** Account → Your data → **Delete my data** deletes your
  saved jobs (with their analyses, questions and readiness history), your synced
  preparation data and synced resume, and everything OfferReady keeps in that
  browser. It does not delete your sign-in account or billing records.
- **Delete your account.** To delete your account entirely, email
  **[support email]** from the address you signed up with, or see the
  [Contact](../Contact/index.md) page. **[Owner to confirm: response time for
  account deletion requests, e.g. within 30 days]**
- **Cancel billing.** Use **Manage billing** on the Account page. Deleting your
  data does not cancel a subscription.
- Depending on where you live, you may have further rights (for example to
  access, correct or object to processing of your data, or to complain to a
  data-protection authority). Contact us to use them.
  **[Owner to confirm: applicable privacy laws (e.g. GDPR/UK GDPR, CCPA),
  international transfer safeguards, and whether a representative or DPO is
  required]**

## Children

OfferReady is meant for adults preparing for job interviews. It is not
directed at children under 16, and we do not knowingly collect their data.
**[Owner to confirm: minimum age]**

## Security

Data is sent over HTTPS. Database access is limited by row-level security so
that each account can only read its own rows; server-side keys never reach the
browser. No system is perfectly secure, so please use a strong, unique
password.

## Changes to this policy

If we change this policy in a way that matters, we will update the date above
and, for significant changes, tell signed-in users in the app or by email.

## Related

- [Terms of Service](../Terms/index.md)
- [Disclaimer](../Disclaimer/index.md)
- [Contact](../Contact/index.md)
