---
title: Security and your data
description: How OfferReady protects your resume, answers and account, in plain words.
icon: material/shield-lock-outline
---

# Security and your data

Your resume and interview answers are personal. This page lists what
OfferReady actually does to protect them. Every point here is something you
can check. Full details are in the [Privacy Policy](../Privacy/index.md).

## What we do

| | |
|---|---|
| **Encrypted connections** | The app, the study library and the API are served only over HTTPS. |
| **Only you can read your data** | Every account table in our database has row-level security: each signed-in user can read and change only their own rows. |
| **Your resume stays on your device by default** | Resume sync is off unless you turn it on. When it's off, your resume is sent only with the request that needs it and isn't stored on our servers. |
| **AI requests aren't stored** | Our API sends the text needed for each AI request to OpenAI and doesn't write your resume, answers or transcripts to its logs. Data sent through OpenAI's API isn't used to train its models by default. |
| **Your voice stays out of our servers** | Voice mock interviews use your browser's speech recognition. We never receive your audio. |
| **We never see your card** | Payments go through Stripe's checkout. We don't receive or store your full card number. |
| **No ads, no trackers** | There's no advertising, no third-party analytics and no tracking pixels. We don't sell your data. |
| **Protection against hidden instructions** | Job posts and answers you paste are passed to the AI as data, with protections against instructions hidden inside them. Scores need evidence quoted from your answer, and resume quotes are checked against your real text. |
| **Rate limits** | The API limits how often each account and address can make requests, to prevent abuse. |

## What you control

- **Download your data:** Account → Your data → **Download my data**.
- **Delete your data:** Account → Your data → **Delete my data**.
- **Pause sync** on any device from the Account page.
- **Shared interview questions** are opt-in for each debrief. A company's questions
  appear only after at least 3 different people have shared for it, and
  never with your name.

## Certifications

OfferReady is a small, early-stage product and does **not** yet hold formal
certifications such as SOC 2. We'll list a certification here only once it
has actually been issued.

## Report a problem

Found a security issue? Please tell us privately through the
[Contact](../Contact/index.md) page and don't share details publicly until it's
fixed. We'll reply and keep you updated.
