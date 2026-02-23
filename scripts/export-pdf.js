#!/usr/bin/env node

/**
 * Export Reveal.js presentaties naar PDF
 * Gebruikt decktape voor high-quality PDF export
 */

import crypto from 'crypto';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const CACHE_EXT = '.pdfcache.json';
const BASE_URL = 'http://localhost:8080';
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const SITE_DIR = path.join(__dirname, '..', '_site');

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

  // Start static server for _site using serve-handler
  const handler = (await import('serve-handler')).default || (await import('serve-handler'));
  const httpServer = (await import('http')).default || (await import('http'));
  const PORT = 8080;
  let serverInstance;
  await new Promise((resolve) => {
    serverInstance = httpServer.createServer((request, response) => {
      //console.log(`📥 ${request.method} ${request.url}`);
      return handler(request, response, {
        public: SITE_DIR,
        cleanUrls: true,
        rewrites: [
          { source: '/:presentation', destination: '/:presentation/index.html' },
          { source: '/:presentation/', destination: '/:presentation/index.html' }
        ]
      });
    });
    serverInstance.listen(PORT, () => {
      console.log(`✅ Static server gestart op http://localhost:${PORT}`);
      // Ping server until it's responsive
      const pingServer = () => {
        httpServer.get(`http://localhost:${PORT}/`, (res) => {
          if (res.statusCode === 200) {
            console.log('✅ Server is responsive!');
            resolve();
          } else {
            console.log(`⚠️  Server responded with status ${res.statusCode}, retrying...`);
            setTimeout(pingServer, 1000);
          }
        }).on('error', () => {
          console.log('⚠️  Server not responsive yet, retrying...');
          setTimeout(pingServer, 1000);
        });
      }     
      pingServer();
    });
  });

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

    try {
      // Use spawn for async Decktape execution
      const { spawn } = await import('child_process');
      const decktapeArgs = [
        'decktape',
        url,
        outputPath,
        `--size=${BASE_WIDTH}x${BASE_HEIGHT}`,
        '--load-pause', '5000',
      ];
      await new Promise((resolve, reject) => {
        const proc = spawn('npx', decktapeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

        proc.stdout.on('data', data => {
          console.log(data.toString());
        });
        proc.stderr.on('data', data => { 
          console.error(data.toString());
        });
        proc.on('close', code => {
          if (code !== 0) {
            reject(new Error(`Decktape exited with code ${code}`));
          } else {
            console.log(`✅ Succesvol geëxporteerd!`);
            resolve();
          }
        });
        proc.on('error', err => {
          console.error(`   [ERROR] spawn error:`, err);
          reject(err);
        });
      });

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
      console.error(`❌ Fout bij exporteren van ${presentation}:`, error);
      continue;
    }
  }

  console.log(`\n✨ PDF export voltooid! Bekijk de bestanden in: ${OUTPUT_DIR}`);
  
  // Kill server if we started it
  // No server to stop
    // Stop static server
    if (serverInstance) {
      serverInstance.close();
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
