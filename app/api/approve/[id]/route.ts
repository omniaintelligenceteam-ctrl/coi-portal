import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApprovalToken, type VerifyFailReason } from '@/lib/approvalToken';
import { adminEmails, mintAdminSession } from '@/lib/authLogin';

/**
 * Email-link approval entry point. The "Approve on phone" button in the
 * queue-notification email points HERE.
 *
 * Why a route handler instead of a Server Component page:
 *   Server Components can't reliably set cookies. To make follow-up clicks
 *   like "Edit" → /admin/queue/[id] work without a re-login, we mint a real
 *   Supabase session as soon as the token is verified. Cookie writes only
 *   succeed in Route Handlers and Server Actions.
 *
 * Flow:
 *   1. Read ?t= from query
 *   2. Verify token (read-only; HMAC + DB lookup + expiry + request match)
 *   3. If invalid → redirect to /approve/[id]?err=<reason> (page renders friendly error)
 *   4. If valid but admin no longer in ADMIN_EMAILS → ?err=revoked
 *   5. Mint Supabase session for admin_email (cookies set on the redirect response)
 *   6. Redirect to /approve/[id]?t=<token> (page re-verifies + renders the card)
 *
 * The token is NOT consumed here — only on the actual Approve / Reject click
 * (server action in /approve/[id]/actions.ts). That way refreshing the page
 * or going back to email doesn't burn the token.
 */

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: requestId } = await params;
  const rawToken = req.nextUrl.searchParams.get('t') ?? '';

  // UUID shape gate before any DB work.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.redirect(new URL('/approve/invalid?err=invalid', req.url));
  }

  const admin = createAdminClient();
  const verify = await verifyApprovalToken({ admin, requestId, rawToken });

  if (!verify.ok) {
    return redirectToPage(req, requestId, errToCode(verify.reason));
  }

  // Re-check admin allowlist now (token TTL is 72h; admin could have been
  // removed in that window).
  if (!adminEmails().includes(verify.adminEmail.toLowerCase())) {
    return redirectToPage(req, requestId, 'revoked');
  }

  // Mint session — sets sb-*-auth-token cookies on the current cookie store.
  try {
    await mintAdminSession(verify.adminEmail);
  } catch (err) {
    console.error('approve.entry.mint_session_failed', err);
    return redirectToPage(req, requestId, 'session_failed');
  }

  // Preserve the token in the URL so the page server component can re-verify
  // and render the card. Single-use is enforced at consume-time, not view-time.
  const dest = new URL(`/approve/${requestId}`, req.url);
  dest.searchParams.set('t', rawToken);
  return NextResponse.redirect(dest);
}

type PageErrCode =
  | 'invalid'
  | 'expired'
  | 'consumed'
  | 'wrong_request'
  | 'revoked'
  | 'session_failed';

function errToCode(reason: VerifyFailReason): PageErrCode {
  return reason;
}

function redirectToPage(req: NextRequest, requestId: string, err: PageErrCode): NextResponse {
  const dest = new URL(`/approve/${requestId}`, req.url);
  dest.searchParams.set('err', err);
  return NextResponse.redirect(dest);
}
