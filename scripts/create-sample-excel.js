import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'sample-recipients.xlsx');
const ws = XLSX.utils.aoa_to_sheet([
  ['email', 'name'],
  ['estellejoy777@gmail.com', 'Estelle'],
  ['kontaktsechspunktnull@gmail.com', 'Kontakt'],
  ['f26004222@gmail.com', ''],
  ['fabiobertschi@gmail.com', 'Fabio'],
  ['asad464143@gmail.com', 'Asad'],
  ['asimsajjad928@gmail.com', 'Asim'],
  ['bushraakmal464143@gmail.com', 'Bushra'],
  ['haris464143@gmail.com', 'Haris'],
]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Recipients');
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log('Created', out);
