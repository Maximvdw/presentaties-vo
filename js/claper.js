/**
 * Claper live results
 *
 * Slides made with the `claperSlide` / `claperPoll` shortcodes carry
 *   data-claper-event  the event code (e.g. q6tdq)
 *   data-claper-poll   a poll id, or "active" for the poll that is open in Claper
 *   data-claper-api    the public read-only results API
 * Results are fetched from the API and drawn as bars in the slide theme, refreshed every few
 * seconds while visible. Request/response format and data flow: README.md § "Live vragen met
 * Claper".
 *
 * After a `claperSlide` (data-claper-live) a small copy - QR code + open poll - stays in the
 * corner on the next section (including its vertical slides), so the talk can go on while
 * people answer. Click the corner widget to enlarge it.
 *
 * Besides polls (data-claper-kind="poll", the default) a slide can show
 *   data-claper-kind="quiz"  one question of a Claper quiz: data-claper-quiz (quiz id) and
 *                            data-claper-question (1-based number). The correct answer is marked
 *                            once the slide's `.claper-reveal` fragment is shown.
 *   data-claper-kind="wall"  the messages the presenter pinned in Claper.
 *
 * Presenter control: open the deck once with `?claper-token=<token>`. The token is kept in
 * localStorage on this machine (all tabs, survives a browser restart) and removed from the address
 * bar; `?claper-token=uit` forgets it. While it is set, showing a `claperPoll` slide,
 * or any section with `data-claper-activate="<poll id>"` (also applies to its vertical slides),
 * opens that poll in Claper. `data-claper-activate="quiz:<id>"` or `"form:<id>"` opens a quiz or
 * form instead, through the control endpoint (data-claper-control), so the audience's
 * phones switch along. Opening the deck with a token also starts the Claper event if its start
 * date is still in the future (attendees otherwise see a countdown), so a dry run works any time.
 * With the token, a slide with `data-claper-reactions="clap"` (comma-separated: heart, clap, hundred,
 * raisehand) shows those live reactions from attendees floating up on the right of the screen;
 * other slides show none. Claper does not store reactions, so the control service counts them
 * (POST /reactions) and the deck animates the ones sent while the slide is shown.
 * Without a token nothing is sent: the public deck can only read results.
 */

const REFRESH_MS = 3000;
const numberFormat = new Intl.NumberFormat('nl-BE');

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// One request per view per event per refresh, shared by every element that shows it.
const VIEWS = { poll: 'polls', quiz: 'quiz_questions', wall: 'messages' };
const cache = new Map();
async function fetchRows(api, kind, event) {
  const key = `${api}|${kind}|${event}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REFRESH_MS - 200) return hit.promise;
  const order = kind === 'wall' ? 'id.desc' : 'id';
  const promise = fetch(`${api}/${VIEWS[kind]}?event=eq.${encodeURIComponent(event)}&order=${order}`, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

function pickPoll(polls, which) {
  if (which === 'active') return polls.find((p) => p.active) || null;
  return polls.find((p) => String(p.id) === String(which)) || null;
}

function pickQuestion(questions, quiz, number) {
  return questions.find((q) => String(q.quiz) === String(quiz) && String(q.number) === String(number)) || null;
}

function renderPoll(container, poll, { compact = false, showTitle = compact, unit = ['stem', 'stemmen'] } = {}) {
  if (!poll) {
    container.innerHTML = `<p class="claper-empty">Er staat nog geen vraag open.</p>`;
    return;
  }
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  const rows = poll.options.map((o) => {
    const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
    const width = (o.votes / max) * 100;
    return `<li class="claper-bar${o.correct ? ' is-correct' : ''}" title="${escapeHtml(o.label)}: ${o.votes} ${unit[1]}, ${pct}%">
        <span class="claper-bar-label">${escapeHtml(o.label)}</span>
        <span class="claper-bar-track"><span class="claper-bar-fill" style="width:${width}%"></span></span>
        <span class="claper-bar-value">${pct}%<small>${numberFormat.format(o.votes)}</small></span>
      </li>`;
  }).join('');
  const total = `${numberFormat.format(poll.total)} ${poll.total === 1 ? unit[0] : unit[1]}${poll.multiple ? ' · meerdere antwoorden mogelijk' : ''}`;
  container.innerHTML = `
    ${showTitle ? `<p class="claper-poll-name">${escapeHtml(poll.title)}</p>` : ''}
    <ol class="claper-bars">${rows}</ol>
    <p class="claper-total">${total}</p>`;
}

const WALL_MAX = 9;

function renderWall(container, messages) {
  if (messages.length === 0) {
    container.innerHTML = `<p class="claper-empty">Nog geen berichten op de muur.</p>`;
    delete container.dataset.wall;
    return;
  }
  const cards = messages.slice(0, WALL_MAX).map((m) => `<li class="claper-message">
      <p>${escapeHtml(m.body)}</p>
      ${m.reactions ? `<span class="claper-message-reactions">♥ ${numberFormat.format(m.reactions)}</span>` : ''}
    </li>`).join('');
  const html = `<ul class="claper-wall">${cards}</ul>`;
  // Redraw only on change, so the cards do not replay their entrance every refresh.
  if (container.dataset.wall !== html) {
    container.innerHTML = html;
    container.dataset.wall = html;
  }
}

async function refresh(target) {
  const { claperApi: api, claperEvent: event, claperPoll: which, claperKind: kind = 'poll' } = target.source.dataset;
  try {
    const rows = await fetchRows(api, kind, event);
    if (kind === 'wall') {
      renderWall(target.results, rows);
      return;
    }
    const poll = kind === 'quiz'
      ? pickQuestion(rows, target.source.dataset.claperQuiz, target.source.dataset.claperQuestion)
      : pickPoll(rows, which);
    renderPoll(target.results, poll, {
      compact: target.compact,
      showTitle: target.compact || which === 'active',
      unit: kind === 'quiz' ? ['antwoord', 'antwoorden'] : undefined
    });
    // claperPoll slides without an explicit title take the question from Claper
    const title = target.source.querySelector('.claper-poll-title');
    if (title && !title.textContent.trim() && poll) title.textContent = poll.title;
  } catch (e) {
    if (!target.results.querySelector('.claper-bars, .claper-wall')) {
      target.results.innerHTML = `<p class="claper-empty">Resultaten niet beschikbaar.</p>`;
    }
    console.warn('Claper results:', e);
  }
}

// ── Presenter control ──────────────────────────────────────────────────────────

const TOKEN_KEY = 'claper-token';

function readToken() {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('claper-token');
  if (fromUrl) {
    const off = fromUrl === 'uit';
    try {
      if (off) localStorage.removeItem(TOKEN_KEY);
      else localStorage.setItem(TOKEN_KEY, fromUrl);
    } catch (e) { /* private mode: only this page load */ }
    // Keep the token off the projector and out of shared links.
    url.searchParams.delete('claper-token');
    window.history.replaceState(window.history.state, '', url);
    return off ? null : fromUrl;
  }
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

function createControl(defaults) {
  // Not in the speaker view's preview frames (they show the *next* slide) or in a PDF export.
  if (window.self !== window.top || /print-pdf/.test(window.location.search)) return null;
  const token = readToken();
  if (!token) return null;

  const toast = document.createElement('div');
  toast.className = 'claper-control-toast';
  toast.hidden = true;
  document.querySelector('.reveal').appendChild(toast);
  let toastTimer;
  const notify = (text, isError = false) => {
    toast.textContent = text;
    toast.classList.toggle('is-error', isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, isError ? 6000 : 2500);
  };

  notify('Claper: presentermodus actief');

  let lastActivated = null;

  const post = async (path, body) => {
    const r = await fetch(`${defaults.claperControl}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
    return json;
  };

  // Start the event once per page load; activations wait for it.
  const started = post('start', { event: defaults.claperEvent })
    .then((r) => { if (r.changed) notify('Claper: event gestart'); })
    .catch((e) => {
      notify(`Claper: event starten mislukt (${e.message})`, true);
      console.warn('Claper control:', e);
    });

  // What a slide asks to open: its own data-claper-activate, its claperPoll id, or the
  // data-claper-activate of its parent (horizontal) section. "5" is a poll, "quiz:9" a quiz,
  // "form:3" a form.
  const pollFor = (slide) => {
    if (slide.dataset.claperActivate) return slide.dataset.claperActivate;
    if (slide.dataset.claperEvent && (slide.dataset.claperKind || 'poll') === 'poll' && slide.dataset.claperPoll !== 'active') return slide.dataset.claperPoll;
    const parent = slide.parentElement.closest('section');
    return parent && parent.dataset.claperActivate ? parent.dataset.claperActivate : null;
  };

  startReactions(defaults, token, notify);

  const NAMES = { poll: 'vraag', quiz: 'quiz', form: 'formulier' };

  return async (slide) => {
    const target = slide && pollFor(slide);
    if (!target) return;
    const [kind, id] = target.includes(':') ? target.split(':') : ['poll', target];
    const event = slide.dataset.claperEvent || defaults.claperEvent;
    const key = `${event}:${kind}:${id}`;
    if (key === lastActivated) return;
    lastActivated = key;
    try {
      await started;
      await post('activate', { event, [kind]: Number(id) });
      notify(`Claper: ${NAMES[kind] || kind} ${id} geopend`);
    } catch (e) {
      lastActivated = null;
      notify(`Claper: ${NAMES[kind] || kind} ${id} openen mislukt (${e.message})`, true);
      console.warn('Claper control:', e);
    }
  };
}

// ── Live reactions ─────────────────────────────────────────────────────────────

const REACTIONS = { heart: '❤️', clap: '👏', hundred: '💯', raisehand: '✋' };
const REACTIONS_MS = 2000;
const REACTIONS_MAX_BURST = 12;

function startReactions(defaults, token, notify) {
  const layer = document.createElement('div');
  layer.className = 'claper-reactions';
  layer.setAttribute('aria-hidden', 'true');
  document.querySelector('.reveal').appendChild(layer);

  const float = (emoji, delay) => {
    const el = document.createElement('span');
    el.className = 'claper-reaction';
    el.textContent = emoji;
    el.style.right = `${20 + Math.random() * 140}px`;
    el.style.animationDelay = `${delay}ms`;
    el.addEventListener('animationend', () => el.remove());
    layer.appendChild(el);
  };

  // Only on slides that ask for it, and only the types they list. Entering such a slide takes a
  // fresh baseline, so reactions sent earlier do not all burst out at once.
  const allowedHere = () => {
    const slide = document.querySelector('.reveal .slides section.present[data-claper-reactions]:not(.stack)')
      || document.querySelector('.reveal .slides section.present.stack[data-claper-reactions]');
    return slide ? slide.dataset.claperReactions.split(',').map((t) => t.trim()) : null;
  };
  let last = null;
  let warned = false; // say once that reactions are unavailable, instead of failing silently
  const fail = (reason) => {
    if (warned) return;
    warned = true;
    notify(`Claper: reacties niet beschikbaar (${reason})`, true);
  };
  const tick = async () => {
    const allowed = allowedHere();
    if (!allowed) {
      last = null;
      return;
    }
    if (document.hidden) return;
    try {
      const r = await fetch(`${defaults.claperControl}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event: defaults.claperEvent })
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        fail(body.error || `HTTP ${r.status}`);
        return;
      }
      warned = false;
      const { counts = {} } = await r.json();
      if (last) {
        const fresh = [];
        for (const [type, n] of Object.entries(counts)) {
          if (!allowed.includes(type) || !REACTIONS[type]) continue;
          for (let i = last[type] || 0; i < n; i++) fresh.push(REACTIONS[type]);
        }
        fresh.slice(-REACTIONS_MAX_BURST).forEach((emoji, i) => float(emoji, i * (REACTIONS_MS / REACTIONS_MAX_BURST)));
      }
      last = counts;
    } catch (e) {
      // Usually CORS: this page's origin is not in CLAPER_CONTROL_ORIGINS. The rest keeps working.
      fail(`${window.location.origin} niet toegelaten of geen verbinding`);
    }
  };
  tick();
  setInterval(tick, REACTIONS_MS);
}

export function initClaper(Reveal) {
  const slides = Array.from(document.querySelectorAll('.reveal .slides section[data-claper-event]'));
  if (slides.length === 0) return;

  const revealRoot = document.querySelector('.reveal');
  const corner = document.createElement('div');
  corner.className = 'claper-corner';
  corner.hidden = true;
  corner.innerHTML = `<div class="claper-results"></div><div class="claper-join"><div class="claper-qr"></div><p class="claper-join-url"></p></div>`;
  corner.addEventListener('click', () => corner.classList.toggle('is-expanded'));
  revealRoot.appendChild(corner);

  let visible = [];
  let cornerSource = null;
  const activate = createControl(slides[0].dataset);

  // The live slide that applies to `slide`: one in the section right before it.
  const liveSlides = slides.filter((s) => s.hasAttribute('data-claper-live'));
  const findLive = (slide) => {
    const h = Reveal.getIndices(slide).h;
    return liveSlides.find((s) => Reveal.getIndices(s).h === h - 1) || null;
  };

  const update = () => {
    const current = Reveal.getCurrentSlide();
    visible = [];

    if (current && current.hasAttribute('data-claper-event')) {
      visible.push({ source: current, results: current.querySelector('.claper-results'), compact: false });
    }

    const live = current && !current.hasAttribute('data-claper-event')
      ? findLive(current)
      : null;
    if (live && live !== cornerSource) {
      cornerSource = live;
      corner.querySelector('.claper-qr').innerHTML = live.querySelector('.claper-qr').innerHTML;
      corner.querySelector('.claper-join-url').innerHTML = live.querySelector('.claper-join-url').innerHTML;
      corner.querySelector('.claper-results').innerHTML = '';
    }
    corner.hidden = !live || Reveal.isOverview();
    if (corner.hidden) corner.classList.remove('is-expanded');
    else visible.push({ source: cornerSource, results: corner.querySelector('.claper-results'), compact: true });

    visible.forEach(refresh);
    if (activate && current && !Reveal.isOverview()) activate(current);
  };

  setInterval(() => {
    if (!document.hidden) visible.forEach(refresh);
  }, REFRESH_MS);

  Reveal.on('ready', update);
  Reveal.on('slidechanged', update);
  Reveal.on('overviewshown', update);
  Reveal.on('overviewhidden', update);
  update();
}
