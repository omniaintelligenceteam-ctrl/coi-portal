export type HolderInput = {
  name: string;
  address1: string;
  address2?: string | null;
};

export type NormalizedHolder = {
  name: string;
  address1: string;
  address2: string;
};

export function normalizeHolderInput(input: HolderInput): NormalizedHolder {
  return {
    name: input.name.trim(),
    address1: input.address1.trim(),
    address2: (input.address2 ?? '').trim(),
  };
}

export function validateHolderInput(
  input: HolderInput,
):
  | { ok: true; holder: NormalizedHolder }
  | { ok: false; error: string } {
  const holder = normalizeHolderInput(input);

  if (!holder.name) {
    return { ok: false, error: 'holder name is required' };
  }
  if (!holder.address1) {
    return { ok: false, error: 'holder address is required' };
  }
  if (holder.name.length > 200) {
    return { ok: false, error: 'holder name is too long (max 200 chars)' };
  }
  if (holder.address1.length > 200) {
    return { ok: false, error: 'holder address is too long (max 200 chars)' };
  }
  if (holder.address2.length > 200) {
    return { ok: false, error: 'holder address line 2 is too long (max 200 chars)' };
  }

  return { ok: true, holder };
}
