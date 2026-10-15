---
title: Your data and sync
description: What OfferReady saves on your device and on your account, how syncing between devices works, resume sync, and how to download or delete your data.
---

# Your data and sync

OfferReady saves your work on the device you're using, and syncs most of it
to your account while you're signed in, so you can pick up on any device.

## What is saved where

| What | On this device | On your account (when signed in) |
|---|---|---|
| Saved jobs, their analyses and resume matches | ✓ | ✓ |
| Interview dates and plan progress | ✓ | ✓ |
| Questions for each job and your practice on them | ✓ | ✓ |
| Practice history (question bank, drills, mocks) | ✓ | ✓ |
| STAR stories | ✓ | ✓ |
| Your saved answers | ✓ | ✓ |
| Debriefs and job outcomes | ✓ | ✓ |
| Offers you're comparing | ✓ | ✓ |
| Help assistant chats | ✓ | ✓ |
| **Your resume** | ✓ | **Only if you turn on resume sync** |
| **Tailored resume copies** (one per job) | ✓ | No, this device only |
| **Interview notes** (until you turn them into a debrief) | ✓ | No, this device only |
| **Recent voice sessions** (transcripts) | ✓ | No. Only the score, if you choose **Save to readiness** |

OfferReady **never receives your audio**. Voice interviews use your browser's
speech recognition; depending on the browser, its own speech service may
process the audio (for example Google, in Chrome). Only the text of your
answers is sent to OfferReady, for feedback, and it isn't stored by the API.

## Syncing between devices

Sign in with the same account on each device. Changes sync on their own a
moment after you make them.

To see the sync status, open **Account** and look under **Your data**:

| Status | Means |
|---|---|
| **Synced across your devices** | All good |
| **Syncing…** | Sending your latest changes |
| **Offline: changes will sync when you're back** | You're offline. Your work is saved on this device. |
| **Not synced: couldn't reach your account** | A temporary problem. Your changes are saved here and will retry. Choose **Try again**. |
| **Sync is paused on this device** | Choose **Turn sync back on**. Sync pauses after **Delete my data**. |
| **Saved on this device only (sign in to sync)** | You're signed out |

If you change the same thing on two devices, the most recent change wins.
Lists like stories and debriefs are merged, so nothing you added is lost.

## Resume sync

Your resume stays on the device you added it on, unless you turn on resume
sync:

1. Open **Account** → **Your data**.
2. Tick **Also sync my saved resume to my account**.

The resume text is then stored in your account, where only you can read it.
Turning it off deletes the account copy. The copy on this device stays.

When you analyze a job, tailor your resume or run a mock interview, the
resume text is sent with that request only. It isn't kept by the analysis.

## Download your data

**Account** → **Your data** → **Download my data** saves a JSON file
(`offerready-data-<date>.json`) with your saved jobs and their analyses, your
synced preparation data, and everything OfferReady keeps in this browser.

## Delete your data

**Account** → **Your data** → **Delete my data…**, then type **DELETE** to
confirm. It permanently deletes:

- your saved jobs, with their analyses, matches, questions, practice results
  and readiness history (when signed in);
- your synced data: plan progress, interview dates, stories, debriefs,
  offers, practice history, help chats and your synced resume (when signed
  in);
- everything OfferReady keeps in this browser, including your saved resume
  and recent voice sessions.

It doesn't delete your sign-in account, cancel a pass or reset this month's
usage. Afterwards sync stays paused on this device. If you're signed in on
other devices, delete there too, or their copies will sync back.

To delete your account entirely, [contact us](../Contact/index.md) from the
email you signed up with.

More detail: [Security and your data](../Security/index.md) and
[Privacy](../Privacy/index.md).

## Common questions

??? question "My progress isn't on my other device"
    Check you're signed in to the same account on both devices, then open
    **Account** → **Your data** on each one and check the sync status. Your
    resume only moves between devices with resume sync turned on. Interview
    notes stay on the device you typed them on.

??? question "I cleared my browser data. Is my work gone?"
    Not if you were signed in: sign in again and your synced data comes back.
    Things kept only on the device, like interview notes, recent voice
    sessions and an unsynced resume, are gone.

??? question "Do you sell my data or show ads?"
    No. There are no ads and no third-party trackers. Payments go through
    Stripe. See [Security and your data](../Security/index.md).

??? question "Is my resume used to train AI models?"
    The text needed for an AI request is sent to OpenAI's API, which doesn't
    use API data to train its models by default, and our API doesn't write
    your resume, answers or transcripts to its logs. Details in
    [Security and your data](../Security/index.md).

**Next:** [Get the app](get-the-app.md)
