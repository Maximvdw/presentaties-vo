#!/usr/bin/env node

/**
 * Export Reveal.js presentaties naar PDF
 * Gebruikt decktape voor high-quality PDF export
 */

import { execSync, spawn } from 'child_process';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
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

    console.log(`📄 Exporteren: ${presentation}`);
    console.log(`   URL: ${url}`);
    console.log(`   Output: ${outputPath}`);

    try {
      execSync(
        `npx decktape reveal "${url}" "${outputPath}" --size=${BASE_WIDTH}x${BASE_HEIGHT} --load-pause 8000 --chrome-arg=--disable-dev-shm-usage --chrome-arg=--single-process --chrome-arg=--disable-gpu --chrome-arg=--print-to-pdf-no-header --chrome-arg=--allow-file-access-from-files --chrome-arg=--js-flags=--max-old-space-size=4096`,
        { stdio: 'inherit' }
      );
      console.log(`✅ Succesvol geëxporteerd!`);
      
      // Copy PDF for Confluence (without rasterization to preserve fonts)
      const confluenceOutputPath = outputPath.replace(/\.pdf$/i, '-confluence.pdf');
      fs.copyFileSync(outputPath, confluenceOutputPath);
      console.log(`✅ Confluence PDF gemaakt (kopie): ${confluenceOutputPath}\n`);
    } catch (error) {
      console.error(`❌ Fout bij exporteren van ${presentation}`);
      console.error(error?.stack || error);
      console.log('');
    }
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
