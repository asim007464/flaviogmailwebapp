# flavioemail

Send the **6.0 Mathe-2** marketing email as HTML so recipients see the full designed layout (not plain text).

## Web app (Excel upload + preview + send)

1. Configure `.env` (SMTP settings).
2. Start the server:

```bash
npm start
```

3. Open **http://localhost:3000** in the browser.

Your client can:
- Upload an Excel file (`.xlsx` / `.xls`) with an `email` column
- Preview the HTML template on the right
- Send to all recipients with a progress bar

Sample Excel (optional):

```bash
node scripts/create-sample-excel.js
```

Uses `sample-recipients.xlsx` in the project root.

## Quick start (CLI)

1. Install dependencies:

```bash
npm install
```

2. Copy environment file and add your SMTP credentials:

```bash
copy .env.example .env
```

Edit `.env` with your mail server (Gmail, Outlook, SendGrid SMTP, etc.).

3. Preview the email in your browser:

```bash
npm run preview
```

Open `preview.html` in Chrome or Edge.

4. Send to someone:

```bash
npm run send -- friend@example.com
```

Optional custom subject:

```bash
npm run send -- friend@example.com "Noch nicht bereit für Mathe 2?"
```

## Customize the template

Edit `templates/mathe-2-pruefung.html`. Link placeholders:

| Placeholder | Default |
|-------------|---------|
| `{{ctaUrl}}` | Free trial link |
| `{{pricingUrl}}` | Pricing page |
| `{{unsubscribeUrl}}` | Unsubscribe link |

Set defaults in `.env` via `CTA_URL`, `PRICING_URL`, `UNSUBSCRIBE_URL`.

## Hostinger setup (`kontakt@six-point-o.ch`)

1. In **hPanel** → **Emails** → **Manage** → **Connect Apps & Devices**.
2. Copy SMTP: host `smtp.hostinger.com`, port `587`, TLS.
3. In `.env` set `SMTP_USER` and `SMTP_PASS` to your mailbox login (full email + password).
4. Test:

```bash
npm start
```

Open http://localhost:3000 — status should show **SMTP OK · kontakt@six-point-o.ch**.

## Gmail setup (alternative)

1. Enable 2-factor authentication on your Google account.
2. Create an [App Password](https://myaccount.google.com/apppasswords).
3. In `.env` use `smtp.gmail.com` and your Gmail app password.

## Logo

The template uses a small inline SVG logo. To use your PNG instead, replace the `<img>` in the header with your hosted URL or attach the image via nodemailer (CID).

## Spam / Posteingang

Personal Gmail for bulk marketing often lands in **Spam**. Improvements in this project:

- List-Unsubscribe headers and plain-text version
- No external Google Fonts in sent emails
- Clear sender name matching 6.0

**Empfänger:** „Kein Spam“ / „Not spam“ markieren und `contactsixpointo@gmail.com` als Kontakt speichern.

**Langfristig:** Google Workspace mit Domain `six-point-o.ch` (SPF/DKIM) statt `@gmail.com`.

## Email client notes

- Gmail and Apple Mail render this design well.
- Outlook may simplify gradients and animations; that is normal for HTML email.
- Keep total message size under ~100 KB if you add large inline images.
