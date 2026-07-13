import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySvixSignature } from '../lib/svixVerify';

const SECRET_BYTES = Buffer.from('test-secret-key-material-32bytes');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

function sign(id: string, timestamp: string, body: string): string {
  return createHmac('sha256', SECRET_BYTES).update(`${id}.${timestamp}.${body}`).digest('base64');
}

const NOW_MS = 1_800_000_000_000;
const TS = String(Math.floor(NOW_MS / 1000));
const BODY = '{"type":"email.delivered","data":{"email_id":"abc"}}';

describe('verifySvixSignature', () => {
  it('accepts a valid v1 signature', () => {
    const sig = sign('msg_1', TS, BODY);
    expect(
      verifySvixSignature({
        secret: SECRET,
        svixId: 'msg_1',
        svixTimestamp: TS,
        svixSignature: `v1,${sig}`,
        rawBody: BODY,
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it('accepts when a valid signature is among several candidates', () => {
    const sig = sign('msg_1', TS, BODY);
    expect(
      verifySvixSignature({
        secret: SECRET,
        svixId: 'msg_1',
        svixTimestamp: TS,
        svixSignature: `v1,${'A'.repeat(44)} v1,${sig}`,
        rawBody: BODY,
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = sign('msg_1', TS, BODY);
    expect(
      verifySvixSignature({
        secret: SECRET,
        svixId: 'msg_1',
        svixTimestamp: TS,
        svixSignature: `v1,${sig}`,
        rawBody: BODY.replace('delivered', 'bounced'),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it('rejects a stale timestamp (replay protection)', () => {
    const staleTs = String(Math.floor(NOW_MS / 1000) - 600);
    const sig = sign('msg_1', staleTs, BODY);
    expect(
      verifySvixSignature({
        secret: SECRET,
        svixId: 'msg_1',
        svixTimestamp: staleTs,
        svixSignature: `v1,${sig}`,
        rawBody: BODY,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it('rejects non-v1 versions and malformed headers', () => {
    const sig = sign('msg_1', TS, BODY);
    for (const header of [`v2,${sig}`, sig, 'v1', '']) {
      expect(
        verifySvixSignature({
          secret: SECRET,
          svixId: 'msg_1',
          svixTimestamp: TS,
          svixSignature: header,
          rawBody: BODY,
          nowMs: NOW_MS,
        }),
      ).toBe(false);
    }
  });

  it('rejects a garbage timestamp', () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        svixId: 'msg_1',
        svixTimestamp: 'not-a-number',
        svixSignature: 'v1,abc',
        rawBody: BODY,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });
});
