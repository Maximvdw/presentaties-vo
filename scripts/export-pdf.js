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
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const SITE_DIR = path.join(__dirname, '..', '_site');

// Will be set to the actual server URL once the static server starts
let baseUrl = null;

// runtime server handle is returned by startStaticServer()

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

function findNearestNjk(presentation) {
  const presParts = presentation.split('/');
  // Walk up from deepest to shallowest
  for (let i = presParts.length; i > 0; i--) {
    const candidate = path.join(__dirname, '..', ...presParts.slice(0, i), 'index.njk');
    if (fs.existsSync(candidate)) return candidate;
  }
  // Try root content folder (e.g., 2026/index.njk)
  if (presParts.length > 0) {
    const candidate = path.join(__dirname, '..', presParts[0], 'index.njk');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function computeSourceHash(njkPath) {
  try {
    const content = fs.readFileSync(njkPath);
    const hash = crypto.createHash('sha256').update(content);
    return hash.digest('hex');
  } catch (e) {
    return null;
  }
}

async function startStaticServer(preferredPort = 8080) {
  const handler = (await import('serve-handler')).default || (await import('serve-handler'));
  const http = (await import('http')).default || (await import('http'));
  const PREFERRED_PORT = parseInt(process.env.PORT, 10) || preferredPort;

  const createServer = () => http.createServer((request, response) => {
    return handler(request, response, {
      public: SITE_DIR,
      cleanUrls: true,
      rewrites: [
        { source: '/:presentation', destination: '/:presentation/index.html' },
        { source: '/:presentation/', destination: '/:presentation/index.html' }
      ]
    });
  });

  return new Promise((resolve, reject) => {
    let triedFallback = false;

    const tryListen = (port) => {
      const server = createServer();
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && !triedFallback) {
          triedFallback = true;
          server.close?.();
          tryListen(0);
        } else {
          reject(err);
        }
      });

      server.listen(port, () => {
        const usedPort = server.address().port;
        const url = `http://localhost:${usedPort}`;
        // Wait until server responds with 200
        const ping = () => {
          http.get(`${url}/`, (res) => {
            if (res.statusCode === 200) {
              resolve({ url, server });
            } else {
              setTimeout(ping, 500);
            }
          }).on('error', () => setTimeout(ping, 250));
        };
        ping();
      });
    };

    tryListen(PREFERRED_PORT);
  });
}

async function runDecktape(url, outputPath) {
  const { spawn } = await import('child_process');
  const args = [
    'decktape',
    url,
    outputPath,
    `--size=${BASE_WIDTH}x${BASE_HEIGHT}`,
    '--load-pause', '5000',
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', d => console.log(d.toString()));
    proc.stderr.on('data', d => console.error(d.toString()));
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`Decktape exited with code ${code}`)));
    proc.on('error', err => reject(err));
  });
}

async function exportPresentation(presentation, baseUrl) {
  const url = `${baseUrl}/${presentation}/?export=1`;
  const filename = `${presentation.replace(/\//g, '-')}.pdf`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  const njkPath = findNearestNjk(presentation);
  const sourceHash = njkPath ? computeSourceHash(njkPath) : null;

  const cachePath = outputPath + CACHE_EXT;
  if (sourceHash && fs.existsSync(outputPath) && fs.existsSync(cachePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (cacheData.hash === sourceHash) {
        console.log(`🟡 Cache hit: ${filename} (skip)`);
        return;
      }
    } catch (e) {
      // continue
    }
  }

  console.log(`\n📄 Exporteren: ${presentation}`);
  console.log(`   URL: ${url}`);
  console.log(`   Output: ${outputPath}`);

  await runDecktape(url, outputPath);

  if (sourceHash) {
    try { fs.writeFileSync(cachePath, JSON.stringify({ hash: sourceHash, exported: new Date().toISOString() }, null, 2)); } catch (e) {}
  }
}

async function main() {  
  console.log('📊 Reveal.js PDF Export Tool\n');

  // Check of _site bestaat (eleventy build)
  if (!fs.existsSync(SITE_DIR)) {
    console.error('❌ _site directory niet gevonden. Run eerst "npm run build"');
    process.exit(1);
  }

  const PREFERRED_PORT = parseInt(process.env.PORT, 10) || 8080;

  // Start server and get base URL
  let serverHandle;
  try {
    const started = await startStaticServer(PREFERRED_PORT);
    baseUrl = started.url;
    serverHandle = started.server;
    console.log(`✅ Static server gestart op ${baseUrl}`);
  } catch (err) {
    console.error('❌ Fout bij starten van static server:', err);
    process.exit(1);
  }

  // Vind alle presentaties
  const presentations = findPresentations(SITE_DIR);
  
  if (presentations.length === 0) {
    console.log('⚠️  Geen presentaties gevonden in _site/');
    process.exit(0);
  }

  console.log(`✅ Gevonden ${presentations.length} presentatie(s):\n`);

  // Export elke presentatie
  for (const presentation of presentations) {
    try {
      await exportPresentation(presentation, baseUrl);
    } catch (err) {
      console.error(`❌ Fout bij exporteren van ${presentation}:`, err);
    }
  }

  console.log(`\n✨ PDF export voltooid! Bekijk de bestanden in: ${OUTPUT_DIR}`);
  if (serverHandle) serverHandle.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
