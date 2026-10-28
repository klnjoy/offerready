---
icon: material/shield-account
---

# Privacy Policy

*Last updated:* October 27, 2026

!!! note "Plain-English summary, not legal advice"
    This page describes, in plain English, what OfferReady collects, why, and
    what you can do about it. It is not legal advice.

## Who we are

OfferReady is an interview-preparation service: the OfferReady app
(`getofferready.app`), this study library, and the OfferReady API
that powers the app. In this policy "OfferReady", "we" and "us" refer to
**OfferReady**, the service operator. Contact us at
**[hello@getofferready.app](mailto:hello@getofferready.app)** with privacy questions or requests.

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
| **Synced preparation data**: your plan progress, interview dates, STAR stories, interview debriefs, offers you're comparing, practice history and scores, help-chat conversations, and which job you're working on | While you are signed in. Sign out on a device to stop it syncing; after **Delete my data**, sync stays paused on that device until you turn it back on. | So the same preparation shows up on every device you sign in on | Supabase, until you delete it |
| **Your resume text** | Only if you turn on **resume sync** (off by default) | So you don't have to add your resume again on another device | Supabase, until you turn sync off and delete it, or delete your data. With resume sync off, your resume stays in your browser only. |
| **Billing details**: your Stripe customer id, plan, and any expiry or renewal dates | When you buy a pass, a mock interview pack, or a subscription if one is offered | To provide the features you paid for | Supabase (status only) and Stripe (payment details) |
| **Error reports**: the page path (no query string), the error message and technical trace, your browser's user-agent, the app version, and your account id if you're signed in | When something breaks in the app | To find and fix bugs | Supabase. Before sending, the app removes query strings and anything that looks like an email address or a token, and sends at most 10 reports per visit. We keep reports only as long as needed to investigate and improve the service, subject to legal requirements. |
| **Product usage events**: which app pages you open and when you finish key steps (adding a job, practising a question, finishing a drill or mock, starting checkout), with a random browser id, a random visit id, the app version and your account id if you're signed in. On the first page of a visit, also where the visit came from: the campaign tags in the link you followed (utm_source, utm_medium, utm_campaign) and the name of the website that linked to us, never the page or search on it. Never the content: no job descriptions, resumes, answers or emails. | While you use the app, unless your browser sends "Do Not Track" | To see which steps people use and where they get stuck, so we fix the right things, and which links and sites bring people to OfferReady | Supabase, first-party only. At most 200 events per visit. |
| **Feedback you send**: your message, the optional 1-5 rating, the page you sent it from, the app version, your browser's user-agent, your account id if you're signed in, and whether we may email you about it | When you use **Send feedback** | To improve OfferReady and, if you ticked the box, to reply | Supabase |
| **Shared interview questions** (opt-in per debrief): the company, role family, level, round type, the month, the questions you logged and how each went, and the round outcome | Only when you tick **Share the questions from this round anonymously** on a debrief | To show which questions each company asks. Other users only ever see questions for a company once at least 3 different people have shared for it, and never who shared them | Supabase, linked to your account so you can un-share or delete it. Never shared: your name, interviewers, notes or the exact date. |
| **Interview results**: the result you report after an interview date (offer, next round, not selected, waiting, didn't happen) with that job's readiness score, practice count and how long you prepared | When you answer **How did it go?**, or log a final outcome in a debrief | To check that readiness scores match real results and improve them | Supabase, visible only to you; deleted with your data |

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
- OpenAI processes the text under its API terms. OpenAI says API data is not
  used to train or improve its models by default. Standard abuse-monitoring
  logs may include prompts and responses and are generally retained for up to
  30 days; retention controls and exceptions depend on the account and feature
  used. OfferReady does not advertise Zero Data Retention. See
  [OpenAI's API data controls](https://developers.openai.com/api/docs/guides/your-data)
  for details.
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

Payments are processed by **Stripe**. When you buy a pass or a mock interview pack,
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
  delete your account, subject to backups and legal requirements.
- Billing records: for as long as needed to provide billing support and meet
  legal, tax and accounting obligations, even after account deletion.
- Error reports and usage events: for as long as needed to operate, secure and
  improve the service, then deleted or de-identified where practical.
- Feedback: until it has been dealt with, or until you ask us to delete it,
  subject to legal requirements.
- Shared interview questions and interview results: until you un-share them,
  delete them from the Account page, or delete your account.

## Your choices and rights

- **Download your data.** Account → Your data → **Download my data** gives you
  a JSON file with your saved jobs and their analyses, the preparation data
  synced to your account, and the OfferReady data in that browser.
- **Delete your data.** Account → Your data → **Delete my data** deletes your
  saved jobs (with their analyses, questions and readiness history), your synced
  preparation data and synced resume, and everything OfferReady keeps in that
  browser. It does not delete your sign-in account or billing records.
- **Delete your account.** To delete your account entirely, email
  **[hello@getofferready.app](mailto:hello@getofferready.app)** from the address you signed up with, or see the
  [Contact](../Contact/index.md) page. We may ask for information to verify
  your request and will process it as required by applicable law.
- **Cancel billing.** If you have an active subscription, cancel it through
  **Manage billing** on the Account page. Deleting your data does not cancel
  an active subscription.
- Depending on where you live, you may have further rights (for example to
  access, correct or object to processing of your data, or to complain to a
  data-protection authority). Contact us to use them. Where required, we will
  provide information about international data transfers and applicable
  safeguards in response to a request.

## Children

OfferReady is meant for adults preparing for job interviews. It is not
directed at children under 16, and we do not knowingly collect their data.

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
