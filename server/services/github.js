// server/services/github.js
// GitHub REST API — supports multiple repos via GITHUB_REPOS=owner/repo1,owner/repo2
// Falls back to GITHUB_OWNER + GITHUB_REPO for single-repo setups.

const BASE = 'https://api.github.com';

// ─── Repo list ────────────────────────────────────────────────────────────────

function cleanName(s) {
  return s.replace(/[()|\s]/g, '').trim();
}

export function getRepos(creds = {}) {
  const repos = creds.GITHUB_REPOS;
  if (repos) {
    return repos.split(',').map(r => cleanName(r)).filter(Boolean);
  }
  const owner = cleanName(creds.GITHUB_OWNER ?? '');
  const repo  = creds.GITHUB_REPO ?? '';
  if (owner && repo &&
      owner !== 'your_github_username' &&
      repo  !== 'your_repo_name') {
    return repo.split(',').map(r => `${owner}/${cleanName(r)}`).filter(r => !r.endsWith('/'));
  }
  return [];
}

export function isConfigured(creds = {}) {
  const t = creds.GITHUB_TOKEN;
  return !!(t && t !== 'your_github_personal_access_token' && getRepos(creds).length > 0);
}

function resolveRepo(hint, creds = {}) {
  const repos = getRepos(creds);
  if (!hint) return repos[0];
  const lower = hint.toLowerCase();
  return (
    repos.find(r => r.toLowerCase() === lower) ??
    repos.find(r => r.split('/')[1].toLowerCase() === lower) ??
    repos[0]
  );
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function ghHeaders(creds = {}) {
  return {
    Authorization:          `Bearer ${creds.GITHUB_TOKEN}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':         'application/json',
  };
}

async function ghGraphQL(query, variables = {}, creds = {}) {
  if (!isConfigured(creds)) throw new Error('GitHub not configured');
  const res = await fetch('https://api.github.com/graphql', {
    method:  'POST',
    headers: ghHeaders(creds),
    body:    JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function ghFetch(path, creds = {}) {
  if (!isConfigured(creds)) return null;
  try {
    const res = await fetch(`${BASE}${path}`, { headers: ghHeaders(creds) });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
    return res.json();
  } catch (err) {
    console.error('[github]', err.message);
    return null;
  }
}

async function ghPatch(path, body, creds = {}) {
  if (!isConfigured(creds)) throw new Error('GitHub not configured');
  const res = await fetch(`${BASE}${path}`, {
    method:  'PATCH',
    headers: ghHeaders(creds),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    let msg;
    try { const j = await res.json(); msg = j.message ?? JSON.stringify(j); } catch { msg = `HTTP ${res.status}`; }
    const num = path.match(/\/issues\/(\d+)/)?.[1] ?? path.match(/\/pulls\/(\d+)/)?.[1];
    if (res.status === 404) throw new Error(`Issue/PR #${num ?? '?'} not found — it may have been deleted or never existed.`);
    if (res.status === 410) throw new Error(`Issue #${num ?? '?'} no longer exists on GitHub (it was permanently deleted).`);
    if (res.status === 403) throw new Error(`GitHub permission denied — token needs Issues: Write access.`);
    throw new Error(`GitHub ${res.status}: ${msg}`);
  }
  return res.json();
}

async function ghPost(path, body, creds = {}) {
  if (!isConfigured(creds)) throw new Error('GitHub not configured');
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: ghHeaders(creds),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    let msg;
    try {
      const json = await res.json();
      msg = json.message ?? JSON.stringify(json);
    } catch { msg = `HTTP ${res.status}`; }

    if (res.status === 404) {
      // Extract repo from path for a clearer message
      const repoMatch = path.match(/\/repos\/([^/]+\/[^/]+)\//);
      const repo = repoMatch ? repoMatch[1] : path;
      throw new Error(
        `Repo "${repo}" not found (404). Check: (1) the repo name is correct, ` +
        `(2) your fine-grained token has "Issues: Read & Write" access to this repo.`
      );
    }
    if (res.status === 403) throw new Error(`GitHub permission denied for ${path} — token missing "Issues: Write" scope.`);
    if (res.status === 410) throw new Error(`Issues are disabled on this repository.`);
    throw new Error(`GitHub ${res.status}: ${msg}`);
  }
  return res.json();
}

// ─── Pull Requests ────────────────────────────────────────────────────────────

export async function getOpenPRs(repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) return [];
  const data = await ghFetch(`/repos/${repo}/pulls?state=open&per_page=20`, creds);
  if (!data) return [];
  return data.map(pr => ({
    id:        pr.number,
    title:     pr.title,
    author:    pr.user?.login,
    branch:    pr.head?.ref,
    url:       pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    reviewers: pr.requested_reviewers?.map(r => r.login) ?? [],
    daysStale: Math.floor((Date.now() - new Date(pr.updated_at)) / 86400000),
    repo,
  }));
}

export async function scanStalePRs(thresholdDays = 3, repoHint, creds = {}) {
  const prs = await getOpenPRs(repoHint, creds);
  return prs.filter(pr => pr.daysStale >= thresholdDays);
}

export async function getMergedPRs(since, repoHint, creds = {}) {
  const repo     = resolveRepo(repoHint, creds);
  if (!repo) return [];
  const sinceISO = since ?? new Date(Date.now() - 7 * 86400000).toISOString();
  const data     = await ghFetch(`/repos/${repo}/pulls?state=closed&per_page=30&sort=updated&direction=desc`, creds);
  if (!data) return [];
  return data
    .filter(pr => pr.merged_at && pr.merged_at > sinceISO)
    .map(pr => ({
      id:       pr.number,
      title:    pr.title,
      author:   pr.user?.login,
      mergedAt: pr.merged_at,
      body:     pr.body ?? '',
      labels:   pr.labels?.map(l => l.name) ?? [],
      url:      pr.html_url,
      repo,
    }));
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export async function getIssues(state = 'open', repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) return [];
  const data = await ghFetch(`/repos/${repo}/issues?state=${state}&per_page=20`, creds);
  if (!data) return [];
  return data
    .filter(i => !i.pull_request)
    .map(i => ({
      id:        i.number,
      title:     i.title,
      body:      i.body ?? '',
      state:     i.state,
      author:    i.user?.login,
      labels:    i.labels?.map(l => l.name) ?? [],
      url:       i.html_url,
      createdAt: i.created_at,
      repo,
    }));
}

export async function createIssue(title, body = '', labels = [], repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) throw new Error('GitHub not configured');
  const data = await ghPost(`/repos/${repo}/issues`, {
    title,
    body,
    ...(labels.length && { labels }),
  }, creds);
  return {
    id:    data.number,
    title: data.title,
    url:   data.html_url,
    state: data.state,
    repo,
  };
}

// ─── Changelog ────────────────────────────────────────────────────────────────

export async function generateChangelog(since, repoHint, creds = {}) {
  const prs = await getMergedPRs(since, repoHint, creds);
  if (!prs.length) return '## No merged PRs in this period.';

  const features = prs.filter(p => p.labels.includes('feature') || p.title.match(/^feat/i));
  const fixes    = prs.filter(p => p.labels.includes('bug')     || p.title.match(/^fix/i));
  const others   = prs.filter(p => !features.includes(p) && !fixes.includes(p));

  const lines = ['## Changelog\n'];
  if (features.length) {
    lines.push('### Features');
    features.forEach(p => lines.push(`- ${p.title} ([#${p.id}](${p.url}))`));
  }
  if (fixes.length) {
    lines.push('\n### Bug fixes');
    fixes.forEach(p => lines.push(`- ${p.title} ([#${p.id}](${p.url}))`));
  }
  if (others.length) {
    lines.push('\n### Other');
    others.forEach(p => lines.push(`- ${p.title} ([#${p.id}](${p.url}))`));
  }
  return lines.join('\n');
}

// ─── Issue CRUD ───────────────────────────────────────────────────────────────

export async function deleteIssue(issueNumber, repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) throw new Error('repo is required');

  const res = await fetch(`${BASE}/repos/${repo}/issues/${issueNumber}`, { headers: ghHeaders(creds) });
  if (res.status === 404 || res.status === 410) {
    const open = await getIssues('open', repoHint, creds);
    const list = open.length ? open.map(i => `#${i.id} ${i.title}`).join(' | ') : 'none';
    throw new Error(`Issue #${issueNumber} not found in ${repo}. Open issues: ${list}`);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} fetching issue #${issueNumber}`);
  const issue  = await res.json();
  const nodeId = issue.node_id;

  await ghGraphQL(
    `mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ repository { name } } }`,
    { id: nodeId },
    creds
  );

  return { deleted: true, id: issueNumber, title: issue.title, repo };
}

export async function closeIssue(issueNumber, repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) throw new Error('repo is required');
  const data = await ghPatch(`/repos/${repo}/issues/${issueNumber}`, { state: 'closed' }, creds);
  return { id: data.number, title: data.title, state: data.state, url: data.html_url, repo };
}

export async function reopenIssue(issueNumber, repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) throw new Error('repo is required');
  const data = await ghPatch(`/repos/${repo}/issues/${issueNumber}`, { state: 'open' }, creds);
  return { id: data.number, title: data.title, state: data.state, url: data.html_url, repo };
}

export async function updateIssue(issueNumber, patches = {}, repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) throw new Error('repo is required');
  const body = {};
  if (patches.title  !== undefined) body.title  = patches.title;
  if (patches.body   !== undefined) body.body   = patches.body;
  if (patches.labels !== undefined) body.labels = patches.labels;
  if (patches.state  !== undefined) body.state  = patches.state;
  const data = await ghPatch(`/repos/${repo}/issues/${issueNumber}`, body, creds);
  return { id: data.number, title: data.title, state: data.state, url: data.html_url, repo };
}

export async function commentOnIssue(issueNumber, body, repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) throw new Error('repo is required');
  const data = await ghPost(`/repos/${repo}/issues/${issueNumber}/comments`, { body }, creds);
  return { id: data.id, url: data.html_url };
}

// ─── PR actions ───────────────────────────────────────────────────────────────

export async function closePR(prNumber, repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) throw new Error('repo is required');
  const data = await ghPatch(`/repos/${repo}/pulls/${prNumber}`, { state: 'closed' }, creds);
  return { id: data.number, title: data.title, state: data.state, url: data.html_url, repo };
}

// ─── Contributions (last 30 days via user events) ─────────────────────────────

export async function getContributions(repoHint, creds = {}) {
  const repos = getRepos(creds);
  if (!repos.length) return null;
  const owner   = repos[0].split('/')[0];
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const events = await ghFetch(`/users/${owner}/events?per_page=100`, creds);
  if (!events) return { totalCommits: 0, dailyActivity: [], streak: 0, prsOpened: 0, reviewsDone: 0 };

  const recentEvents = events.filter(e => e.created_at > since30);

  // Daily commit map
  const dailyMap = {};
  let totalCommits = 0;
  for (const e of recentEvents) {
    if (e.type !== 'PushEvent') continue;
    const day   = e.created_at.slice(0, 10);
    const count = e.payload?.commits?.length ?? 1;
    dailyMap[day] = (dailyMap[day] || 0) + count;
    totalCommits += count;
  }

  // Build 30-day array (oldest → newest)
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d   = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: dailyMap[key] || 0 });
  }

  // Streak = consecutive active days backwards from today
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) streak++;
    else break;
  }

  return {
    totalCommits,
    dailyActivity: days,
    streak,
    prsOpened:   recentEvents.filter(e => e.type === 'PullRequestEvent' && e.payload?.action === 'opened').length,
    reviewsDone: recentEvents.filter(e => e.type === 'PullRequestReviewEvent').length,
    author: owner,
  };
}

// ─── Branches with stale detection ───────────────────────────────────────────

export async function getBranches(repoHint, creds = {}) {
  const repo = resolveRepo(repoHint, creds);
  if (!repo) return [];

  const branches = await ghFetch(`/repos/${repo}/branches?per_page=50`, creds);
  if (!branches) return [];

  const now = Date.now();

  // Fetch last commit date for each branch in parallel (capped at 30)
  const results = await Promise.all(branches.slice(0, 30).map(async b => {
    try {
      const commits = await ghFetch(
        `/repos/${repo}/commits?sha=${encodeURIComponent(b.name)}&per_page=1`,
        creds
      );
      const latest  = commits?.[0];
      const date    = latest?.commit?.committer?.date ?? latest?.commit?.author?.date ?? null;
      const daysOld = date ? Math.floor((now - new Date(date)) / 86400000) : null;
      return {
        name:      b.name,
        sha:       b.commit.sha.slice(0, 7),
        protected: b.protected,
        lastCommit: date,
        daysOld,
        stale:     daysOld !== null && daysOld >= 14,
        isDefault: b.name === 'main' || b.name === 'master',
      };
    } catch {
      return { name: b.name, sha: b.commit.sha.slice(0, 7), protected: b.protected, lastCommit: null, daysOld: null, stale: false, isDefault: false };
    }
  }));

  // Default branch first, then most recent activity
  return results.sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    if (a.daysOld === null) return 1;
    if (b.daysOld === null) return -1;
    return a.daysOld - b.daysOld;
  });
}

export default { isConfigured, getRepos, getOpenPRs, scanStalePRs, getMergedPRs, getIssues, createIssue, deleteIssue, closeIssue, reopenIssue, updateIssue, commentOnIssue, closePR, generateChangelog, getContributions, getBranches };
