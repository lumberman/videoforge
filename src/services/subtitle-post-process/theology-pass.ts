import { openRouter } from '@/services/openrouter';
import type {
  SubtitleCue,
  SubtitlePostProcessInput,
  TheologyIssue
} from '@/services/subtitle-post-process/types';
import { SUBTITLE_POST_PROCESS_VERSIONS } from '@/config/subtitle-post-process';

const TERM_SUGGESTIONS: Array<{ needle: RegExp; suggestion: string }> = [
  { needle: /holy spirit/i, suggestion: 'Consider canonical capitalization for Holy Spirit.' },
  { needle: /jesus christ/i, suggestion: 'Consider canonical capitalization for Jesus Christ.' },
  { needle: /gospel/i, suggestion: 'Verify doctrinal term consistency for gospel.' }
];

export interface TheologyPassOutput {
  cues: SubtitleCue[];
  issues: TheologyIssue[];
}

function toDeterministicFallbackIssues(cues: SubtitleCue[]): TheologyIssue[] {
  const issues: TheologyIssue[] = [];
  for (const cue of cues) {
    for (const entry of TERM_SUGGESTIONS) {
      if (!entry.needle.test(cue.text)) {
        continue;
      }

      issues.push({
        cueIndex: cue.index,
        severity: 'low',
        message: 'Potential doctrinal terminology inconsistency detected.',
        suggestion: entry.suggestion
      });
    }
  }
  return issues;
}

function sanitizeTheologyIssues(cues: SubtitleCue[], issues: TheologyIssue[]): TheologyIssue[] {
  return issues
    .filter((issue) => Number.isInteger(issue.cueIndex))
    .filter((issue) => issue.cueIndex >= 0 && issue.cueIndex < cues.length)
    .map((issue) => ({
      cueIndex: issue.cueIndex,
      severity:
        issue.severity === 'high' || issue.severity === 'medium' || issue.severity === 'low'
          ? issue.severity
          : 'low',
      message: String(issue.message ?? 'Potential doctrinal terminology inconsistency detected.'),
      suggestion: issue.suggestion ? String(issue.suggestion) : undefined
    }));
}

function buildFullTranscript(cues: SubtitleCue[]): string {
  return cues.map((cue) => cue.text.trim()).filter(Boolean).join(' ');
}

export async function runTheologyPass(input: {
  assetId: SubtitlePostProcessInput['assetId'];
  bcp47: SubtitlePostProcessInput['bcp47'];
  cues: SubtitleCue[];
}): Promise<TheologyPassOutput> {
  try {
    const response = await openRouter.subtitleTheologyCheck({
      assetId: input.assetId,
      bcp47: input.bcp47,
      promptVersion: SUBTITLE_POST_PROCESS_VERSIONS.promptVersion,
      fullTranscript: buildFullTranscript(input.cues),
      cues: input.cues.map((cue) => ({
        index: cue.index,
        start: cue.start,
        end: cue.end,
        text: cue.text
      }))
    });

    const externalIssues = Array.isArray(response.issues)
      ? sanitizeTheologyIssues(input.cues, response.issues)
      : [];
    return { cues: input.cues, issues: externalIssues };
  } catch (error) {
    console.warn(
      `[subtitle-post-process][theology-pass] external model unavailable, using deterministic fallback: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
    return { cues: input.cues, issues: toDeterministicFallbackIssues(input.cues) };
  }
}
