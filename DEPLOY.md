# Deploying the OfferReady API (Vercel) — "Analyze My Job" MVP

The **frontend** (this MkDocs site) stays on **GitHub Pages** — unchanged.
The **backend** is a single Vercel serverless function in `api/analyze-job.js`.
No AWS required.

```
GitHub Pages (static site)  ──HTTPS──►  Vercel Function /api/analyze-job  ──►  OpenAI API
```

---

## 1. Prerequisites
- A **Vercel** account (free tier is fine): https://vercel.com
- An **OpenAI API key**: https://platform.openai.com/api-keys
- This repo pushed to GitHub (already done).

## 2. Connect the repo to Vercel
1. In Vercel, **Add New → Project**, and **import** the `offerready` GitHub repo.
2. Framework preset: **Other** (there's no build step for the API).
3. **Root Directory:** leave as the repo root — Vercel auto-detects `api/`.
4. Do **not** set an "Output Directory" (the site itself is served by GitHub
   Pages, not Vercel; Vercel only hosts the function).

## 3. Configure environment variables (Vercel → Project → Settings → Environment Variables)
| Name | Required | Example / default |
|------|----------|-------------------|
| `OPENAI_API_KEY` | **Yes** | `sk-…` (server-side only, never in the frontend) |
| `OPENAI_MODEL` | No | `gpt-4o-mini` (default in code if unset) |
| `ALLOWED_ORIGIN` | No | `https://klnjoy.github.io` (CORS; default already this) |

Add them for **Production** (and Preview if you want). Never commit a real key —
`.env` is gitignored; see `.env.example` for the shape.

## 4. Deploy
- Click **Deploy**. Vercel gives you a URL like `https://offerready-api.vercel.app`.
- The endpoint is then `https://<your-vercel-url>/api/analyze-job`.

## 5. Point the frontend at the API
The config file already exists: **`content/assets/api-config.js`** (loaded first,
before `chatbot.js`/`analyze.js`). Just edit one line:

```js
var BASE = "https://<your-vercel-url>";   // paste your Vercel URL, no trailing slash
```

Then commit + push — GitHub Actions republishes Pages. This single change
activates **both** `/api/analyze-job` (Analyze My Job) and `/api/ask` (the
chat widget).

While the value is left as the placeholder, the site stays in a safe
"not enabled yet" state: the Analyze page shows the **labeled Sample Demo**, and
the chat widget shows a friendly message — **no broken calls**.

## 6. Test the API directly
```bash
curl -X POST https://<your-vercel-url>/api/analyze-job \
  -H "Content-Type: application/json" \
  -d '{"jobDescription":"We are hiring an AI engineer to build production RAG and agent systems on AWS Bedrock. Requires Python, AWS, system design, and GenAI experience.","targetRole":"AI Engineer"}'
```
Expected: `200` with `{ "ok": true, "model": "...", "analysis": { ... } }`.

Error checks:
- Missing JD → `400 {"error":"A job description is required."}`
- No `OPENAI_API_KEY` set → `503 {"demo":true,...}` (frontend shows the sample)
- Oversized input → `413`

## 7. How the GitHub Pages frontend calls it
`content/assets/analyze.js` (mounted on the **Analyze My Job** page) POSTs the
form to `OFFERREADY_API_BASE + "/api/analyze-job"`, shows progress states, then
renders the structured result and maps skills to existing OfferReady pages.

## 8. Run tests locally
```bash
node --test api/__tests__/analyze.test.js
```
(No `npm install` needed — uses Node's built-in test runner. Node ≥ 18.)

---

## Notes & limits
- **One LLM call per request**; input is length-capped (see `api/lib/validate.js`).
- **No storage**: the JD/resume are processed for the request and not persisted;
  full JD/resume are never logged. See the site's **Privacy** page.
- **CORS** is restricted to `ALLOWED_ORIGIN`.
- The model is configurable via `OPENAI_MODEL` — no code change to switch.
- Cost control: keep inputs reasonable; consider a Vercel spend limit / OpenAI
  usage cap while validating the MVP.
