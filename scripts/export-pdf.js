#!/usr/bin/env node

/**
 * Export Reveal.js presentaties naar PDF
 * Gebruikt decktape voor high-quality PDF export
 */

import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const CACHE_EXT = '.pdfcache.json';
const SITE_DIR = path.join(__dirname, '..', '_site');
const BASE_URL = 'http://localhost:8080';
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

let serverProcess = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();
pdfjsLib.GlobalWorkerOptions.disableWorker = true;

// Zorg dat output directory bestaat
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Check if server is running
async function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8080/', (res) => {
      resolve(true);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(1000);
  });
}

// Start Eleventy server
function startServer() {
  return new Promise((resolve) => {
    console.log('🚀 Starting Eleventy server on port 8080...\n');
    serverProcess = spawn('npm', ['start'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      detached: false,
      env: {
        ...process.env,
        ELEVENTY_DISABLE_LIVERELOAD: 'true'
      }
    });
    const server = serverProcess;

    let serverReady = false;

    const timeout = setTimeout(() => {
      serverReady = true;
      resolve(true);
    }, 5000);

    server.stdout.on('data', (data) => {
      if (data.toString().includes('Connected') || data.toString().includes('Watching')) {
        serverReady = true;
        clearTimeout(timeout);
        resolve(true);
      }
    });

    server.stderr.on('data', (data) => {
      if (data.toString().includes('error') || data.toString().includes('Error')) {
        console.error('❌ Server error:', data.toString());
      }
    });
  });
}

// Zoek alle HTML presentaties in _site (exclusief fonts en root index)
function findPresentations(dir, baseDir = dir) {
  const results = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip fonts directory
      if (item === 'fonts' || item === 'css' || item === 'images' || item === 'reveal.js' || item === 'ICON_FONT') {
        continue;
      }
      results.push(...findPresentations(fullPath, baseDir));
    } else if (item === 'index.html') {
      const relativePath = path.relative(baseDir, dir);
      // Skip root index (it's not a Reveal.js presentation anymore)
      if (relativePath === '') {
        continue;
      }
      results.push(relativePath);
    }
  }

  return results;
}

async function main() {
  console.log('📊 Reveal.js PDF Export Tool\n');

  // Check of _site bestaat (eleventy build)
  if (!fs.existsSync(SITE_DIR)) {
    console.error('❌ _site directory niet gevonden. Run eerst "npm run build"');
    process.exit(1);
  }

  // Check if server is running, if not start it
  const serverRunning = await isServerRunning();
  if (!serverRunning) {
    await startServer();
    // Wait a moment for server to fully start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Vind alle presentaties
  const presentations = findPresentations(SITE_DIR);
  
  if (presentations.length === 0) {
    console.log('⚠️  Geen presentaties gevonden in _site/');
    process.exit(0);
  }

  console.log(`✅ Gevonden ${presentations.length} presentatie(s):\n`);

  // Vraag of Eleventy server draait
  console.log('⚠️  Zorg dat Eleventy server draait (npm start) op poort 8080\n');

  // Export elke presentatie
  for (const presentation of presentations) {
    const url = `${BASE_URL}/${presentation}/?export=1`;
    const filename = `${presentation.replace(/\//g, '-')}.pdf`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    // Dynamically find the nearest index.njk file for this presentation
    let njkPath = null;
    try {
      const presParts = presentation.split('/');
      // Try to find the .njk file by walking up the directory tree from deepest to shallowest
      for (let i = presParts.length; i > 0; i--) {
        const candidate = path.join(__dirname, '..', ...presParts.slice(0, i), 'index.njk');
        if (fs.existsSync(candidate)) {
          njkPath = candidate;
          break;
        }
      }
      // Also try at the root of the content folders (e.g. 2026, 2025, ...)
      if (!njkPath && presParts.length > 0) {
        const candidate = path.join(__dirname, '..', presParts[0], 'index.njk');
        if (fs.existsSync(candidate)) {
          njkPath = candidate;
        }
      }
    } catch (e) {
      // ignore
    }

    // Compute hash of .njk file (and optionally .js data file)
    let sourceHash = null;
    if (njkPath) {
      try {
        const njkContent = fs.readFileSync(njkPath);
        let hash = crypto.createHash('sha256').update(njkContent);
        // Optionally, include _data/site.js or _data/defaults.json for more robust cache invalidation
        // const siteDataPath = path.join(__dirname, '..', '_data', 'site.js');
        // if (fs.existsSync(siteDataPath)) hash.update(fs.readFileSync(siteDataPath));
        sourceHash = hash.digest('hex');
      } catch (e) {
        // ignore
      }
    }

    // Check for cache file
    const cachePath = outputPath + CACHE_EXT;
    let cached = false;
    if (sourceHash && fs.existsSync(outputPath) && fs.existsSync(cachePath)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        if (cacheData.hash === sourceHash) {
          console.log(`🟡 Cache hit: ${filename} (source unchanged, skipping export)`);
          cached = true;
        }
      } catch (e) {
        // ignore
      }
    }
    if (cached) {
      continue;
    }

    console.log(`📄 Exporteren: ${presentation}`);
    console.log(`   URL: ${url}`);
    console.log(`   Output: ${outputPath}`);

    // Log memory usage before export
    const memBefore = process.memoryUsage();
    console.log(`   [DEBUG] Memory before export: RSS=${(memBefore.rss/1024/1024).toFixed(1)}MB HeapUsed=${(memBefore.heapUsed/1024/1024).toFixed(1)}MB`);

    try {
      // Use spawnSync to capture stdout/stderr
      const { spawnSync } = await import('child_process');
      const decktapeArgs = [
        'decktape',
        'reveal',
        url,
        outputPath,
        `--size=${BASE_WIDTH}x${BASE_HEIGHT}`,
        '--load-pause', '8000',
        '--chrome-arg=--disable-dev-shm-usage',
        '--chrome-arg=--single-process',
        '--chrome-arg=--disable-gpu',
        '--chrome-arg=--print-to-pdf-no-header',
        '--chrome-arg=--allow-file-access-from-files',
        '--chrome-arg=--js-flags=--max-old-space-size=4096'
      ];
      console.log(`   [DEBUG] Running: npx ${decktapeArgs.join(' ')}`);
      const result = spawnSync('npx', decktapeArgs, { encoding: 'utf-8', maxBuffer: 1024*1024*20 });
      if (result.error) {
        console.error(`   [ERROR] spawnSync error:`, result.error);
      }
      if (result.stdout) {
        console.log(`   [DECKTAPE STDOUT]\n${result.stdout}`);
      }
      if (result.stderr) {
        console.error(`   [DECKTAPE STDERR]\n${result.stderr}`);
      }
      if (result.status !== 0) {
        throw new Error(`Decktape exited with code ${result.status}`);
      }
      console.log(`✅ Succesvol geëxporteerd!`);

      // Write cache file
      if (sourceHash) {
        try {
          fs.writeFileSync(cachePath, JSON.stringify({ hash: sourceHash, exported: new Date().toISOString() }, null, 2));
        } catch (e) {
          // ignore
        }
      }

      // Copy PDF for Confluence (without rasterization to preserve fonts)
      const confluenceOutputPath = outputPath.replace(/\.pdf$/i, '-confluence.pdf');
      fs.copyFileSync(outputPath, confluenceOutputPath);
      console.log(`✅ Confluence PDF gemaakt (kopie): ${confluenceOutputPath}\n`);
    } catch (error) {
      console.error(`❌ Fout bij exporteren van ${presentation}`);
      // Print error stack and memory usage after error
      console.error(error?.stack || error);
      const memAfter = process.memoryUsage();
      console.error(`   [DEBUG] Memory after error: RSS=${(memAfter.rss/1024/1024).toFixed(1)}MB HeapUsed=${(memAfter.heapUsed/1024/1024).toFixed(1)}MB`);

      // Try to make debug screenshots for all slides with Puppeteer
      try {
        console.log('   [DEBUG] Trying to capture screenshots for all slides with Puppeteer...');
        const puppeteer = await import('puppeteer');
        const browser = await puppeteer.launch({
          headless: true,
          args: [
            '--disable-dev-shm-usage',
            '--single-process',
            '--disable-gpu',
            '--allow-file-access-from-files',
            '--js-flags=--max-old-space-size=4096',
          ],
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for Reveal to be ready
        await page.waitForFunction('window.Reveal && Reveal.isReady()', { timeout: 20000 });
        // Get slide count
        const slideCount = await page.evaluate(() => {
          if (window.Reveal && Reveal.getTotalSlides) {
            return Reveal.getTotalSlides();
          }
          return 1;
        });
        console.log(`   [DEBUG] Reveal.js reports ${slideCount} slides.`);

        // Log Reveal.js state
        const revealState = await page.evaluate(() => {
          if (window.Reveal && Reveal.getState) {
            return Reveal.getState();
          }
          return null;
        });
        console.log('   [DEBUG] Reveal.js state:', revealState);

        // Screenshot each slide
        // Get all slide indices (horizontal/vertical)
        const indices = await page.evaluate(() => {
          const result = [];
          if (window.Reveal && Reveal.getSlides) {
            const slides = Reveal.getSlides();
            for (let h = 0; h < slides.length; h++) {
              const slide = slides[h];
              if (slide.querySelectorAll('.slides > section > section').length > 0) {
                // Vertical stack
                const verticals = slide.querySelectorAll('section');
                for (let v = 0; v < verticals.length; v++) {
                  result.push({ h, v });
                }
              } else {
                result.push({ h, v: 0 });
              }
            }
          }
          return result;
        });
        for (const idx of indices) {
          await page.evaluate(({ h, v }) => {
            if (window.Reveal && Reveal.slide) Reveal.slide(h, v);
          }, idx);
          await new Promise(r => setTimeout(r, 500));
          const slideShot = outputPath.replace(/\.pdf$/i, `-debug-slide${idx.h+1}-${idx.v+1}.png`);
          await page.screenshot({ path: slideShot, fullPage: true });
          console.log(`   [DEBUG] Screenshot saved: ${slideShot}`);
        }
        await browser.close();
      } catch (screenshotError) {
        console.error('   [DEBUG] Screenshot failed:', screenshotError);
      }
      console.log('');
    }

    // Log memory usage after export
    const memAfterExport = process.memoryUsage();
    console.log(`   [DEBUG] Memory after export: RSS=${(memAfterExport.rss/1024/1024).toFixed(1)}MB HeapUsed=${(memAfterExport.heapUsed/1024/1024).toFixed(1)}MB`);
  }

  console.log(`\n✨ PDF export voltooid! Bekijk de bestanden in: ${OUTPUT_DIR}`);
  
  // Kill server if we started it
  if (serverProcess) {
    console.log('\n🛑 Stopping Eleventy server...');
    serverProcess.kill('SIGTERM');
    // Give it a moment to cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(1);
});
