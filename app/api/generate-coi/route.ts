import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/generate-coi
 *
 * Phase 2 will wire this to `lib/fillAcord25.ts`. For now we validate the
 * payload shape with zod and return 501 so the front end can integration-test
 * against a stable contract.
 */
const generateCoiSchema = z.object({
  selectedPolicyIds: z.array(z.string()).min(1),
  holder: z.object({
    name: z.string().min(1),
    address1: z.string().min(1),
    address2: z.string().min(1),
  }),
});

export type GenerateCoiRequest = z.infer<typeof generateCoiSchema>;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = generateCoiSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { error: 'Phase 2 implementation pending' },
    { status: 501 },
  );
}
