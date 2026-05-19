import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import {
  approveAccessRequest,
  rejectAccessRequest,
  inviteClient,
} from './actions';
import { AdminFormButton } from './AdminFormButton';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type RequestRow = {
  id: string;
  email: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  message: string | null;
  source: 'self_signup' | 'admin_invite';
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

const FLASH_MESSAGES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  approved: { tone: 'ok', text: 'Approved and client invited.' },
  rejected: { tone: 'ok', text: 'Request rejected — requester emailed.' },
  invited: { tone: 'ok', text: 'Invite sent.' },
  missing_fields: { tone: 'error', text: 'Missing required fields.' },
  not_found: { tone: 'error', text: 'Request not found.' },
  already_decided: { tone: 'error', text: 'That request was already decided.' },
  create_failed: { tone: 'error', text: "Couldn't create client record." },
  create_failed_rollback_needed: {
    tone: 'error',
    text: "Request was marked approved but client record didn't save — check platform_log and fix manually.",
  },
  update_failed: { tone: 'error', text: "Couldn't update the request." },
  invalid_invite: { tone: 'error', text: 'Invite needs a valid email + business name.' },
  invite_failed: { tone: 'error', text: "Couldn't create client record for invite." },
  admin_email_blocked: {
    tone: 'error',
    text: "That email is an admin — admins can't be approved as clients.",
  },
};

export default async function AccessRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('access_requests')
    .select(
      'id, email, business_name, contact_name, phone, message, source, status, requested_at, decided_by_email, decided_at, decision_note',
    )
    .order('requested_at', { ascending: false })
    .returns<RequestRow[]>();

  const all = rows ?? [];
  const pending = all.filter((r) => r.status === 'pending');
  const decided = all.filter((r) => r.status !== 'pending').slice(0, 25);

  const params = await searchParams;
  const flashKey = params.ok ?? params.error;
  const flash = flashKey ? FLASH_MESSAGES[flashKey] : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <Link
        href="/admin/queue"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to queue
      </Link>

      <header className="mt-6 mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Access</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-6">
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
            Access requests
          </h1>
          <span className="font-mono text-sm text-ink-muted">
            {pending.length} pending
          </span>
        </div>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
          New people who asked to be set up on the portal, and proactive invites you've sent.
          Approving creates a client record and emails them a sign-in link.
        </p>
      </header>

      {flash && (
        <div
          className={
            flash.tone === 'ok'
              ? 'mb-8 border border-seal/40 bg-seal-soft/50 px-5 py-3 text-sm text-seal-deep'
              : 'mb-8 border border-danger/40 bg-danger-soft/50 px-5 py-3 text-sm text-danger'
          }
        >
          {flash.text}
        </div>
      )}

      <section className="mb-16">
        <Hairline label="Invite a client" className="mb-3" />
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Skip the waiting room — add a client directly. They'll get an email with a sign-in link.
        </p>
        <form action={inviteClient} className="grid gap-4 sm:grid-cols-2">
          <InviteField name="email" label="Email" type="email" required placeholder="contact@business.com" />
          <InviteField name="businessName" label="Business name" required placeholder="ACME Plumbing, LLC" />
          <InviteField name="contactName" label="Contact name (optional)" />
          <InviteField name="phone" label="Phone (optional)" type="tel" />
          <div className="sm:col-span-2">
            <AdminFormButton variant="primary">Send invite</AdminFormButton>
          </div>
        </form>
      </section>

      <section className="mb-16">
        <Hairline label={`Pending (${pending.length})`} className="mb-3" />
        {pending.length === 0 ? (
          <p className="border border-hairline bg-card px-5 py-8 text-sm text-ink-muted">
            No pending requests.
          </p>
        ) : (
          <ul className="space-y-4">
            {pending.map((r) => (
              <PendingCard key={r.id} row={r} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <Hairline label={`Recently decided (${decided.length})`} className="mb-3" />
        {decided.length === 0 ? (
          <p className="border border-hairline bg-card px-5 py-8 text-sm text-ink-muted">
            No decisions yet.
          </p>
        ) : (
          <div className="border-y border-hairline">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-hairline">
                  <Th>Business</Th>
                  <Th>Email</Th>
                  <Th align="right">Source</Th>
                  <Th align="right">Status</Th>
                  <Th align="right">Decided</Th>
                </tr>
              </thead>
              <tbody>
                {decided.map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-b-0">
                    <Td>
                      <span className="font-medium text-[0.92rem] text-ink">{r.business_name}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[0.78rem] text-ink-muted">{r.email}</span>
                    </Td>
                    <Td align="right">
                      <Badge
                        tone="neutral"
                        label={r.source === 'admin_invite' ? 'Invite' : 'Signup'}
                      />
                    </Td>
                    <Td align="right">
                      <Badge
                        tone={r.status === 'approved' ? 'good' : 'bad'}
                        label={r.status === 'approved' ? 'Approved' : 'Rejected'}
                      />
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-[0.78rem] text-ink-muted">
                        {r.decided_at ? formatTimestamp(r.decided_at) : '—'}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function PendingCard({ row }: { row: RequestRow }) {
  return (
    <li className="border border-hairline bg-card px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-medium text-ink">{row.business_name}</h3>
        <span className="font-mono text-[0.72rem] text-ink-muted">
          {formatTimestamp(row.requested_at)}
        </span>
      </div>
      <dl className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        <Row label="Email" value={row.email} mono />
        <Row label="Name" value={row.contact_name ?? '—'} />
        <Row label="Phone" value={row.phone ?? '—'} mono />
        <Row label="Source" value={row.source === 'admin_invite' ? 'Admin invite' : 'Self-signup'} />
      </dl>
      {row.message && (
        <div className="mt-4 border-l-2 border-seal/40 bg-seal-soft/30 px-3 py-2 text-sm leading-relaxed text-ink-muted">
          {row.message}
        </div>
      )}

      <div className="mt-5 grid gap-4 border-t border-hairline pt-5 sm:grid-cols-2">
        <form action={approveAccessRequest} className="space-y-3">
          <input type="hidden" name="id" value={row.id} />
          <label className="caps block text-[0.6rem] font-semibold text-ink-muted">
            Business name (creates the client record)
          </label>
          <input
            name="businessName"
            defaultValue={row.business_name}
            required
            className="field-underline block w-full text-sm text-ink"
          />
          <AdminFormButton variant="primary" size="sm">
            Approve &amp; create
          </AdminFormButton>
        </form>

        <form action={rejectAccessRequest} className="space-y-3">
          <input type="hidden" name="id" value={row.id} />
          <label className="caps block text-[0.6rem] font-semibold text-ink-muted">
            Reject — reason (sent to requester)
          </label>
          <textarea
            name="reason"
            rows={2}
            placeholder="e.g. We don't currently write policies in your state."
            className="field-underline block w-full resize-y text-sm text-ink"
          />
          <AdminFormButton variant="danger" size="sm">
            Reject
          </AdminFormButton>
        </form>
      </div>
    </li>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="caps text-[0.6rem] font-semibold text-ink-faint">{label}</dt>
      <dd className={mono ? 'font-mono text-[0.82rem] text-ink' : 'text-[0.9rem] text-ink'}>
        {value}
      </dd>
    </div>
  );
}

function InviteField({
  name,
  label,
  type = 'text',
  required,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={`invite-${name}`} className="caps block text-[0.6rem] font-semibold text-ink-muted">
        {label}
      </label>
      <input
        id={`invite-${name}`}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="field-underline mt-2 block w-full text-sm text-ink"
      />
    </div>
  );
}

function Badge({ tone, label }: { tone: 'good' | 'bad' | 'neutral'; label: string }) {
  const cls =
    tone === 'good'
      ? 'caps inline-flex items-center rounded-full border border-seal/40 bg-seal-soft px-2 py-0.5 text-[0.55rem] font-semibold text-seal-deep'
      : tone === 'bad'
        ? 'caps inline-flex items-center rounded-full border border-danger/40 bg-danger-soft/40 px-2 py-0.5 text-[0.55rem] font-semibold text-danger'
        : 'caps inline-flex items-center rounded-full border border-hairline-strong bg-white px-2 py-0.5 text-[0.55rem] font-semibold text-ink-faint';
  return <span className={cls}>{label}</span>;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`caps px-3 py-3 text-[0.6rem] font-semibold text-ink-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td className={`px-3 py-3 align-middle ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </td>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}
