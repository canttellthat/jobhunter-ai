# JobHunter AI — Vercel-ready starter

Features: public Greenhouse job-board search, keyword/location filters, AI-tailored résumé and cover-letter drafts, and local application tracking. The AI API key stays server-side. The app never auto-submits applications or bypasses CAPTCHA.

## Deploy to Vercel
1. Upload this project to a new GitHub repository (do not upload `.env.local` or API keys).
2. Import the repository at https://vercel.com/; choose Next.js.
3. In Vercel → Project Settings → Environment Variables add `OPENAI_API_KEY` (secret) and optionally `OPENAI_MODEL` = `gpt-4o-mini`.
4. Deploy and open the assigned URL. Redeploy after changing environment variables.

## Run locally
Install Node.js LTS, run `npm install`, copy `.env.example` to `.env.local`, add your key, then `npm run dev` and open http://localhost:3000.

## Important
- OpenAI API usage may cost money; configure spending alerts/limits.
- Profile and tracker are stored in browser localStorage; they are not synced across devices or accounts.
- Profile and job description are sent to the AI API only when generating documents.
- Some Greenhouse board tokens may not work or may change. Edit tokens in the UI.
- US-location matching is heuristic. Verify the original employer posting and sponsorship policy.
- Public launch needs rate limiting, abuse protection, privacy terms, and stronger production hardening before broad use.
