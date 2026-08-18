// The shell: configure, authenticate, and route between the two views.
//
// ROUTING IS THE URL. No `?repo=` and a roster with more than one member means the
// fleet; anything else means that repo. So the fleet page is what a fleet deployment
// opens on, a single-member deployment goes straight to its own dashboard with no
// pointless one-row overview, and every view is a link someone can send.

import * as gh from './github.mjs';
import * as auth from './auth.mjs';
import { loadConfig, loadRoster } from './config.mjs';
import { clearAll, stats } from './cache.mjs';
import { planPolicy, credentialAdvice, MINUTE_MS } from './budget.mjs';
import { $, el } from './ui.mjs';
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
function renderRatePill(plan) {
  const pill = $('rate');
  pill.hidden = false;
  pill.className = `pill${plan.mode === 'frozen' || plan.mode === 'scarce' ? ' stop-pill' : (plan.mode === 'low' || plan.mode === 'tight' ? ' warn-pill' : '')}`;
  const left = Number.isFinite(gh.rate.remaining) ? `${gh.rate.remaining}/${gh.rate.limit ?? '?'}` : 'budget unknown';
  const held = plan.minAge > 0 ? ` · cached ${Math.round(plan.minAge / MINUTE_MS)}m` : '';
  pill.textContent = `${left} · ${plan.tier}${held}`;
  pill.title = plan.reason;
}

const repoParam = () => new URL(location.href).searchParams.get('repo');
const wantsFleet = () => !repoParam() && ROSTER.length > 1;
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
      el('button', { textContent: 'Sign out', onclick: () => { auth.signOut(); location.reload(); } }),
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

const showView = (which) => {
  $('fleet-view').hidden = which !== 'fleet';
  $('repo-view').hidden = which !== 'repo';
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
      await loadFleet({
        repos: ROSTER,
        token,
        config: CONFIG,
        onOpen: go,
        onError: showError,
        onProgress: (done, total, repo) => { $('footnote').textContent = `Reading ${done}/${total} — ${repo}…`; },
      });
      footer([`${ROSTER.length} members`]);
    } else {
      const repo = currentRepo();
      if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
        showError('No repo selected. Add ?repo=owner/name, or configure a roster.');
        $('footnote').textContent = '';
        return;
      }
      renderCrumb(repo);
      showView('repo');
      $('footnote').textContent = `Reading ${repo}…`;
      const r = await loadRepo({ repo, token, onError: showError });
      footer([
        `${repo} @ ${r.branch} (${r.sha.slice(0, 7)})`,
        `${r.taskCount} declared tasks`,
        `${r.itemCount} work items in the ${r.issuePage.complete
          ? `full issue history (${r.issuePage.scanned} issues)`
          : `most recent ${r.issuePage.scanned} issues — older history not scanned`}`,
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
  }
}

// --- boot ---------------------------------------------------------------------

async function boot() {
  CONFIG = await loadConfig();

  // Handle an OAuth landing before anything reads the credential.
  const back = await auth.completeSignIn(CONFIG);
  if (back.status === 'error') showError(back.message);

  ROSTER = await loadRoster(CONFIG);
  renderAuth(null);

  $('reload').addEventListener('click', render);
  // Each heading can say why its numbers are worth reading. The text lives in the
  // markup beside the heading it explains, so there is no second copy in the code.
  for (const b of document.querySelectorAll('button.info')) {
    b.addEventListener('click', () => {
      const body = $(`info-${b.dataset.info}`);
      if (!body) return;
      body.hidden = !body.hidden;
      b.setAttribute('aria-expanded', String(!body.hidden));
    });
  }
  $('purge').addEventListener('click', () => { clearAll(); render(); });
  $('theme').addEventListener('click', () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const cur = document.documentElement.dataset.theme || (dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  });
  // Back/forward move between the fleet and a deep dive, because the views are URLs.
  addEventListener('popstate', render);

  if (auth.currentToken() || ROSTER.length || repoParam()) render();
  else { showView('repo'); $('setup').open = true; }
}

boot();
