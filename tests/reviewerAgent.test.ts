import { describe, it, expect, vi } from 'vitest';
import {
  reviewCert,
  parseReviewerOutput,
  formatUserMessage,
  type ClientOverride,
} from '../lib/reviewerAgent.js';
import { SHEFFER_FIXTURE } from './fixtures/sheffer.js';

function mockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
    },
  } as const;
}

describe('reviewCert', () => {
  it('returns pass=true with no flags when reviewer says clean', async () => {
    const client = mockClient(JSON.stringify({ pass: true, flags: [], notes: 'Looks clean.' }));
    const result = await reviewCert({ request: SHEFFER_FIXTURE }, client as never);
    expect(result.pass).toBe(true);
    expect(result.flags).toEqual([]);
    expect(result.notes).toBe('Looks clean.');
    expect(result.model).toMatch(/claude/);
  });

  it('surfaces error-severity flags when reviewer finds issues', async () => {
    const client = mockClient(
      JSON.stringify({
        pass: false,
        flags: [
          { field: 'holder.address1', severity: 'error', message: 'Address looks incomplete.' },
        ],
        notes: 'One issue flagged.',
      }),
    );
    const result = await reviewCert({ request: SHEFFER_FIXTURE }, client as never);
    expect(result.pass).toBe(false);
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]!.severity).toBe('error');
    expect(result.flags[0]!.field).toBe('holder.address1');
  });

  it('handles malformed JSON gracefully and returns a parse-error flag', async () => {
    const client = mockClient('totally not json');
    const result = await reviewCert({ request: SHEFFER_FIXTURE }, client as never);
    expect(result.pass).toBe(false);
    expect(result.flags[0]!.field).toBe('reviewer');
    expect(result.flags[0]!.severity).toBe('error');
  });

  it('strips markdown code fences from the response', async () => {
    const client = mockClient(
      '```json\n{"pass":true,"flags":[],"notes":"ok"}\n```',
    );
    const result = await reviewCert({ request: SHEFFER_FIXTURE }, client as never);
    expect(result.pass).toBe(true);
  });

  it('handles bare ``` fences (no json language tag)', async () => {
    const client = mockClient(
      '```\n{"pass":true,"flags":[],"notes":"ok"}\n```',
    );
    const result = await reviewCert({ request: SHEFFER_FIXTURE }, client as never);
    expect(result.pass).toBe(true);
  });

  it('drops invalid flag entries from the response', async () => {
    const client = mockClient(
      JSON.stringify({
        pass: false,
        flags: [
          { field: 'good', severity: 'error', message: 'real flag' },
          { field: 'bad', severity: 'NOPE', message: 'invalid severity' },
          'not even an object',
        ],
        notes: 'mixed',
      }),
    );
    const result = await reviewCert({ request: SHEFFER_FIXTURE }, client as never);
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]!.field).toBe('good');
  });

  it('falls back to error flag when reviewer returns no text block', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'tool_use', name: 'something', input: {} }],
        }),
      },
    };
    const result = await reviewCert({ request: SHEFFER_FIXTURE }, client as never);
    expect(result.pass).toBe(false);
    expect(result.flags[0]!.field).toBe('reviewer');
  });
});

describe('formatUserMessage', () => {
  it('includes the cert essentials in the prompt', () => {
    const msg = formatUserMessage({ request: SHEFFER_FIXTURE });
    expect(msg).toContain(SHEFFER_FIXTURE.insured.name);
    expect(msg).toContain(SHEFFER_FIXTURE.holder.name);
    expect(msg).toContain(SHEFFER_FIXTURE.certNumber);
    expect(msg).toContain(SHEFFER_FIXTURE.certDate);
  });

  it('includes client overrides when provided', () => {
    const overrides: ClientOverride[] = [
      {
        scope: 'holder',
        pattern: 'holder is Sheffer Construction',
        correction: 'use suite 200 in address line 2',
      },
    ];
    const msg = formatUserMessage({ request: SHEFFER_FIXTURE, clientOverrides: overrides });
    expect(msg).toContain('Prior corrections from Brook');
    expect(msg).toContain('suite 200');
    expect(msg).toContain('[holder]');
  });

  it('notes the absence of overrides when none provided', () => {
    const msg = formatUserMessage({ request: SHEFFER_FIXTURE });
    expect(msg).toContain('No prior corrections on file');
  });

  it('marks coverages with AI-blanket and WoS flags when set', () => {
    const fixture = {
      ...SHEFFER_FIXTURE,
      coverages: SHEFFER_FIXTURE.coverages.map((c, i) =>
        i === 0 ? { ...c, addlInsuredBlanket: true, subrogationWaived: true } : c,
      ),
    };
    const msg = formatUserMessage({ request: fixture });
    expect(msg).toContain('AI-blanket');
    expect(msg).toContain('WoS');
  });
});

describe('parseReviewerOutput', () => {
  it('extracts pass/flags/notes from valid JSON', () => {
    const result = parseReviewerOutput('{"pass":true,"flags":[],"notes":"ok"}');
    expect(result.pass).toBe(true);
    expect(result.flags).toEqual([]);
    expect(result.notes).toBe('ok');
  });

  it('returns parse-error flag on garbage', () => {
    const result = parseReviewerOutput('lol');
    expect(result.pass).toBe(false);
    expect(result.flags[0]!.field).toBe('reviewer');
  });

  it('coerces non-string notes to empty string', () => {
    const result = parseReviewerOutput('{"pass":true,"flags":[],"notes":42}');
    expect(result.notes).toBe('');
  });
});
