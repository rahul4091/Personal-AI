// server/services/github.js
// GitHub REST API — no extra SDK needed, just fetch

const BASE  = 'https://api.github.com';
const OWNER = process.env.GITHUB_OWNER;
const REPO  = process.env.GITHUB_REPO;

async function ghFetch(path) {
  if (!process.env.GITHUB_TOKEN) return null;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept:        'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  try {
    const res = await fetch(`${BASE}${path}`, { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
    return res.json();
  } catch (err) {
    console.error('[github]', err.message);
    return null;
  }
}

// ─── Pull Requests ─────────────────────────────────────────────────────────────

export async function getOpenPRs() {
  if (!OWNER || !REPO) return [];
  const data = await ghFetch(`/repos/${OWNER}/${REPO}/pulls?state=open&per_page=20`);
  if (!data) return [];

  return data.map(pr => ({
    id:          pr.number,
    title:       pr.title,
    author:      pr.user?.login,
    branch:      pr.head?.ref,
    url:         pr.html_url,
    createdAt:   pr.created_at,
    updatedAt:   pr.updated_at,
    reviewers:   pr.requested_reviewers?.map(r => r.login) ?? [],
    daysStale:   Math.floor((Date.now() - new Date(pr.updated_at)) / 86400000),
  }));
}

export async function scanStalePRs(thresholdDays = 3) {
  const prs = await getOpenPRs();
  return prs.filter(pr => pr.daysStale >= thresholdDays);
}

export async function getMergedPRs(since) {
  if (!OWNER || !REPO) return [];
  const sinceISO = since ?? new Date(Date.now() - 7 * 86400000).toISOString();
  const data     = await ghFetch(`/repos/${OWNER}/${REPO}/pulls?state=closed&per_page=30&sort=updated&direction=desc`);
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
    }));
}

// ─── Changelog generator ──────────────────────────────────────────────────────

export async function generateChangelog(since) {
  const prs = await getMergedPRs(since);
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

export default { getOpenPRs, scanStalePRs, getMergedPRs, generateChangelog };
