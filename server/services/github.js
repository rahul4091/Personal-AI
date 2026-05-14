// server/services/github.js
// GitHub REST API — supports multiple repos via GITHUB_REPOS=owner/repo1,owner/repo2
// Falls back to GITHUB_OWNER + GITHUB_REPO for single-repo setups.

const BASE = 'https://api.github.com';

// ─── Repo list ────────────────────────────────────────────────────────────────

function cleanName(s) {
  return s.replace(/[()|\s]/g, '').trim();
}

export function getRepos() {
  // Preferred: GITHUB_REPOS=rahul4091/repo1,rahul4091/repo2
  if (process.env.GITHUB_REPOS) {
    return process.env.GITHUB_REPOS.split(',').map(r => cleanName(r)).filter(Boolean);
  }
  // Fallback: GITHUB_OWNER + GITHUB_REPO (supports comma-separated repo names)
  const owner = cleanName(process.env.GITHUB_OWNER ?? '');
  const repo  = process.env.GITHUB_REPO ?? '';
  if (owner && repo &&
      owner !== 'your_github_username' &&
      repo  !== 'your_repo_name') {
    return repo.split(',').map(r => `${owner}/${cleanName(r)}`).filter(r => !r.endsWith('/'));
  }
  return [];
}

export function isConfigured() {
  const t = process.env.GITHUB_TOKEN;
  return !!(t && t !== 'your_github_personal_access_token' && getRepos().length > 0);
}

// Resolve a user-supplied repo hint ("Personal-AI", "devos", or "owner/repo")
// to the matching configured "owner/repo" string, defaulting to the first repo.
function resolveRepo(hint) {
  const repos = getRepos();
  if (!hint) return repos[0];
  const lower = hint.toLowerCase();
  return (
    repos.find(r => r.toLowerCase() === lower) ??
    repos.find(r => r.split('/')[1].toLowerCase() === lower) ??
    repos[0]
  );
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function ghHeaders() {
  return {
    Authorization:        `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept:               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':       'application/json',
  };
}

async function ghGraphQL(query, variables = {}) {
  if (!isConfigured()) throw new Error('GitHub not configured');
  const res = await fetch('https://api.github.com/graphql', {
    method:  'POST',
    headers: ghHeaders(),
    body:    JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function ghFetch(path) {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${BASE}${path}`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
    return res.json();
  } catch (err) {
    console.error('[github]', err.message);
    return null;
  }
}

async function ghPatch(path, body) {
  if (!isConfigured()) throw new Error('GitHub not configured');
  const res = await fetch(`${BASE}${path}`, {
    method:  'PATCH',
    headers: ghHeaders(),
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

async function ghPost(path, body) {
  if (!isConfigured()) throw new Error('GitHub not configured');
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: ghHeaders(),
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

export async function getOpenPRs(repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) return [];
  const data = await ghFetch(`/repos/${repo}/pulls?state=open&per_page=20`);
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

export async function scanStalePRs(thresholdDays = 3, repoHint) {
  const prs = await getOpenPRs(repoHint);
  return prs.filter(pr => pr.daysStale >= thresholdDays);
}

export async function getMergedPRs(since, repoHint) {
  const repo     = resolveRepo(repoHint);
  if (!repo) return [];
  const sinceISO = since ?? new Date(Date.now() - 7 * 86400000).toISOString();
  const data     = await ghFetch(`/repos/${repo}/pulls?state=closed&per_page=30&sort=updated&direction=desc`);
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

export async function getIssues(state = 'open', repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) return [];
  const data = await ghFetch(`/repos/${repo}/issues?state=${state}&per_page=20`);
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

export async function createIssue(title, body = '', labels = [], repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) throw new Error('GitHub not configured');
  const data = await ghPost(`/repos/${repo}/issues`, {
    title,
    body,
    ...(labels.length && { labels }),
  });
  return {
    id:    data.number,
    title: data.title,
    url:   data.html_url,
    state: data.state,
    repo,
  };
}

// ─── Changelog ────────────────────────────────────────────────────────────────

export async function generateChangelog(since, repoHint) {
  const prs = await getMergedPRs(since, repoHint);
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

export async function deleteIssue(issueNumber, repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) throw new Error('repo is required');

  // Step 1: get the issue's GraphQL node_id via REST
  const res = await fetch(`${BASE}/repos/${repo}/issues/${issueNumber}`, { headers: ghHeaders() });
  if (res.status === 404 || res.status === 410) {
    // Issue gone — return open issues so user knows valid numbers
    const open = await getIssues('open', repoHint);
    const list = open.length ? open.map(i => `#${i.id} ${i.title}`).join(' | ') : 'none';
    throw new Error(`Issue #${issueNumber} not found in ${repo}. Open issues: ${list}`);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} fetching issue #${issueNumber}`);
  const issue  = await res.json();
  const nodeId = issue.node_id;

  // Step 2: delete via GraphQL (requires admin/owner token)
  await ghGraphQL(
    `mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ repository { name } } }`,
    { id: nodeId }
  );

  return { deleted: true, id: issueNumber, title: issue.title, repo };
}

export async function closeIssue(issueNumber, repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) throw new Error('repo is required');
  const data = await ghPatch(`/repos/${repo}/issues/${issueNumber}`, { state: 'closed' });
  return { id: data.number, title: data.title, state: data.state, url: data.html_url, repo };
}

export async function reopenIssue(issueNumber, repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) throw new Error('repo is required');
  const data = await ghPatch(`/repos/${repo}/issues/${issueNumber}`, { state: 'open' });
  return { id: data.number, title: data.title, state: data.state, url: data.html_url, repo };
}

export async function updateIssue(issueNumber, patches = {}, repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) throw new Error('repo is required');
  const body = {};
  if (patches.title  !== undefined) body.title  = patches.title;
  if (patches.body   !== undefined) body.body   = patches.body;
  if (patches.labels !== undefined) body.labels = patches.labels;
  if (patches.state  !== undefined) body.state  = patches.state;
  const data = await ghPatch(`/repos/${repo}/issues/${issueNumber}`, body);
  return { id: data.number, title: data.title, state: data.state, url: data.html_url, repo };
}

export async function commentOnIssue(issueNumber, body, repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) throw new Error('repo is required');
  const data = await ghPost(`/repos/${repo}/issues/${issueNumber}/comments`, { body });
  return { id: data.id, url: data.html_url };
}

// ─── PR actions ───────────────────────────────────────────────────────────────

export async function closePR(prNumber, repoHint) {
  const repo = resolveRepo(repoHint);
  if (!repo) throw new Error('repo is required');
  const data = await ghPatch(`/repos/${repo}/pulls/${prNumber}`, { state: 'closed' });
  return { id: data.number, title: data.title, state: data.state, url: data.html_url, repo };
}

export default { isConfigured, getRepos, getOpenPRs, scanStalePRs, getMergedPRs, getIssues, createIssue, deleteIssue, closeIssue, reopenIssue, updateIssue, commentOnIssue, closePR, generateChangelog };
