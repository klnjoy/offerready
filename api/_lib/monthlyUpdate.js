/**
 * The monthly update email ("What's new in OfferReady").
 * ---------------------------------------------------------------------------
 * One update per month. It goes out only when `month` is the current UTC
 * month (YYYY-MM) and `ready` is true, so a draft sitting in this file never
 * sends. Each person gets each month's update at most once (email_sends kind
 * 'monthly:<month>'), only if they confirmed their email at least a week ago
 * and haven't unsubscribed. Write only things that have actually shipped:
 * no made-up numbers, quotes or deadlines.
 *
 * To send next month's update: replace the content, set month and ready: true,
 * and merge. The daily email run then sends it, within the daily cap.
 */

'use strict';

module.exports = {
  month: '2026-11',
  ready: false,
  subject: 'What’s new in OfferReady: try a job before signing up, and next steps for each gap',
  preheader: 'What changed in October, and one thing to try this week.',
  intro: 'Here’s what changed in OfferReady in October. It’s all live now.',
  items: [
    {
      title: 'See what a job needs before you sign up',
      text: 'Paste a job post and see your first analysis before you create an account. Sign in when you want to keep it, and it’s saved as is.',
      path: '/analyze',
      cta: 'Analyze a job',
    },
    {
      title: 'A next step for every gap',
      text: 'When Job fit shows something you’re missing, “What you can do” now links straight to the matching practice questions, a Coach question about it, and tailoring your resume for that job.',
      path: '/jobs',
      cta: 'Open your jobs',
    },
    {
      title: 'A daily question on your home screen',
      text: 'One practice question a day, with your streak, on your home and job pages. Answer it in a couple of minutes.',
      path: '/',
      cta: 'Open OfferReady',
    },
  ],
  tip: 'Tip for this week: pick one gap from your job and answer one question about it out loud. Then ask for feedback on that answer.',
};
