---
icon: material/shield-account
---

# Privacy & Data Handling

Straight answers about what OfferReady does and doesn't do with your data. We'd
rather be plainly honest than make security claims the setup can't back up.

## The short version

OfferReady is a **static website** (documentation and interactive study tools)
served from GitHub Pages. It has **no accounts, no server-side database, and no
upload of resumes or job descriptions.** There is nothing for us to collect,
because the site can't receive your data in the first place.

## What you provide, and where it goes

| You do this | Where it goes | Stored where |
|-------------|---------------|--------------|
| Read pages / browse | Nowhere — plain page views | Not stored by us |
| Type answers in **Practice** or **"Keep Asking Why"** | Stays **in your browser** | Your browser's `localStorage` only |
| Your practice scores / progress | Stays **in your browser** | Your browser's `localStorage` only |

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
data, with a clear description of what is stored and why. Until then, nothing on
this site stores your data off your device.

## Third-party links

OfferReady is self-contained and does not link out to external sites. Source
names in study material are shown as **plain text** for attribution, not as
outbound links.

---

*This page describes the current static build honestly. It is a plain-language
data-handling summary, not a formal legal privacy policy; a full policy would be
added before any paid, account-based service goes live.*
