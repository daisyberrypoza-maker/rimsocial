import fs from 'node:fs';

const file = new URL('../.env.production', import.meta.url);
const contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const match = contents.match(/^\\s*VITE_API_URL\\s*=\\s*(.*?)\\s*$/m);
const apiUrl = (process.env.VITE_API_URL || match?.[1] || '').replace(/^['"]|['"]$/g, '').trim();

if (!apiUrl || /YOUR_PUBLIC|example\\.com|localhost|127\\.0\\.0\\.1/i.test(apiUrl)) {
  console.error('Android build blocked: configure frontend/.env.production with the real public HTTPS URL of your ClipVerse backend (port 3000). A phone cannot use your Mac’s localhost address.');
  process.exit(1);
}
if (!apiUrl.startsWith('https://')) {
  console.error('Android build blocked: VITE_API_URL must use HTTPS.');
  process.exit(1);
}
console.log(`Using ClipVerse API: ${apiUrl}`);
