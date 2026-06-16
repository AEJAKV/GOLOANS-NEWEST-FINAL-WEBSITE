/**
 * GoLoans — Safe Image Optimizer
 * ────────────────────────────────────────────────────────────────────────────
 * Reads every PNG / JPG / JPEG from SOURCE_DIR and writes a WebP copy into
 * OUTPUT_DIR, preserving the original sub-folder structure.
 *
 * Rules enforced by design:
 *   • Original files are NEVER read/written in-place.
 *   • No .orig backups are created.
 *   • OUTPUT_DIR is a completely separate tree.
 *   • HTML and CSS are not touched.
 *
 * Usage:
 *   node scripts/compress-images.js            (process all images)
 *   node scripts/compress-images.js --dry-run  (preview only, no writes)
 *
 * Output structure example:
 *   img/logo/hero-image.png
 *   → optimized/img/logo/hero-image.webp
 *
 *   img/logo/province-imgs/toronto-ontario.png
 *   → optimized/img/logo/province-imgs/toronto-ontario.webp
 * ────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const sharp   = require('sharp');
const fs      = require('fs');
const path    = require('path');

// ── Configuration ────────────────────────────────────────────────────────────
const ROOT       = path.resolve(__dirname, '..');          // project root
const SOURCE_DIR = path.join(ROOT, 'img');                 // read from here
const OUTPUT_DIR = path.join(ROOT, 'optimized', 'img');   // write WebP here
const WEBP_QUALITY = 82;   // 0-100 — higher = better quality, larger file
const SKIP_SMALLER = true; // if WebP output is larger than original, skip it

const DRY_RUN = process.argv.includes('--dry-run');
// ─────────────────────────────────────────────────────────────────────────────

function walkDir(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(full));
    } else if (/\.(png|jpe?g)$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1);
}

async function run() {
  const sources = walkDir(SOURCE_DIR);

  if (sources.length === 0) {
    console.log('No PNG/JPG files found in', SOURCE_DIR);
    process.exit(0);
  }

  console.log(`\nGoLoans Image Optimizer${DRY_RUN ? ' [DRY RUN — no files written]' : ''}`);
  console.log(`Source : ${SOURCE_DIR}`);
  console.log(`Output : ${OUTPUT_DIR}`);
  console.log(`Quality: ${WEBP_QUALITY}`);
  console.log(`Files  : ${sources.length}\n`);

  let written = 0, skipped = 0, larger = 0;
  const rows = [];

  for (const srcPath of sources) {
    // Build the mirrored output path, swapping extension to .webp
    const relative  = path.relative(SOURCE_DIR, srcPath);          // e.g. logo\hero-image.png
    const webpRel   = relative.replace(/\.(png|jpe?g)$/i, '.webp');
    const destPath  = path.join(OUTPUT_DIR, webpRel);

    const srcSize = fs.statSync(srcPath).size;

    if (DRY_RUN) {
      rows.push({ status: 'would write', src: relative, dest: path.relative(ROOT, destPath), srcKB: kb(srcSize), destKB: '?' });
      written++;
      continue;
    }

    // Ensure destination directory exists
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    // Convert to WebP — read original, never modify it
    const webpBuf = await sharp(srcPath)
      .webp({ quality: WEBP_QUALITY, effort: 6 })
      .toBuffer();

    const destSize = webpBuf.length;

    if (SKIP_SMALLER && destSize >= srcSize) {
      // WebP is no improvement — skip writing, but note it
      rows.push({ status: 'SKIPPED (WebP larger)', src: relative, srcKB: kb(srcSize), destKB: kb(destSize) });
      skipped++;
      continue;
    }

    fs.writeFileSync(destPath, webpBuf);
    const saving = (((srcSize - destSize) / srcSize) * 100).toFixed(1);
    rows.push({ status: 'written', src: relative, srcKB: kb(srcSize), destKB: kb(destSize), saving: `${saving}%` });
    written++;
  }

  // ── Print results table ───────────────────────────────────────────────────
  const colW = 62;
  console.log('─'.repeat(colW + 34));
  console.log(
    'Status'.padEnd(24) +
    'Source file'.padEnd(colW) +
    'Original'.padStart(10) +
    'WebP'.padStart(10) +
    'Saved'.padStart(9)
  );
  console.log('─'.repeat(colW + 34));

  for (const r of rows) {
    console.log(
      r.status.padEnd(24) +
      r.src.padEnd(colW) +
      (r.srcKB + ' KB').padStart(10) +
      (r.destKB !== '?' ? r.destKB + ' KB' : '?').padStart(10) +
      (r.saving || '').padStart(9)
    );
  }

  console.log('─'.repeat(colW + 34));
  if (!DRY_RUN) {
    const totalSrc  = sources.reduce((s, f) => s + fs.statSync(f).size, 0);
    // Only sum files that were actually written
    const writtenFiles = rows.filter(r => r.status === 'written');
    console.log(`\nWritten : ${writtenFiles.length} WebP file(s)`);
    console.log(`Skipped : ${skipped} file(s) (WebP would be larger)`);
    console.log(`\nOriginals in img/       : ${kb(totalSrc)} KB`);
    console.log(`Originals untouched     : YES`);
    console.log(`Output folder           : optimized/img/\n`);
  } else {
    console.log(`\n${written} file(s) would be written to optimized/img/`);
    console.log('Run without --dry-run to execute.\n');
  }
}

run().catch(err => { console.error('\nError:', err.message); process.exit(1); });
