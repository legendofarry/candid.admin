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
The console opens without a sign-in screen. Every owner API endpoint is also unauthenticated, so anyone who can reach the Netlify URL can read and change the connected app's data. Keep the Netlify site private and share its URL only with trusted people. Keep the Firebase service-account JSON out of `VITE_*` variables and browser code.

## Included workflows

- Dashboard totals for stories, reports, people, companies, comments, salary contributions, and ratings.
- Story publication review, comment-thread moderation, and report resolution.
- Member restrictions, company classification and verification, public contact settings, and an audit log.
- Private member-message review, replies from the Candid official account, and support chat/ticket handling. Opening message threads and sending replies are recorded in the audit log.
