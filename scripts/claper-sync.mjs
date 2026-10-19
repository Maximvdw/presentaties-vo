/**
 * Sync the Claper polls, quizzes and forms of a presentation from a JSON file.
 *
 *   npm run claper:sync -- 2026/vc-event/claper-polls.json
 *
 * The file holds {"event": "<code>", "polls"?: [...], "quizzes"?: [...], "forms"?: [...]}:
 *   poll  {"id"?, "title", "options": [...], "multiple"?}
 *   quiz  {"id"?, "title", "questions": [{"title", "options": [...], "correct": [<index>, ...]}]}
 *   form  {"id"?, "title", "fields": [{"name", "type": "text" | "email", "required"?}]}
 * An entry with an "id" is updated in place (so the ids in the slides stay valid); without an id
 * it is matched on its title, or created. New entries get an id: copy it into the file and the
 * slides. A quiz that already has answers is left unchanged. See README.md § "Live vragen met
 * Claper".
 *
 * Needs CLAPER_CONTROL_TOKEN, from the environment or from .env in the repository root.
 */
import { readFileSync, existsSync } from 'node:fs';

const CONTROL_URL = process.env.CLAPER_CONTROL_URL || 'https://claper.maximvdw.be/control';

function readToken() {
  if (process.env.CLAPER_CONTROL_TOKEN) return process.env.CLAPER_CONTROL_TOKEN;
  if (existsSync('.env')) {
    const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('CLAPER_CONTROL_TOKEN='));
    if (line) return line.slice('CLAPER_CONTROL_TOKEN='.length).trim();
  }
  throw new Error('CLAPER_CONTROL_TOKEN ontbreekt (zet het in .env of in de omgeving)');
}

const file = process.argv[2];
if (!file) {
  console.error('Gebruik: npm run claper:sync -- <pad/naar/claper-polls.json>');
  process.exit(1);
}

const { event, polls, quizzes, forms } = JSON.parse(readFileSync(file, 'utf8'));
const response = await fetch(`${CONTROL_URL}/sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readToken()}` },
  body: JSON.stringify({ event, polls, quizzes, forms })
});
const body = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(`Claper weigerde (${response.status}): ${body.error || response.statusText}`);
  process.exit(1);
}

const labels = { created: 'aangemaakt', updated: 'bijgewerkt', kept: 'behouden (heeft al antwoorden)' };
for (const [key, kind] of [['polls', 'poll'], ['quizzes', 'quiz'], ['forms', 'form']]) {
  for (const row of body[key] || []) {
    console.log(`${labels[row.result] || row.result}  ${kind} ${row.id}  ${row.title}`);
  }
}
