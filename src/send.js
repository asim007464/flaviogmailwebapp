import 'dotenv/config';
import { sendOne } from './mailer.js';

const to = process.argv[2];
const subject =
  process.argv[3] ?? '6.0 – Rette deine Mathe-2-Prüfung';

if (!to) {
  console.error('Usage: npm run send -- <recipient@email.com> ["Optional subject"]');
  process.exit(1);
}

try {
  const messageId = await sendOne(to, subject);
  console.log('Email sent:', messageId);
  console.log('To:', to);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
