import { describe, expect, it } from 'vitest';
import {
  shouldAdvanceStatus,
  statusForResendEvent,
  type OutboundEmailStatus,
} from '../lib/outboundEmailLog';

describe('statusForResendEvent', () => {
  it('maps known Resend event types', () => {
    expect(statusForResendEvent('email.delivered')).toBe('delivered');
    expect(statusForResendEvent('email.delivery_delayed')).toBe('delivery_delayed');
    expect(statusForResendEvent('email.bounced')).toBe('bounced');
    expect(statusForResendEvent('email.complained')).toBe('complained');
    expect(statusForResendEvent('email.opened')).toBe('opened');
  });

  it('returns null for unknown / irrelevant event types', () => {
    expect(statusForResendEvent('email.sent')).toBeNull();
    expect(statusForResendEvent('email.clicked')).toBeNull();
    expect(statusForResendEvent('')).toBeNull();
    expect(statusForResendEvent('contact.created')).toBeNull();
  });
});

describe('shouldAdvanceStatus', () => {
  it('advances forward through the normal lifecycle', () => {
    expect(shouldAdvanceStatus('sent', 'delivered')).toBe(true);
    expect(shouldAdvanceStatus('sent', 'delivery_delayed')).toBe(true);
    expect(shouldAdvanceStatus('delivery_delayed', 'delivered')).toBe(true);
    expect(shouldAdvanceStatus('delivered', 'opened')).toBe(true);
  });

  it('never downgrades on out-of-order events', () => {
    expect(shouldAdvanceStatus('delivered', 'delivery_delayed')).toBe(false);
    expect(shouldAdvanceStatus('opened', 'delivered')).toBe(false);
    expect(shouldAdvanceStatus('delivered', 'sent' as OutboundEmailStatus)).toBe(false);
  });

  it('treats bounced/complained as terminal', () => {
    expect(shouldAdvanceStatus('bounced', 'delivered')).toBe(false);
    expect(shouldAdvanceStatus('bounced', 'opened')).toBe(false);
    expect(shouldAdvanceStatus('complained', 'delivered')).toBe(false);
    // ...but a bounce can overwrite anything earlier.
    expect(shouldAdvanceStatus('delivered', 'bounced')).toBe(true);
    expect(shouldAdvanceStatus('opened', 'complained')).toBe(true);
    // Equal terminal states don't churn the row.
    expect(shouldAdvanceStatus('bounced', 'complained')).toBe(false);
  });
});
