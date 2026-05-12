// server/services/content.js
import llm    from './llm.js';
import memory from './memory.js';
import github  from './github.js';

// ─── LinkedIn post generator ──────────────────────────────────────────────────

export async function draftLinkedInPost(source) {
  const { voiceProfile } = memory.getMemory();

  const voiceContext = voiceProfile.approvedDrafts.length
    ? `\nVoice examples (approved posts by this user):\n${voiceProfile.approvedDrafts.filter(d => d.type === 'linkedin').slice(-3).map(d => d.edited).join('\n---\n')}`
    : '';

  const prompt = `You are a ghostwriter. Write 3 LinkedIn post variants based on this raw input.
Tone: ${voiceProfile.tone}
Sentence length: ${voiceProfile.sentenceLength}
Opening style: ${voiceProfile.openingStyle}
${voiceContext}

Raw input: "${source}"

Return JSON:
{
  "variants": [
    { "label": "storytelling", "wordCount": 150, "body": "full post text" },
    { "label": "concise",      "wordCount": 80,  "body": "full post text" },
    { "label": "technical",    "wordCount": 220, "body": "full post text" }
  ],
  "recommendedVariant": 0
}`;

  const result = await llm.call(
    [{ role: 'user', content: prompt }],
    { taskType: 'content', json: true, maxTokens: 2000 }
  );

  return { type: 'linkedin', source, ...result };
}

// ─── Changelog generator ──────────────────────────────────────────────────────

export async function draftChangelog(since) {
  const markdown = await github.generateChangelog(since);

  const polished = await llm.generate(
    `Polish this raw changelog into a clean, readable GitHub release note. Keep all PR links. Add a one-line release summary at the top.\n\n${markdown}`,
    '',
    'changelog'
  );

  return { type: 'changelog', markdown, polished };
}

// ─── README update suggester ──────────────────────────────────────────────────

export async function suggestREADMEUpdates(currentReadme, recentPRs = []) {
  if (!recentPRs.length) return null;

  const prSummary = recentPRs.map(p => `- ${p.title}: ${p.body?.slice(0, 100) ?? ''}`).join('\n');

  const suggestion = await llm.generate(
    `Given this current README and recent merged PRs, identify which sections are outdated or missing and suggest specific updates. Be concise.\n\nREADME excerpt:\n${currentReadme.slice(0, 1000)}\n\nRecent PRs:\n${prSummary}`,
    '',
    'readme'
  );

  return { type: 'readme', suggestion, prCount: recentPRs.length };
}

// ─── Note → content seed ──────────────────────────────────────────────────────

export async function noteToContent(note) {
  const classified = await llm.classify(
    `Raw note: "${note}"\nWhat content type would this make best? Options: linkedin_post, blog_draft, internal_doc, not_content`,
    '{ "contentType": "string", "reasoning": "string", "worthPublishing": true }'
  );

  if (!classified.worthPublishing) return null;

  if (classified.contentType === 'linkedin_post') {
    return draftLinkedInPost(note);
  }

  return { type: classified.contentType, source: note, note: classified.reasoning };
}

export default { draftLinkedInPost, draftChangelog, suggestREADMEUpdates, noteToContent };
