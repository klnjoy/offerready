---
icon: material/shield-account
---

# Privacy & Data Handling

Straight answers about what OfferReady does and doesn't do with your data. We'd
rather be plainly honest than make security claims the setup can't back up.

## The short version

OfferReady is a **static website** (documentation and interactive study tools)
served from GitHub Pages, with **no accounts and no database.** Most of the site
never sends your data anywhere. The **one exception** is the optional
**"Analyze My Job"** feature — if you use it, the job description (and resume, if
you paste one) is sent to our analysis API and an AI provider to produce your
result, then **discarded** (not stored). Details below.

## "Analyze My Job" — what happens to your input

When (and only when) you submit the **Analyze My Job** form:

- Your **job description** and, if you paste it, your **resume** are sent over
  HTTPS to the OfferReady analysis API (a serverless function) and from there to
  an **AI model provider (OpenAI)** to generate the analysis.
- The result is returned to your browser. **Your input is not stored** in a
  database or file by OfferReady — it's processed for that single request and
  discarded.
- We **do not log the full job description or resume.** Only non-content
  diagnostics (e.g. an error status code) may be logged.
- The AI provider processes the text to generate the response under its own API
  terms. **OpenAI's API does not use API inputs to train its models by default.**
- If the feature isn't configured on a given deployment, the page shows a
  clearly-labeled **sample** instead — nothing is sent anywhere.

We do **not** claim "zero data retention" end-to-end, because the request
transits a third-party AI provider. What we can say accurately: **OfferReady
itself does not persist your input**, and does not log its contents.

## What you provide, and where it goes

| You do this | Where it goes | Stored where |
|-------------|---------------|--------------|
| Read pages / browse | Nowhere — plain page views | Not stored by us |
| Type answers in **Practice** or **"Keep Asking Why"** | Stays **in your browser** | Your browser's `localStorage` only |
| Your practice scores / progress | Stays **in your browser** | Your browser's `localStorage` only |
| Submit **Analyze My Job** | Sent to our API + AI provider, then discarded | **Not stored**; contents not logged |

Your practice answers and progress are saved **locally in your own browser**
(via `localStorage`) so the site can show your history and pick up where you left
off. That data **never leaves your device** and is **not transmitted to us or
anyone else.** Clear your browser storage and it's gone.

## Optional local AI grading

The interactive practice includes an optional **AI grading** button. On the
public site it is **not connected to any server** — it degrades gracefully to
self-scoring. It only works if *you* run the bundled grading agent **on your own
machine**, in which case your answer is sent to **your local process only**
(`localhost`), never to us or a third party.

## Analytics & cookies

- **No analytics or tracking** is built into the site.
- **No advertising cookies.**
- GitHub Pages (the host) may collect standard server request logs (e.g. IP
  address) as part of serving any website; that's GitHub's infrastructure, not
  something OfferReady adds or controls.

## When Pro launches

Paid features (AI grading, progress sync across devices, personalized plans) are
**not live yet** and would require accounts and a hosted service. If and when
that launches, this page will be updated **before** any such feature collects
data, with a clear description of what is stored and why. Aside from the
"Analyze My Job" request flow described above, nothing on this site stores your
data off your device.

## Third-party links

OfferReady is self-contained and does not link out to external sites. Source
names in study material are shown as **plain text** for attribution, not as
outbound links.

---

*This page describes the current static build honestly. It is a plain-language
data-handling summary, not a formal legal privacy policy; a full policy would be
added before any paid, account-based service goes live.*
