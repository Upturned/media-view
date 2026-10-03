// Builds PDFs from the Markdown docs, using the locally installed Edge or Chrome (headless).
// No dependencies, works offline.
//
// Usage:
//   node docs/build-pdf.js                      → every .md under docs/
//   node docs/build-pdf.js docs/user-guide/images.md [out.pdf]
//
// Supported Markdown: headings, paragraphs, bold, italic, inline code, code fences,
// blockquotes, tables, ordered/unordered lists (one level of nesting), horizontal rules.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

// ── Markdown → HTML ───────────────────────────────────────────────────────────

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');
const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

function mdToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  let html = '', i = 0;

  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }

    if (l.startsWith('```')) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      html += `<pre><code>${esc(buf.join('\n'))}</code></pre>\n`;
      continue;
    }

    const h = l.match(/^(#{1,6}) (.*)/);
    if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>\n`; i++; continue; }

    if (/^---+$/.test(l.trim())) { html += '<hr>\n'; i++; continue; }

    if (l.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      html += `<blockquote>${buf.map(inline).join('<br>')}</blockquote>\n`;
      continue;
    }

    if (l.trim().startsWith('|')) {
      const head = cells(l); i += 2; // skip the separator row
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      html += '<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>\n';
      continue;
    }

    const li = /^(\s*)(- |\d+\. )(.*)/;
    if (li.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && li.test(lines[i])) {
        const m = lines[i++].match(li);
        if (m[1].length && items.length) items[items.length - 1] += `<ul><li>${inline(m[3])}</li></ul>`;
        else items.push(inline(m[3]));
      }
      const tag = ordered ? 'ol' : 'ul';
      html += `<${tag}>${items.map(x => `<li>${x.replace(/<\/ul><ul>/g, '')}</li>`).join('')}</${tag}>\n`;
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|>|\||\s*- |\d+\. |---)/.test(lines[i])) buf.push(lines[i++]);
    html += `<p>${inline(buf.join(' '))}</p>\n`;
  }
  return html;
}

const CSS = `
@page { size: A4; margin: 18mm 16mm; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1d1d1f; }
h1 { font-size: 22pt; margin: 0 0 6pt; color: #2b3a67; }
h2 { font-size: 15pt; color: #2b3a67; border-bottom: 1.5px solid #c9d1e6; padding-bottom: 3pt; margin-top: 22pt; break-after: avoid; }
h3 { font-size: 12pt; margin-top: 14pt; break-after: avoid; }
h4 { font-size: 10.5pt; margin-top: 12pt; break-after: avoid; }
blockquote { border-left: 3px solid #8aa0d6; background: #f3f5fb; margin: 8pt 0; padding: 6pt 10pt; color: #333; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; break-inside: avoid; font-size: 9.5pt; }
th, td { border: 1px solid #d5d9e3; padding: 4pt 7pt; text-align: left; vertical-align: top; }
th { background: #eef1f8; }
code { font-family: Consolas, monospace; background: #f1f2f5; padding: 0 3px; border-radius: 3px; font-size: 9pt; }
pre { background: #f6f7f9; border: 1px solid #e1e4ea; padding: 8pt 10pt; border-radius: 4px; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
hr { border: none; margin: 4pt 0; }
li { margin: 2pt 0; }
`;

// ── PDF ───────────────────────────────────────────────────────────────────────

function findBrowser() {
  const found = BROWSERS.find(p => fs.existsSync(p));
  if (!found) throw new Error('Edge or Chrome not found. Install one, or add its path to BROWSERS.');
  return found;
}

function buildPdf(mdPath, pdfPath = mdPath.replace(/\.md$/i, '.pdf')) {
  const md = fs.readFileSync(mdPath, 'utf8');
  const title = (md.match(/^# (.*)$/m) || [, path.basename(mdPath)])[1];
  const htmlPath = path.join(os.tmpdir(), `mediaview-doc-${process.pid}-${path.basename(mdPath, '.md')}.html`);

  fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>`
    + `<style>${CSS}</style></head><body>${mdToHtml(md)}</body></html>`);

  try {
    execFileSync(findBrowser(), [
      '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
      `--print-to-pdf=${path.resolve(pdfPath)}`,
      'file:///' + htmlPath.replace(/\\/g, '/'),
    ], { stdio: 'ignore' });
  } finally {
    fs.rmSync(htmlPath, { force: true });
  }
  console.log(`✔ ${path.relative(process.cwd(), pdfPath)}`);
}

function findMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return findMarkdown(p);
    return e.name.toLowerCase().endsWith('.md') ? [p] : [];
  });
}

const [, , input, output] = process.argv;
if (input) buildPdf(input, output);
else findMarkdown(__dirname).forEach(p => buildPdf(p));
