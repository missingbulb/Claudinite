// The shell: configure, authenticate, and route between the two views.
//
// TWO MODES, DECIDED BY THE DEPLOYMENT'S SHAPE. A config that says where more than one
// member comes from — an `owner` to enumerate, a roster artifact, an explicit list — is
// a FLEET deployment and opens on the overview; anything else is one repo's own page
// and opens straight on it, with no pointless one-row fleet view. Not a mode switch
// anyone sets: the roster source IS the mode, so there is nothing to keep in step.
//
// ROUTING WITHIN A MODE IS THE URL. `?repo=` is the deep dive, its absence the landing
// view, so every view is a link someone can send and the back button works.

import * as gh from './github.mjs';
import * as auth from './auth.mjs';
import { loadConfig, resolveRoster, isFleetConfig } from './config.mjs';
import { clearAll, stats } from './cache.mjs';
import { planPolicy, credentialAdvice, MINUTE_MS } from './budget.mjs';
import { $, el, resetCountUps } from './ui.mjs';
import { loadRepo } from './view-repo.mjs';
import { loadFleet } from './view-fleet.mjs';

let CONFIG = null;
let ROSTER = [];

const showError = (msg) => $('errors').append(el('div', { className: 'err', textContent: msg }));
const showNotice = (msg) => $('errors').append(el('div', { className: 'notice', textContent: msg }));

// --- rate budget ----------------------------------------------------------------

// How this load will be paid for, decided BEFORE it starts. The budget is whatever
// GitHub last told us — carried across page loads, and confirmed by the free
// `/rate_limit` preflight when it has aged — so a fresh tab plans on the real number
// instead of discovering the limit by running into it.
async function planBudget(token) {
  const carried = gh.restoreRate();
  // The preflight costs no primary budget. Skipped only when the carried number is
  // young enough to still be true.
  if (!Number.isFinite(gh.rate.remaining) || Date.now() - (carried?.at ?? 0) > 2 * MINUTE_MS) {
    await gh.preflightRate(token);
  }
  const plan = planPolicy({
    remaining: gh.rate.remaining,
    limit: gh.rate.limit,
    reset: gh.rate.reset,
    memberCount: wantsFleet() ? ROSTER.length : 1,
  });
  gh.setPolicy(plan);
  return plan;
}

// The pill is the honest version of "why is this not fresh". A page that quietly
// serves an hour-old fleet without saying so is worse than one that refuses.
//
// It is LIVE, not a reading taken at the start. The plan is decided before the sweep
// and the sweep is what spends the budget, so a pill drawn once — as this was — shows
// the viewer the number from before every request that would have changed it. The
// figure a viewer opens this for is what is left NOW.
//
// The plan itself is not re-decided mid-load: this load reads under the policy it was
// planned with, and re-planning halfway would make a row's freshness depend on where
// in the sweep it happened to land. Only the number moves.
let currentPlan = null;
let pillQueued = false;

function renderRatePill(plan = currentPlan) {
  if (!plan) return;
  currentPlan = plan;
  const pill = $('rate');
  pill.hidden = false;
  pill.className = `pill${plan.mode === 'frozen' || plan.mode === 'scarce' ? ' stop-pill' : (plan.mode === 'low' || plan.mode === 'tight' ? ' warn-pill' : '')}`;
  const left = Number.isFinite(gh.rate.remaining) ? `${gh.rate.remaining}/${gh.rate.limit ?? '?'}` : 'budget unknown';
  const held = plan.minAge > 0 ? ` · cached ${Math.round(plan.minAge / MINUTE_MS)}m` : '';
  const spent = gh.rate.spent ? ` · −${gh.rate.spent} this load` : '';
  pill.textContent = `${left} · ${plan.tier}${held}${spent}`;
  pill.title = `${plan.reason}\nthis load so far: ${gh.rate.spent} spent, ${gh.rate.revalidated} revalidated free, ${gh.rate.served} from cache`;
}

// A fleet sweep can restate the budget eighty times in a few seconds. Redrawing the
// pill on each would be eighty layouts for a number the eye reads once, so the
// arrivals are coalesced onto the next frame.
function ratePillLater() {
  if (pillQueued || !currentPlan) return;
  pillQueued = true;
  const draw = () => { pillQueued = false; renderRatePill(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(draw);
  else draw();
}

const repoParam = () => new URL(location.href).searchParams.get('repo');
// The fleet view is what a fleet DEPLOYMENT opens on, decided by the config's shape
// rather than by how many members the enumeration happened to return: a fleet whose
// roster read failed, or one that is momentarily down to a single readable member, is
// still a fleet page and must say so rather than silently becoming that member's own.
const wantsFleet = () => !repoParam() && isFleetConfig(CONFIG);
const currentRepo = () => repoParam() || CONFIG?.defaultRepo || ROSTER[0] || '';

function go(repo) {
  const url = new URL(location.href);
  if (repo) url.searchParams.set('repo', repo);
  else url.searchParams.delete('repo');
  history.pushState(null, '', url);
  render();
}

// --- chrome ---------------------------------------------------------------------

function renderAuth(viewer) {
  const box = $('auth');
  box.replaceChildren();

  if (viewer) {
    box.append(
      el('img', { className: 'avatar', src: viewer.avatar_url, alt: '', width: 22, height: 22 }),
      el('span', { className: 'hint', textContent: viewer.login }),
      // Signing out drops the CACHE as well as the credential. Everything stored was
      // read as this person — a private repo's issues included — and a token that dies
      // with the tab while its data outlives it on a shared machine is not a sign-out.
      el('button', { textContent: 'Sign out', onclick: () => { auth.signOut(); clearAll(); location.reload(); } }),
    );
    return;
  }
  if (auth.isOAuthConfigured(CONFIG)) {
    box.append(el('button', { className: 'primary', textContent: 'Sign in with GitHub', onclick: () => auth.beginSignIn(CONFIG) }));
    return;
  }
  const input = el('input', { type: 'password', placeholder: 'GitHub token', autocomplete: 'off' });
  const use = () => { auth.setPastedToken(input.value); render(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') use(); });
  box.append(input, el('button', { textContent: 'Use token', onclick: use }));
}

// The breadcrumb is the way back out of a deep dive, and it only exists when there is
// somewhere to go back to.
function renderCrumb(repo) {
  const crumb = $('crumb');
  crumb.replaceChildren();
  if (!repo || ROSTER.length <= 1) { crumb.hidden = true; return; }
  crumb.hidden = false;
  crumb.append(
    el('a', { href: '?', textContent: '← Fleet', onclick: (e) => { e.preventDefault(); go(null); } }),
    el('span', { className: 'sep', textContent: '/' }),
    el('select', {
      title: 'Switch repository',
      onchange: (e) => go(e.target.value),
    }, [...new Set([repo, ...ROSTER])].sort().map((n) =>
      el('option', { value: n, textContent: n, selected: n === repo }))),
  );
}

// Switching views is not a change in a number, it is a DIFFERENT set of numbers under
// the same labels — so the counters forget rather than tween from one to the other and
// draw a movement nothing made.
const showView = (which, repo = null) => {
  if ($('fleet-view').hidden !== (which !== 'fleet')) resetCountUps();
  $('fleet-view').hidden = which !== 'fleet';
  $('repo-view').hidden = which !== 'repo';
  // The heading says what you are looking at. A repo-mode deployment titled "Fleet
  // status" is the page telling its one member it is something else.
  const title = which === 'fleet' ? 'Fleet status' : (repo ? repo.split('/')[1] ?? repo : 'Claudinite');
  $('title').textContent = title;
  document.title = which === 'fleet' ? 'Fleet status' : `${title} · Claudinite`;
};

function footer(parts) {
  const c = stats();
  // The bar carries the short version; the footer below carries the full accounting.
  $('footnote').textContent = [
    ...parts,
    `this load: ${gh.rate.spent} API calls, ${gh.rate.revalidated} revalidated free, ${gh.rate.served} from cache`
      + (gh.rate.withheld ? `, ${gh.rate.withheld} withheld to save rate limit` : ''),
    `cache ${(c.bytes / 1024).toFixed(0)}KB in ${c.entries} entries`,
    `read ${new Date().toISOString().replace('T', ' ').slice(0, 16)}Z`,
  ].join(' · ');
}

// --- render ---------------------------------------------------------------------

let inFlight = false;

async function render() {
  if (inFlight) return;
  inFlight = true;
  $('errors').replaceChildren();
  $('reload').disabled = true;

  const token = auth.currentToken();
  // The roster is resolved inside the load, not at boot: an `owner` deployment
  // enumerates as the VIEWER, so it needs the credential — and the enumeration is
  // ETag-revalidated, which makes re-resolving it per load free once warm.
  const roster = await resolveRoster(CONFIG, token, gh);
  ROSTER = roster.repos;
  const plan = await planBudget(token);
  renderRatePill(plan);
  const advice = credentialAdvice(plan.tier, { oauth: auth.isOAuthConfigured(CONFIG), hasToken: Boolean(token) });
  if (advice) showNotice(advice.text);
  if (plan.mode === 'frozen' || plan.mode === 'scarce') showNotice(plan.reason);

  let viewer = null;
  try {
    if (token) viewer = await gh.getViewer(token);
  } catch (e) {
    if (e.status === 401) { auth.signOut(); showError('That credential is no longer valid — sign in again.'); }
  }
  renderAuth(viewer);

  try {
    if (wantsFleet()) {
      renderCrumb(null);
      showView('fleet');
      $('footnote').textContent = `Reading ${ROSTER.length} members…`;
      if (roster.error) showError('The owner\'s repositories could not be listed — sign in with an account that can see them.');
      else if (!roster.complete) showNotice('This owner has more repositories than one enumeration reaches; the fleet below is the most recently pushed of them.');
      await loadFleet({
        repos: ROSTER,
        token,
        config: CONFIG,
        onOpen: go,
        onError: showError,
        // The fleet is read in passes across the whole roster rather than member by
        // member (`fleet-sweep.mjs`), so the line names the pass as well as its
        // position in it — otherwise a counter that reaches the roster's length four
        // times over reads as the page starting again.
        onProgress: ({ label, done, total, repo }) => {
          $('footnote').textContent = `${label} — ${done}/${total}${repo ? ` — ${repo}` : ''}…`;
        },
      });
      footer([`${ROSTER.length} members${roster.source === 'owner' ? ` under ${CONFIG.owner}, as you can see them` : ''}`]);
    } else {
      const repo = currentRepo();
      if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
        showError('No repo selected. Add ?repo=owner/name, or configure a roster.');
        $('footnote').textContent = '';
        return;
      }
      renderCrumb(repo);
      showView('repo', repo);
      $('footnote').textContent = `Reading ${repo}…`;
      const r = await loadRepo({ repo, token, config: CONFIG, onError: showError });
      footer([
        `${repo} @ ${r.branch} (${r.sha.slice(0, 7)})`,
        `${r.taskCount} declared tasks`,
        `${r.itemCount} work items in the ${r.issuePage.complete
          ? `full issue history (${r.issuePage.scanned} issues)`
          : `most recent ${r.issuePage.scanned} issues — older history not scanned`}`,
        // The past-data plane's own freshness, which is NOT this load's: the panels
        // reaching further back than the live window are only as current as the repo's
        // last fold, and a page that showed one timestamp for both would be claiming
        // the older half is as fresh as the newer.
        r.usage
          ? `usage folded ${r.generated ? r.generated.replace('T', ' ').slice(0, 16) : 'at an unstated time'}`
          : 'no usage fold — past-data panels are limited to the live window',
      ]);
    }
    $('setup').open = false;
  } catch (e) {
    showError(e.message ?? String(e));
    if (e.status === 401 || e.status === 403) {
      showError(auth.isOAuthConfigured(CONFIG)
        ? 'Sign in with an account that can read this.'
        : 'That token cannot read this — it needs read-only Contents, Issues and Actions.');
    }
    $('footnote').textContent = '';
  } finally {
    inFlight = false;
    $('reload').disabled = false;
    // The last word on what this load cost, after the coalesced updates have stopped.
    renderRatePill();
  }
}

// --- boot ---------------------------------------------------------------------

async function boot() {
  CONFIG = await loadConfig();

  // Handle an OAuth landing before anything reads the credential.
  const back = await auth.completeSignIn(CONFIG);
  if (back.status === 'error') showError(back.message);

  renderAuth(null);

  // The pill tracks the budget as the sweep spends it, rather than reporting what it
  // was before the sweep began.
  gh.onRateChange(ratePillLater);

  $('reload').addEventListener('click', render);
  // Each heading can say why its numbers are worth reading. The text lives in the
  // markup beside the heading it explains, so there is no second copy in the code.
  for (const b of document.querySelectorAll('button.info')) {
    b.addEventListener('click', () => {
      // A heading may explain itself in more than one paragraph (`info-x`, `info-x-2`,
      // …); they open and close together, since they are one explanation. Counted up
      // until one is missing rather than checked against a fixed pair — a third
      // paragraph used to be written, sit in the markup and never open.
      const bodies = [];
      for (let i = 1; ; i += 1) {
        const body = $(`info-${b.dataset.info}${i === 1 ? '' : `-${i}`}`);
        if (!body) break;
        bodies.push(body);
      }
      if (!bodies.length) return;
      const show = bodies[0].hidden;
      for (const body of bodies) body.hidden = !show;
      b.setAttribute('aria-expanded', String(show));
    });
  }
  $('purge').addEventListener('click', () => { clearAll(); resetCountUps(); render(); });
  // A panel that floats over the page has to close the way one does — clicking away
  // from it, not only by finding the control that opened it again.
  document.addEventListener('click', (e) => {
    const setup = $('setup');
    if (setup.open && !setup.contains(e.target)) setup.open = false;
  });
  $('theme').addEventListener('click', () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const cur = document.documentElement.dataset.theme || (dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  });
  // Back/forward move between the fleet and a deep dive, because the views are URLs.
  addEventListener('popstate', render);

  // Something to show without asking first: a credential, a repo named in the URL, or a
  // deployment that knows what it covers. The roster itself is no longer part of that
  // test — an `owner` deployment cannot enumerate anything until there is a credential
  // to enumerate as.
  if (auth.currentToken() || repoParam() || isFleetConfig(CONFIG) || CONFIG?.defaultRepo) render();
  else { showView('repo'); $('setup').open = true; }
}

boot();
