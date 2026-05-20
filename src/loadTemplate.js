import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'mathe-2-pruefung.html');

/**
 * Replace {{key}} placeholders in the HTML template.
 * @param {Record<string, string>} vars
 */
export async function loadTemplate(vars = {}) {
  let html = await readFile(TEMPLATE_PATH, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value ?? '');
  }
  return html;
}
