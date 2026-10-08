# Candid Owner Console

The owner console connects directly to the same Firestore database used by the Candid main app. Its local Node server uses Firebase Admin, so it reads and writes the same stories, reports, comments, companies, profiles, site settings, private conversations, and support messages. It does not need a separate owner API key or a separate database.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the service-account JSON for the same Firebase project as the Candid main app.
4. Run `npm install`, then `npm run dev`.
5. Open `http://127.0.0.1:4174` to use the console directly.

Vite serves the console on `127.0.0.1:4174` and proxies `/api/owner` to the local Node server on `127.0.0.1:4176`. The server binds to loopback and keeps Firebase credentials off the browser.

The service account must have Firestore access to the same project. Keep `.env.local` private. The service account stays on the server and never enters the browser bundle.

## Deploy to Netlify

The repository includes `netlify.toml` and a Netlify Function for the owner API. Netlify publishes the static console and routes `/api/owner/*` to the function, so the deployed frontend does not depend on a developer's local server.

In the **owner console's Netlify site** settings, add these environment variables:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the full service-account JSON for the main app's Firebase project. Scope it to Functions.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`: server-side credentials for securely previewing authenticated employment proof. Scope these to Functions; never add them as `VITE_*` variables.

Before using the deployed console, set its Netlify project visibility to **Private** for both production deploys and previews. In Netlify, open **Project configuration → General → Visitor access → Project visibility** and choose **Private**. This protects the site and its API routes with Netlify access; the app itself still has no sign-in screen. Netlify documents private projects as accessible only to your team and invited people, and on Free/Personal plans only the Team Owner can access them: [Project visibility](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/).

The AI moderation runs in the main app's server environment, so set `OPENROUTER_API_KEY` and the existing Cloudinary server credentials in the **main app's** Netlify site, scoped to server functions. The owner console reads the resulting private `story_ai_reviews` records from the same Firestore project. No AI key is required in the owner app.

## Included workflows

- Dashboard totals for stories, reports, people, companies, comments, salary contributions, and ratings.
- AI review queues: high-risk or uncertain stories, full-story reasoning, proof preview, and automatic low-risk approvals; plus member requests for official company badges. Clear verified-company matches may be approved automatically; all uncertain requests are surfaced for owner approval or decline.
- Billing preparation: inspect every individual or company account's Basic, Premium, or Gold package; change its tier/status and record subscription dates, provider and transaction reference. Premium and Gold automatically include their matching membership badge; Basic does not. Official identity/company verification remains a separate owner-reviewed trust decision. Current package defaults are Basic (free), Premium (KSh 500/month), and Gold (KSh 1,000/month). Owner entries are records only; no charges or payment-provider callbacks are enabled yet.
- Story publication review, comment-thread moderation, and report resolution.
- Member restrictions, company classification and verification, public contact settings, and an audit log.
- AI account decisions and owner verification decisions appear in the account approval history and audit log. Ordinary registration remains open; this workflow reviews requests for an official company badge.
- Private member-message review, replies from the Candid official account, and support chat/ticket handling. Opening message threads and sending replies are recorded in the audit log.
