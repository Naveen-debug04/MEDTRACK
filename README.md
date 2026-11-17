# MedTrack

MedTrack is a responsive medicine inventory application with a vanilla JavaScript frontend and a Node.js/Express API backed by MongoDB and Mongoose.

## What is included

- Account registration and login with scrypt password hashes, HTTP-only server-managed sessions, and owner-managed staff invitations for shared workspaces.
- Medicine and batch records, stock adjustments, and movement history scoped to the signed-in account.
- Private doctor appointment schedule with status tracking and optional development sample records.
- Dashboard summaries, expiry/low-stock alerts, settings, and downloadable CSV inventory reports.
- Camera barcode scanning where supported, with manual barcode lookup as a fallback.
- An inventory-only assistant. It uses local inventory summaries by default; an optional server-configured AI provider can answer more flexible inventory questions.
- Development seed records and focused tests for expiry/status calculations.

Registration creates a private owner workspace but does not automatically sign the user in. Owners can issue 48-hour invitation codes for staff; codes are shown once and must be shared privately with the invited email address. Owners manage members and settings; staff can read and modify inventory. Existing accounts without a membership role are treated as workspace owners.

Pre-existing records in a former shared `medtrack-local` workspace are not automatically assigned to any account. Registering a new account starts with an empty private workspace.

## Requirements

- Node.js 20 or later
- MongoDB Atlas, or a local MongoDB configured as a replica set (multi-document transactions are required for stock and audit consistency)

## Install and run in VS Code

1. Open this folder in VS Code.
2. In a terminal, install the API dependencies. `dotenv` reads `.env`; `.env.example` is only a template:

   ```powershell
   cd backend
   npm install
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

3. Set `MONGODB_URI` to your MongoDB connection string and `MONGODB_DB_NAME` to the database name (defaults to `medtrack`). Keep `.env` private and untracked. If your workspace is in a cloud-synced folder such as OneDrive, set credentials as process environment variables instead of storing them in `.env`. The backend uses the operating system's configured DNS by default; it no longer forces a public DNS resolver. If Node reports `querySrv ECONNREFUSED`, fix the machine's DNS configuration or optionally set `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` in the backend environment. This sends DNS queries to those providers; omit the setting to use the default resolver.
4. Start MongoDB, then start the backend:

   ```powershell
   npm run dev
   ```

5. Open `http://localhost:4000` and create an account. Successful registration returns you to the login page; sign in to access your private inventory.

For frontend hot reload, install and run Vite in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). The Vite development server proxies `/api` to the backend on port 4000; `FRONTEND_ORIGIN` must include the frontend origin.

### Windows: run with an Atlas URI without saving it in the workspace

From the backend directory, enter `powershell` if you are currently in Command Prompt. Paste the following in that PowerShell window; the URI prompt is masked, and the variables must be set in the same window that runs the server. Use a rotated Atlas credential, not one previously pasted into chat.

```powershell
$secureUri = Read-Host "MongoDB Atlas URI" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUri)
try {
  $env:MONGODB_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
$env:MONGODB_DB_NAME = "medtrack"
npm.cmd run dev
```

The variable lasts only for that PowerShell session. Confirm your Atlas network access list permits the machine running the backend.

Use the development-only sample inventory with `npm run seed` from `backend/`. The command refuses to run when `NODE_ENV=production`.

## API overview

All inventory and account-session routes require authentication except registration, login, and health checks. The browser session token is opaque, stored hashed in MongoDB, and sent in an HTTP-only cookie; no JWT is used.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and isolated workspace |
| POST | `/api/auth/accept-invitation` | Accept an owner-issued invitation code |
| POST | `/api/auth/login` | Sign in and create a server-side session |
| GET | `/api/auth/me` | Get the current account |
| POST | `/api/auth/logout` | End the current session |
| GET/POST | `/api/appointments` | List or schedule appointments (requires session) |
| PATCH | `/api/appointments/:id/status` | Update appointment status |
| DELETE | `/api/appointments/:id` | Remove an appointment |
| GET/POST | `/api/medicines` | Search or create medicines (requires session) |
| PATCH/DELETE | `/api/medicines/:id` | Update or remove a medicine |
| GET/POST | `/api/batches` | List or create batches |
| PATCH | `/api/batches/:id/stock` | Record a signed stock adjustment |
| DELETE | `/api/batches/:id` | Remove a batch; movement history is retained |
| GET | `/api/dashboard` | Dashboard summary and chart data |
| GET/PATCH | `/api/settings` | Read or update the signed-in workspace's expiry alert period |
| GET | `/api/members` | List workspace members and pending invitations (owner only) |
| POST | `/api/members/invitations` | Create a 48-hour staff invitation (owner only) |
| DELETE | `/api/members/invitations/:id` | Revoke a pending invitation (owner only) |
| DELETE | `/api/members/:id` | Remove a staff account and its sessions (owner only) |
| GET | `/api/notifications` | Current alerts and inventory activity |
| GET | `/api/audit` | Workspace-scoped inventory change audit history |
| GET | `/api/reports/inventory` | Inventory report; `?format=csv` downloads CSV |
| POST | `/api/assistant` | Ask an inventory-only question |
| GET | `/api/health` | Health check |

## Tests

From `backend/`:

```powershell
npm test
```

Automated tests cover expiry calculations, no-batch stock alerts, AI sharing consent, password hashing, registration and invitation validation, owner authorization, appointment validation, and unauthorized API access. Database-backed transactions, registration, login, invitations, appointments, and inventory flows require a running MongoDB replica set.

## Environment and optional services

See `backend/.env.example`. MongoDB is required. The API explicitly selects `MONGODB_DB_NAME` (default `medtrack`), including when the Atlas URI has no database path. `FRONTEND_ORIGIN` is a comma-separated exact-origin CORS allowlist for a separately hosted frontend.

- **Sessions:** `SESSION_COOKIE_SAME_SITE` defaults to `lax`. For a frontend hosted on a different site, set it to `none` and use HTTPS; cookies marked `none` are automatically `Secure` by the backend. Configure the exact `FRONTEND_ORIGIN` and keep the API's origin check enabled.
- **Sample data:** Register an account first. From `backend/`, set `SEED_EMAIL` to that account's email and run the appointment seeder. It adds three non-clinical demo appointments without deleting existing appointments or inventory:

  ```powershell
  $env:SEED_EMAIL = "your-account@example.com"
  npm.cmd run seed:appointments
  ```

  The existing `npm run seed` also requires `SEED_EMAIL` and replaces that account's medicine and batch inventory.

- **AI:** Assistant answers use the local rules-based service by default. Configure `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` on the backend, then have the workspace owner explicitly enable external AI sharing in Settings. Only product names/categories and batch numbers, expiry dates, quantities, and thresholds are sent; supplier and account identifiers are excluded. Review provider data terms before enabling.
- **Email:** Email notifications are not implemented. Alerts are available in-app; configure an email provider and delivery policy before adding email.
- **Camera scanning:** Requires browser `BarcodeDetector` support and camera permission on HTTPS or localhost. Manual lookup remains available when unsupported or denied.
- **Fonts:** The interface optionally loads DM Sans and Manrope from Google Fonts; system font fallbacks are included.

## Separate Render deployment

The backend and Vite frontend can be deployed as separate Render services:

- **Backend Web Service:** repository root directory `backend`, build command `npm install`, start command `npm start`. Set `NODE_ENV=production`, `HOST=0.0.0.0`, `MONGODB_URI`, `MONGODB_DB_NAME=medtrack`, and `FRONTEND_ORIGIN` to the exact HTTPS origin of the Static Site. Render supplies `PORT`.
- **Frontend Static Site:** repository root directory `frontend`, build command `npm install && npm run build`, publish directory `dist`. Set `VITE_MEDTRACK_API_URL` to the backend service origin, without a trailing slash. Vite embeds this value at build time through `vite.config.js`; redeploy the Static Site after changing it.
- Allow the backend service's outbound IP addresses in MongoDB Atlas. Keep database credentials in Render's backend environment variables; never commit `.env` files.

## Deployment warning

Use HTTPS in production and protect database credentials. Existing databases are migrated at startup by replacing the legacy unique workspace index with a non-unique index so invited staff can share workspaces. Appointment records are private to their workspace, but the application has not been assessed for regulatory, clinical, pharmacy, or privacy-law compliance. Email delivery, email verification, and password reset still require an email provider and additional implementation. Do not use it as a clinical decision or dispensing system without appropriate independent review.

