// THE FAKE GITHUB — the in-memory repository the whole harness runs against.
//
// It stands in for `src/world/github.mjs`: `port` carries exactly that module's
// names, implemented over the store below, and the scenario levers hang off the
// harness object beside it (see `clock.mjs` for why the two are separate).
//
// TWO SURFACES, ONE STORE. The port's named operations read and write the store
// directly. `port.makeGh` — and `restCall`, the same call for a caller holding a
// token — return a TRANSPORT that routes a REST path onto those same store
// primitives, because the stages under `src/` still thread `gh` through and call
// the real operations over it. Neither surface is a copy of the other: both are
// thin over `issue()`, `addLabelTo()`, `postComment()` and friends, so a
// behaviour modelled once is modelled for both. The router is what retires when
// the stages take a port object instead of a transport.
//
// WHAT IT MODELS, because these are the limitations the mechanism is built
// around and a fake without them proves the easy half:
//
//  - COMMENT IDS ARE SERVER-ASSIGNED AND STRICTLY INCREASING, and comment
//    timestamps have ONE-SECOND granularity. That pair is the whole reason claim
//    arbitration orders by id and never by time.
//  - LABELS ARE DEFINED OBJECTS. Applying a name the repo does not define 422s
//    (behind `unknownLabels422()`, see below), which is why `ensureLabels` runs
//    before anything is assigned.
//  - LABEL WRITES ARE GRANULAR AND A SWAP IS NOT ATOMIC. `tearNextLabelSwap()`
//    lands the remove and fails the add, leaving the item wearing no status —
//    the one thing a torn swap can actually do.
//
// FAULTS ARE OFF BY DEFAULT and switched on per scenario. Every one of them is a
// thing GitHub does to a healthy caller, so a scenario turns one on to say "and
// now the platform misbehaves", never to describe our own code.

const PERM_NONE = 'none';

// A comment's `created_at`, at GitHub's own one-second resolution.
const secondIso = (ms) => new Date(Math.floor(ms / 1000) * 1000).toISOString();

const q = (path) => {
  const i = path.indexOf('?');
  return i === -1 ? new URLSearchParams() : new URLSearchParams(path.slice(i + 1));
};

export function makeGithub({
  clock,
  repo = 'o/r',
  issues = [],
  pulls = [],
  labels = [],
  collaborators = {},
  branches = {},
  commits = {},
  trees = {},
  releases = null,
  runsBySha = {},
} = {}) {
  const nowMs = () => (clock ? clock.ms() : 0);
  const nowIso = () => new Date(nowMs()).toISOString();

  const state = {
    repo,
    issues: issues.map((i) => ({
      comments: [], state: 'open', labels: [], body: '', title: '',
      created_at: nowIso(), updated_at: nowIso(), ...i,
    })),
    pulls: pulls.map((p) => ({ comments: [], state: 'open', merged: false, ...p })),
    labelDefs: new Map(labels.map((l) => [l.name, { ...l }])),
    collaborators: { ...collaborators },
    branches: { ...branches },
    commits: { ...commits },
    trees: { ...trees },
    releases,
    runsBySha: { ...runsBySha },
    // Every `workflow_dispatch` this repo accepted, in order — `actions.mjs`
    // turns each into a run, and a scenario counting billed invocations reads
    // the ledger there rather than this raw list.
    dispatches: [],
    // Every transport call, as "METHOD path". The port's own operations record
    // here too, so an API-call budget is countable whichever surface was used.
    calls: [],
    commentSeq: 100,
  };

  // Faults, each off until a scenario turns it on.
  const faults = {
    rateLimited: 0,        // calls remaining that answer 403
    hidden: new Set(),     // issue numbers a list read cannot see yet
    tearNextSwap: false,   // the next swapLabel's add fails after its remove lands
    dropNextLabeled: false, // the next `labeled` webhook never arrives
    unknownLabels422: false, // applying an undefined label 422s, as GitHub does
    refuseCreateTitled: null, // the next POST /issues with this exact title fails
    unreadable: new Set(),    // issue numbers whose direct read answers 500
  };

  const RATE_LIMITED = () => ({
    status: 403,
    json: { message: 'API rate limit exceeded', documentation_url: 'https://docs.github.com/rest' },
  });

  // Charged once per call on EITHER surface, so a scenario's budget counts what
  // the code actually spends.
  const charge = (label) => {
    state.calls.push(label);
    if (faults.rateLimited > 0) { faults.rateLimited -= 1; return RATE_LIMITED(); }
    return null;
  };

  // --- store primitives ---------------------------------------------------

  const issue = (n) => state.issues.find((i) => i.number === Number(n)) ?? null;
  const pull = (n) => state.pulls.find((p) => p.number === Number(n)) ?? null;
  const nextNumber = () => Math.max(0, ...state.issues.map((i) => i.number), ...state.pulls.map((p) => p.number)) + 1;
  const touch = (i) => { i.updated_at = nowIso(); };

  const visible = (i) => !faults.hidden.has(i.number);

  function newIssue({ title = '', body = '', labels: want = [] }) {
    const it = {
      number: nextNumber(), title, body, labels: [...want], state: 'open',
      created_at: nowIso(), updated_at: nowIso(), comments: [],
    };
    state.issues.push(it);
    return it;
  }

  function postComment(target, body) {
    const c = { id: (state.commentSeq += 1), body, created_at: secondIso(nowMs()) };
    target.comments.push(c);
    if (target.updated_at !== undefined) touch(target);
    announce({ kind: 'comment', issue: target.number, body, id: c.id, at: nowMs() });
    return c;
  }

  function addLabelTo(i, name) {
    if (faults.unknownLabels422 && !state.labelDefs.has(name)) {
      return { status: 422, json: { message: 'Label does not exist' } };
    }
    if (!i.labels.includes(name)) i.labels.push(name);
    touch(i);
    announce({ kind: 'addLabel', issue: i.number, name, at: nowMs() });
    return { status: 200, json: i.labels.map((n) => ({ name: n })) };
  }

  function removeLabelFrom(i, name) {
    const had = i.labels.includes(name);
    i.labels = i.labels.filter((l) => l !== name);
    touch(i);
    // An already-absent label 404s; that is the desired end state, and the real
    // port treats it as success.
    return had ? { status: 200, json: [] } : { status: 404, json: { message: 'Label does not exist' } };
  }

  // --- the transport ------------------------------------------------------
  //
  // One router, matched most-specific first: `/issues/comments/{id}` and
  // `/issues/{n}/comments` both have to beat `/issues/{n}`.

  // How many requests this fake has served, as the real port counts them: every
  // call through the transport, a rate-limited refusal included, because a run
  // that spent its budget on refusals spent it.
  let apiCalls = 0;

  async function route(path, { method = 'GET', body } = {}) {
    apiCalls += 1;
    const limited = charge(`${method} ${path}`);
    if (limited) return limited;
    const bare = path.split('?')[0];
    let m;

    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/.exec(bare))) {
      const id = Number(m[1]);
      for (const holder of [...state.issues, ...state.pulls]) {
        const c = holder.comments.find((x) => x.id === id);
        if (!c) continue;
        if (method === 'PATCH') c.body = body.body;
        return { status: 200, json: c };
      }
      return { status: 404, json: null };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(bare))) {
      const holder = issue(m[1]) ?? pull(m[1]);
      if (!holder) return { status: 404, json: null };
      if (method === 'POST') return { status: 201, json: postComment(holder, body.body) };
      const page = Number(q(path).get('page') ?? 1);
      return { status: 200, json: page === 1 ? holder.comments : [] };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels$/.exec(bare))) {
      const i = issue(m[1]);
      if (!i) return { status: 404, json: null };
      let last = { status: 200, json: [] };
      for (const name of body.labels) last = addLabelTo(i, name);
      return last;
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels\/(.+)$/.exec(bare))) {
      const i = issue(m[1]);
      if (!i) return { status: 404, json: null };
      return removeLabelFrom(i, decodeURIComponent(m[2]));
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(bare))) {
      // TRANSIENTLY UNREADABLE is not GONE, and the difference is the whole of
      // F27: a 500 says nothing about whether the issue exists, so a caller that
      // declined on it would be declining on a guess.
      if (faults.unreadable.has(Number(m[1]))) return { status: 500, json: { message: 'the issue could not be read (injected)' } };
      const i = issue(m[1]);
      if (!i) return { status: 404, json: null };
      if (method === 'PATCH') {
        Object.assign(i, body);
        // `closed_at` is the SERVER's, never the caller's: the whole of the `due:`
        // term's second half reads it, and an item closed with no stamp reads as
        // one that ran and left no trace of when.
        if (body.state === 'closed' && !i.closed_at) i.closed_at = nowIso();
        if (body.state === 'open') i.closed_at = null;
        touch(i);
      }
      return { status: 200, json: i };
    }

    if (/^\/repos\/[^/]+\/[^/]+\/issues$/.test(bare)) {
      if (method === 'POST') {
        // A refused CREATE, which is the one write failure that leaves nothing at
        // all behind: no issue, no trace, and the next run of whatever asked for it
        // simply asks again.
        if (faults.refuseCreateTitled !== null && body?.title === faults.refuseCreateTitled) {
          faults.refuseCreateTitled = null;
          return { status: 500, json: { message: 'the issue could not be created (injected)' } };
        }
        return { status: 201, json: newIssue(body) };
      }
      // The listing. Paging is read off the parsed query, never a `/page=/`
      // regex — that one matches `per_page` first, which is how a list read
      // silently returns page one forever.
      const params = q(path);
      const page = Number(params.get('page') ?? 1);
      const want = params.get('state') ?? 'open';
      const wantLabels = (params.get('labels') ?? '').split(',').filter(Boolean);
      const rows = state.issues
        .filter(visible)
        .filter((i) => want === 'all' || i.state === want)
        .filter((i) => wantLabels.every((l) => i.labels.includes(l)));
      return { status: 200, json: page === 1 ? rows : [] };
    }

    if (/^\/repos\/[^/]+\/[^/]+\/labels$/.test(bare)) {
      if (method !== 'POST') return { status: 404, json: null };
      if (state.labelDefs.has(body.name)) return { status: 422, json: { message: 'already_exists' } };
      state.labelDefs.set(body.name, { ...body });
      return { status: 201, json: { ...body } };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/labels\/(.+)$/.exec(bare))) {
      const name = decodeURIComponent(m[1]);
      const def = state.labelDefs.get(name);
      if (!def) return { status: 404, json: null };
      if (method === 'PATCH') Object.assign(def, body);
      return { status: 200, json: { ...def } };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/collaborators\/([^/]+)\/permission$/.exec(bare))) {
      const login = decodeURIComponent(m[1]);
      return { status: 200, json: { permission: state.collaborators[login] ?? PERM_NONE } };
    }

    if (/^\/repos\/[^/]+\/[^/]+\/pulls$/.test(bare)) {
      return { status: 200, json: state.pulls.filter((p) => p.state === 'open') };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)\/merge$/.exec(bare))) {
      const pr = pull(m[1]);
      if (!pr) return { status: 404, json: null };
      if (pr.state !== 'open') return { status: 405, json: { message: 'Pull Request is not mergeable' } };
      pr.state = 'closed'; pr.merged = true; pr.merged_at = nowIso();
      return { status: 200, json: { merged: true, sha: pr.head?.sha ?? 'merged' } };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/.exec(bare))) {
      const pr = pull(m[1]);
      if (!pr) return { status: 404, json: null };
      if (method === 'PATCH') Object.assign(pr, body);
      return { status: 200, json: pr };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/.exec(bare))) {
      if (method !== 'DELETE') return { status: 404, json: null };
      delete state.branches[decodeURIComponent(m[1])];
      return { status: 204, json: null };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/branches\/(.+)$/.exec(bare))) {
      const b = state.branches[decodeURIComponent(m[1])];
      return b ? { status: 200, json: b } : { status: 404, json: null };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/git\/trees\/(.+)$/.exec(bare))) {
      const t = state.trees[decodeURIComponent(m[1])];
      return t ? { status: 200, json: t } : { status: 404, json: null };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/commits\/(.+)$/.exec(bare))) {
      const c = state.commits[decodeURIComponent(m[1])];
      return c ? { status: 200, json: c } : { status: 404, json: null };
    }

    if (/^\/repos\/[^/]+\/[^/]+\/actions\/runs$/.test(bare)) {
      const sha = q(path).get('head_sha');
      const runs = state.runsBySha[sha] ?? [];
      return { status: 200, json: { total_count: runs.length, workflow_runs: runs } };
    }

    if (/^\/repos\/[^/]+\/[^/]+\/releases\/latest$/.test(bare)) {
      return state.releases ? { status: 200, json: state.releases } : { status: 404, json: null };
    }

    if ((m = /^\/repos\/[^/]+\/[^/]+\/actions\/workflows\/([^/]+)\/dispatches$/.exec(bare))) {
      const fired = { workflow: decodeURIComponent(m[1]), ref: body?.ref ?? null, inputs: body?.inputs ?? null, at: nowMs() };
      state.dispatches.push(fired);
      for (const fn of onDispatch) fn(fired);
      return { status: 204, json: null };
    }

    if (/^\/search\/issues$/.test(bare)) {
      const rows = state.issues.filter(visible);
      return { status: 200, json: { total_count: rows.length, items: rows } };
    }

    return { status: 404, json: null };
  }

  // Whoever wants to hear about a `workflow_dispatch` — `actions.mjs` installs
  // one and turns each into a run.
  const onDispatch = [];

  // Whoever wants to hear about a WRITE, as it lands. The two writes the queue's
  // whole protocol is made of — a comment and a label — announced with the instant
  // they happened at, because the store keeps the label set and not the moment it
  // changed. A scenario reading "when was this claimed" has the comment; one
  // reading "when did this item close" would otherwise have to poll.
  const onWriteFns = [];
  const announce = (event) => { for (const fn of onWriteFns) fn(event); };

  const gh = (path, opts = {}) => route(path, opts);

  // --- the port -----------------------------------------------------------
  //
  // Named operations over the store. They take `gh` first, exactly as the real
  // ones do, and ignore it: the transport they would have used is this same
  // store, and accepting it is what lets a caller hold either surface.

  const port = {
    makeGh: () => gh,
    restCall: (_token, path, opts = {}) => route(path, opts),
    apiCallCount: () => apiCalls,
    resetApiCallCount: () => { apiCalls = 0; },
    // Scriptable, because nothing in the queue calls GraphQL yet and a fake that
    // guessed at a schema would be describing an API nobody here uses.
    graphqlCall: async (_token, query, variables) => graphql(query, variables),

    readIssue: async (_gh, _repo, number) => {
      const r = await route(`/repos/${repo}/issues/${number}`);
      return r.status === 200 ? r.json : null;
    },
    getIssue: (_gh, _repo, number) => route(`/repos/${repo}/issues/${number}`),
    setIssueBody: (_gh, _repo, number, body) => route(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { body } }),
    setIssueTitle: (_gh, _repo, number, title) => route(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { title } }),
    patchIssue: (_gh, _repo, number, body) => route(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body }),
    reopenIssue: (_gh, _repo, number) => route(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { state: 'open' } }),
    postIssue: (_gh, _repo, body) => route(`/repos/${repo}/issues`, { method: 'POST', body }),
    closeIssue: (_gh, _repo, number, stateReason = 'completed') => route(`/repos/${repo}/issues/${number}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: stateReason },
    }),
    createIssue: async (_gh, _repo, { title, body, labels: want = [] }) => {
      const { status, json } = await route(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, labels: want } });
      return { status, number: status >= 200 && status < 300 ? json?.number ?? null : null, json };
    },
    listOpenIssuesPage: (_gh, _repo, page) => route(`/repos/${repo}/issues?state=open&sort=created&direction=asc&per_page=100&page=${page}`),
    listClosedIssuesPage: (_gh, _repo, page) => route(`/repos/${repo}/issues?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`),
    listIssuesByQuery: (_gh, _repo, query) => route(`/repos/${repo}/issues?${query}`),
    searchIssues: (_gh, query) => route(`/search/issues?q=${query}&per_page=100`),

    ensureLabels: async (_gh, _repo, want) => {
      for (const { name, color, description } of want) {
        const res = await route(`/repos/${repo}/labels`, { method: 'POST', body: { name, color, description } });
        if (res.status === 422) {
          await route(`/repos/${repo}/labels/${encodeURIComponent(name)}`, { method: 'PATCH', body: { color, description } });
        }
      }
    },
    addLabel: (_gh, _repo, number, name) => route(`/repos/${repo}/issues/${number}/labels`, { method: 'POST', body: { labels: [name] } }),
    removeLabel: (_gh, _repo, number, name) => route(`/repos/${repo}/issues/${number}/labels/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    swapLabel: async (_gh, _repo, number, from, to) => {
      await port.removeLabel(_gh, _repo, number, from);
      // The torn swap, and the only shape it has: the remove landed, the add did
      // not, and the item is left wearing no status at all.
      if (faults.tearNextSwap) {
        faults.tearNextSwap = false;
        state.calls.push(`POST /repos/${repo}/issues/${number}/labels`);
        return { status: 500, json: { message: 'torn label swap (injected)' } };
      }
      return port.addLabel(_gh, _repo, number, to);
    },

    comment: (_gh, _repo, number, body) => route(`/repos/${repo}/issues/${number}/comments`, { method: 'POST', body: { body } }),
    editComment: (_gh, _repo, commentId, body) => route(`/repos/${repo}/issues/comments/${commentId}`, { method: 'PATCH', body: { body } }),
    listComments: async (_gh, _repo, number) => {
      const { status, json } = await route(`/repos/${repo}/issues/${number}/comments?per_page=100&page=1`);
      return status === 200 && Array.isArray(json) ? json : [];
    },

    collaboratorPermission: (_gh, _repo, login) => route(`/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`),

    listOpenPulls: (_gh, _repo) => route(`/repos/${repo}/pulls?state=open&per_page=100`),
    readPull: (_gh, _repo, number) => route(`/repos/${repo}/pulls/${number}`),
    mergePull: (_gh, _repo, number, body) => route(`/repos/${repo}/pulls/${number}/merge`, { method: 'PUT', body }),
    closePull: (_gh, _repo, number) => route(`/repos/${repo}/pulls/${number}`, { method: 'PATCH', body: { state: 'closed' } }),

    deleteBranchRef: (_gh, _repo, ref) => route(`/repos/${repo}/git/refs/heads/${encodeURIComponent(ref)}`, { method: 'DELETE' }),
    readBranch: (_gh, _repo, branch) => route(`/repos/${repo}/branches/${branch}`),
    readTree: (_gh, _repo, ref) => route(`/repos/${repo}/git/trees/${ref}`),

    readCommit: (_gh, _repo, sha) => route(`/repos/${repo}/commits/${sha}`),
    listRunsForSha: (_gh, _repo, sha) => route(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`),
    latestRelease: (_gh, _repo) => route(`/repos/${repo}/releases/latest`),
    // The real one answers from the run's vars bag, never the API (src/world/github.mjs);
    // the fake carries no run env, and nothing in the engine calls it any more, so it
    // answers "no such variable" — the state of every repo nobody has ever held.
    readRepoVariable: async (_gh, _repo, _name) => ({ status: 404, json: null }),

    dispatchWorkflow: async (_gh, _repo, file, ref, inputs = null) => {
      const { status } = await route(`/repos/${repo}/actions/workflows/${file}/dispatches`, {
        method: 'POST', body: { ref, ...(inputs ? { inputs } : {}) },
      });
      return { ok: status === 204, status };
    },
  };

  let graphql = async () => ({ data: {} });

  const harness = {
    port,
    state,
    gh,
    // Direct reads, for assertions and for the other fakes in this folder.
    find: issue,
    findPull: pull,
    issues: () => state.issues,
    pulls: () => state.pulls,
    labelDefs: () => state.labelDefs,
    dispatches: () => state.dispatches,
    calls: () => state.calls,
    onDispatch: (fn) => { onDispatch.push(fn); return harness; },
    onWrite: (fn) => { onWriteFns.push(fn); return harness; },
    scriptGraphql: (fn) => { graphql = fn; return harness; },

    // Direct writes, for seeding a world and for `humans.mjs`.
    // A number is ASSIGNED when the caller gives none — a seeded issue with no
    // number is unreachable by every read there is, which reads as an empty repo
    // rather than as the mistake it was.
    seedIssue: (fields) => {
      const i = {
        number: nextNumber(), comments: [], state: 'open', labels: [], body: '', title: '',
        created_at: nowIso(), updated_at: nowIso(), ...fields,
      };
      state.issues.push(i);
      return i;
    },
    seedPull: (fields) => {
      const p = { number: nextNumber(), comments: [], state: 'open', merged: false, ...fields };
      state.pulls.push(p);
      return p;
    },
    defineLabels: (defs) => { for (const d of defs) state.labelDefs.set(d.name, { ...d }); return harness; },
    setCollaborator: (login, permission) => { state.collaborators[login] = permission; return harness; },

    // --- faults ---------------------------------------------------------
    rateLimit: (calls) => { faults.rateLimited = calls; return harness; },
    hideFromLists: (number) => { faults.hidden.add(Number(number)); return harness; },
    revealInLists: (number) => { faults.hidden.delete(Number(number)); return harness; },
    tearNextLabelSwap: () => { faults.tearNextSwap = true; return harness; },
    dropNextLabeledEvent: () => { faults.dropNextLabeled = true; return harness; },
    // Asked by whoever would deliver the webhook; consumes the drop.
    takeLabeledEvent: () => {
      if (!faults.dropNextLabeled) return true;
      faults.dropNextLabeled = false;
      return false;
    },
    unknownLabels422: (on = true) => { faults.unknownLabels422 = on; return harness; },
    // The write half of a failing API: the next attempt to file this exact title is
    // refused. Titled rather than "the next one" so a scenario can aim it at one
    // task's item while the rest of a repo's queue goes on being filed.
    refuseNextIssueCreateTitled: (title) => { faults.refuseCreateTitled = title; return harness; },
    // A 500 on this issue's own read: it still exists and still lists, but a
    // caller asking for it by number cannot learn anything about it.
    makeUnreadable: (number, on = true) => {
      if (on) faults.unreadable.add(Number(number)); else faults.unreadable.delete(Number(number));
      return harness;
    },
    // The issue stops existing — a 404 everywhere, which is a FACT about the world
    // rather than a fault in reaching it.
    deleteIssue: (number) => {
      state.issues = state.issues.filter((i) => i.number !== Number(number));
      return harness;
    },
    faults,
  };
  return harness;
}
