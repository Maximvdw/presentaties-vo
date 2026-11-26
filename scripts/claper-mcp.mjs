#!/usr/bin/env node
/**
 * MCP-server (stdio, geen dependencies) voor Claper: status, resultaten, sync, open/sluit vragen,
 * event starten en reacties. Gebruik via .mcp.json (Claude Code, Copilot CLI) of opencode.json.
 *
 * Token: CLAPER_CONTROL_TOKEN uit de omgeving, anders uit .env in de repo-root. Bestandspaden voor
 * claper_sync zijn relatief aan de repo-root en mogen die niet verlaten.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL_URL = process.env.CLAPER_CONTROL_URL || 'https://claper.maximvdw.be/control';
const PUBLIC_URL = process.env.CLAPER_PUBLIC_URL || 'https://claper.maximvdw.be/public-api';
const PROTOCOL_VERSION = '2024-11-05';

function readToken() {
  if (process.env.CLAPER_CONTROL_TOKEN) return process.env.CLAPER_CONTROL_TOKEN;
  const envFile = resolve(ROOT, '.env');
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('CLAPER_CONTROL_TOKEN='));
    if (line) return line.slice('CLAPER_CONTROL_TOKEN='.length).trim();
  }
  throw new Error('CLAPER_CONTROL_TOKEN ontbreekt (zet het in .env in de repo-root of in de omgeving)');
}

async function control(path, body) {
  const response = await fetch(`${CONTROL_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readToken()}` },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Claper weigerde (${response.status}): ${data.error || response.statusText}`);
  return data;
}

function checkEvent(event) {
  if (typeof event !== 'string' || !/^[a-z0-9]+$/i.test(event)) throw new Error('event moet een eventcode zijn, bv. "q6tdq"');
  return event;
}

function checkId(id) {
  if (!Number.isInteger(id)) throw new Error('id moet een geheel getal zijn');
  return id;
}

const KIND = { type: 'string', enum: ['poll', 'quiz', 'form'], description: 'Soort interactie' };
const EVENT = { type: 'string', description: 'Eventcode, bv. "q6tdq"' };

const tools = {
  claper_status: {
    description: 'Controleer de publieke API en de controlservice (bereikbaar + token geldig). Wijzigt niets.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const publicOk = (await fetch(`${PUBLIC_URL}/polls?limit=1`)).ok;
      // Zonder event weigert de service het verzoek (400); een ongeldige token geeft 401.
      const probe = await fetch(`${CONTROL_URL}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readToken()}` },
        body: '{}'
      });
      const body = await probe.json().catch(() => ({}));
      return {
        publicApi: publicOk ? 'ok' : 'fout',
        control: probe.status === 401 ? 'token ongeldig' : probe.status === 400 ? 'ok' : `onverwacht (${probe.status})`,
        controlError: body.error ?? null
      };
    }
  },
  claper_results: {
    description: 'Geaggregeerde resultaten van alle polls van een event (publieke API, geen token nodig).',
    inputSchema: { type: 'object', properties: { event: EVENT }, required: ['event'] },
    run: async ({ event }) => {
      const response = await fetch(`${PUBLIC_URL}/polls?event=eq.${checkEvent(event)}&order=id`);
      if (!response.ok) throw new Error(`Publieke API weigerde (${response.status})`);
      return response.json();
    }
  },
  claper_sync: {
    description:
      'Synchroniseer polls, quizzes en formulieren uit een JSON-bestand (zoals 2026/vc-event/claper-polls.json). ' +
      'Items met id worden bijgewerkt, zonder id op titel gezocht of aangemaakt. Nieuwe items krijgen een id in het resultaat.',
    inputSchema: {
      type: 'object',
      properties: { file: { type: 'string', description: 'Pad relatief aan de repo-root, bv. 2026/vc-event/claper-polls.json' } },
      required: ['file']
    },
    run: async ({ file }) => {
      if (typeof file !== 'string' || !file) throw new Error('file is verplicht');
      const path = resolve(ROOT, file);
      const rel = relative(ROOT, path);
      if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('file moet binnen de repo liggen');
      const { event, polls, quizzes, forms } = JSON.parse(readFileSync(path, 'utf8'));
      const body = { event: checkEvent(event) };
      if (polls) body.polls = polls;
      if (quizzes) body.quizzes = quizzes;
      if (forms) body.forms = forms;
      return control('/sync', body);
    }
  },
  claper_open: {
    description: 'Open een poll, quiz of formulier in Claper zodat deelnemers het zien (zoals de activeer-knop in /manage).',
    inputSchema: {
      type: 'object',
      properties: { event: EVENT, kind: KIND, id: { type: 'integer', description: 'Id van de interactie' } },
      required: ['event', 'kind', 'id']
    },
    run: async ({ event, kind, id }) => control('/activate', { event: checkEvent(event), [kind]: checkId(id) })
  },
  claper_close: {
    description: 'Sluit een poll, quiz of formulier in Claper (zoals de deactiveer-knop in /manage).',
    inputSchema: {
      type: 'object',
      properties: { event: EVENT, kind: KIND, id: { type: 'integer', description: 'Id van de interactie' } },
      required: ['event', 'kind', 'id']
    },
    run: async ({ event, kind, id }) => control('/deactivate', { event: checkEvent(event), [kind]: checkId(id) })
  },
  claper_start: {
    description: 'Start een event waarvan de startdatum nog in de toekomst ligt (zet started_at op nu).',
    inputSchema: { type: 'object', properties: { event: EVENT }, required: ['event'] },
    run: async ({ event }) => control('/start', { event: checkEvent(event) })
  },
  claper_reactions: {
    description: 'Telling van live reacties (heart, clap, hundred, raisehand) sinds de controlservice ze begon te zien.',
    inputSchema: { type: 'object', properties: { event: EVENT }, required: ['event'] },
    run: async ({ event }) => control('/reactions', { event: checkEvent(event) })
  }
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(request) {
  const { id, method, params } = request;
  const reply = (result) => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'claper', version: '1.0.0' }
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({
        tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema }))
      });
    case 'tools/call': {
      const tool = tools[params?.name];
      if (!tool) return fail(-32602, `Onbekende tool: ${params?.name}`);
      try {
        const result = await tool.run(params.arguments ?? {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (error) {
        return reply({ content: [{ type: 'text', text: error.message }], isError: true });
      }
    }
    default:
      if (method?.startsWith('notifications/')) return;
      return fail(-32601, `Methode niet ondersteund: ${method}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    handle(request).catch((error) => {
      if (request.id !== undefined) send({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error.message } });
    });
  }
});
