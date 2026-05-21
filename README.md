# 6.0 E-Mail Versand

Web app to upload Excel recipients, preview the email, and send in batches (20 per hour).

---

## What to send your client (ZIP / folder)

Include the **whole project folder**, but **do NOT include**:

- `node_modules/` (too large — client installs it)
- `.env` (passwords — client creates their own)

**Do include:** `.env.example`, `package.json`, `src/`, `public/`, `sample-recipients.xlsx`, etc.

---

## Requirements (client PC)

1. **Node.js 18 or newer** — download: https://nodejs.org/ (LTS version)
2. **Internet** (for SMTP and `npm install`)
3. Windows, Mac, or Linux

Check Node is installed:

```bash
node -v
npm -v
```

---

## Setup (first time only)

### 1. Open the project folder

Example: unzip to `C:\flavioemail` and open Terminal / PowerShell in that folder.

### 2. Install dependencies

```bash
npm install
```

This recreates `node_modules/` (needed after you deleted it).

### 3. Create `.env` from the example

**Windows (PowerShell or CMD):**

```bash
copy .env.example .env
```

**Mac / Linux:**

```bash
cp .env.example .env
```

### 4. Edit `.env` — fill in real values

| Variable | Example / note |
|----------|----------------|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | `kontakt@six-point-o.ch` |
| `SMTP_PASS` | mailbox password from Hostinger |
| `FROM_NAME` | `6.0 · six-point-o.ch` |
| `FROM_EMAIL` | `kontakt@six-point-o.ch` |
| `REPLY_TO` | `kontakt@six-point-o.ch` |
| `AUTH_USER` | login username for the web app |
| `AUTH_PASSWORD` | login password for the web app |
| `SESSION_SECRET` | any long random string |
| `OFFER_UNTIL` | `23.5` |
| `BATCH_SIZE` | `20` |
| `BATCH_INTERVAL_MS` | `3600000` (1 hour) |
| `SEND_DELAY_MS` | `3000` |

Optional URLs (defaults are fine):

- `CTA_URL`, `PRICING_URL`

---

## Run the app (every time)

```bash
npm start
```

Then open in the browser:

**http://localhost:3000**

Log in with `AUTH_USER` / `AUTH_PASSWORD` from `.env`.

---

## How to use the app

1. **Log in** at http://localhost:3000
2. **Upload Excel** (`.xlsx` / `.xls`) with column **`email`**
3. Check **preview** on the right
4. Click **„Versand starten (20 pro Stunde)“**
   - First **20** emails go out immediately
   - Then **20 more every hour**
5. Keep the terminal open (`npm start` must keep running)

Sample file: `sample-recipients.xlsx` or download from the app.

---

## Stop the server

In the terminal: **Ctrl + C**

---

## Send one test email (optional)

```bash
npm run send -- test@example.com
```

---

## Excel format

| email |
|-------|
| user1@example.com |
| user2@example.com |

Column name can be `email`, `E-Mail`, etc.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm is not recognized` | Install Node.js from nodejs.org |
| `SMTP fehlt` | Check `.env` and restart `npm start` |
| Port 3000 in use | Close other `npm start` or kill the old process |
| Emails in Spam | Check Spam folder; use business domain + SPF/DKIM in Hostinger |
| Campaign stops | Computer must stay on; terminal must keep running |

---

## Vercel (live website) vs local PC

- **Recommended for big lists (1000+ emails):** run on a **PC or server** with `npm start` (runs for days).
- **Vercel:** needs `CAMPAIGN_DATA_DIR=/tmp/flavioemail-data` and redeploy; not ideal for very long campaigns.

---

## GitHub

https://github.com/asim007464/flaviogmailwebapp

Clone instead of ZIP:

```bash
git clone https://github.com/asim007464/flaviogmailwebapp.git
cd flaviogmailwebapp
npm install
copy .env.example .env
npm start
```
