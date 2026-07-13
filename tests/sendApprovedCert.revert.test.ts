/**
 * Regression test for the send-failure revert in sendApprovedCert.
 *
 * The send path flips approved/edited → 'sent' BEFORE rendering/emailing (the
 * optimistic send lock). Pre-fix, any failure after that flip stranded the row
 * at status='sent' with no email delivered and no retry possible. The fix
 * reverts the lock (guarded on the exact sent_at we wrote) for failures that
 * happen before the email goes out, so the row returns to a retryable state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/email.js', () => ({
  sendCoiEmail: vi.fn(),
}));
vi.mock('../lib/renderCertificate.js', () => ({
  renderCertificateWithFallback: vi.fn(async () => new Uint8Array([1, 2, 3])),
  templatePngPathFor: vi.fn(() => 'assets/template/acord-25-page-1.png'),
}));
vi.mock('../lib/verifyQr.js', () => ({
  stampVerifyQr: vi.fn(async (bytes: Uint8Array) => bytes),
}));
vi.mock('../lib/coiInputBuilder.js', () => ({
  buildCoiInput: vi.fn(() => ({})),
}));

import { sendApprovedCert } from '../lib/sendApprovedCert.js';
import { sendCoiEmail } from '../lib/email.js';

type ChainCall = [method: string, args: unknown[]];

/** Minimal thenable Supabase query-builder fake. Every chain method records
 *  itself and returns the chain; awaiting the chain (or calling maybeSingle/
 *  single) resolves to the canned response. */
function makeChain(response: { data?: unknown; error?: unknown }) {
  const calls: ChainCall[] = [];
  const chain: Record<string, unknown> & { calls: ChainCall[] } = { calls } as never;
  for (const m of ['select', 'eq', 'in', 'is', 'update', 'insert', 'upsert', 'returns']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return chain;
    };
  }
  chain.maybeSingle = async () => response;
  chain.single = async () => response;
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(response).then(resolve, reject);
  return chain as unknown as { calls: ChainCall[] } & Record<string, unknown>;
}

const REQ_ROW = {
  id: 'req-1',
  client_id: 'client-1',
  agency_id: 'agency-1',
  cert_number: 'PP-20260518-0001-ABC',
  holder_name: 'Holder LLC',
  holder_address1: '1 Main St',
  holder_address2: null,
  coverages_selected: ['pol-1'],
  pdf_storage_path: 'certs/PP-20260518-0001-ABC.pdf',
  status: 'approved',
  cert_overrides: null,
  form_type: 'ACORD_25',
};

const POLICY = {
  id: 'pol-1',
  type: 'GL',
  policy_number: 'GL-123',
  eff_date: '2026-01-01',
  exp_date: '2099-01-01',
  active: true,
  status: 'active',
};

function makeAdmin(reqStatus: string) {
  const chains = {
    loadReq: makeChain({ data: { ...REQ_ROW, status: reqStatus }, error: null }),
    lock: makeChain({ data: { id: 'req-1' }, error: null }),
    client: makeChain({
      data: {
        id: 'client-1',
        business_name: 'Acme Co',
        business_address1: null,
        business_address2: null,
        contact_email: 'acme@example.com',
      },
      error: null,
    }),
    agency: makeChain({
      data: {
        id: 'agency-1',
        name: 'The Policy Place',
        address1: null,
        address2: null,
        contact_name: null,
        phone: null,
        fax: null,
        email: null,
      },
      error: null,
    }),
    policies: makeChain({ data: [POLICY], error: null }),
    revert: makeChain({ error: null }),
  };
  const queue = [chains.loadReq, chains.lock, chains.client, chains.agency, chains.policies, chains.revert];
  const admin = {
    // Success path makes more from() calls than the failure path (audit upsert
    // + final path persist) — hand out fresh no-op chains once the queue empties.
    from: vi.fn(() => queue.shift() ?? makeChain({ error: null })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
      })),
    },
  };
  return { admin, chains };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendApprovedCert revert-on-failure', () => {
  it('reverts the sent lock and rethrows when the email send fails', async () => {
    const { admin, chains } = makeAdmin('approved');
    vi.mocked(sendCoiEmail).mockRejectedValueOnce(new Error('resend 500'));

    await expect(
      sendApprovedCert(admin as never, 'req-1'),
    ).rejects.toThrow('resend 500');

    // The last cert_requests chain is the revert: back to 'approved',
    // sent_at cleared, guarded on the sent_at the lock wrote.
    const updateCall = chains.revert.calls.find(([m]) => m === 'update');
    expect(updateCall?.[1][0]).toEqual({ status: 'approved', sent_at: null });
    const eqCalls = chains.revert.calls.filter(([m]) => m === 'eq');
    expect(eqCalls.map(([, args]) => args[0])).toEqual(['id', 'status', 'sent_at']);
    expect(eqCalls[1]?.[1][1]).toBe('sent');
  });

  it("reverts to 'edited' when that was the pre-send status", async () => {
    const { admin, chains } = makeAdmin('edited');
    vi.mocked(sendCoiEmail).mockRejectedValueOnce(new Error('resend 500'));

    await expect(sendApprovedCert(admin as never, 'req-1')).rejects.toThrow();

    const updateCall = chains.revert.calls.find(([m]) => m === 'update');
    expect(updateCall?.[1][0]).toEqual({ status: 'edited', sent_at: null });
  });

  it('does not touch the row again when the send succeeds', async () => {
    const { admin, chains } = makeAdmin('approved');
    vi.mocked(sendCoiEmail).mockResolvedValueOnce({ id: 'email-1' });

    const result = await sendApprovedCert(admin as never, 'req-1');

    expect(result.emailId).toBe('email-1');
    // Success path uses the queued 'revert' chain slot for the audit upsert
    // instead — it must never carry a status revert.
    const updateCall = chains.revert.calls.find(([m]) => m === 'update');
    expect(updateCall).toBeUndefined();
  });
});
