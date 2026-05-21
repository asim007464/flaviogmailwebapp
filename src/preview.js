import 'dotenv/config';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildPreviewHtml } from './mailer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'preview.html');

const html = buildPreviewHtml();
await writeFile(out, html, 'utf8');
console.log('Preview written to:', out);
