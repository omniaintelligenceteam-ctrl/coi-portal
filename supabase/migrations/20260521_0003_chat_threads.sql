-- =============================================================================
-- COI Portal — chat thread persistence
-- =============================================================================
-- The conversational COI agent currently keeps its history in client-side
-- React state, so a refresh wipes the conversation. This table persists one
-- ongoing thread per insured so the chat picks up where they left off.
--
-- One thread per insured. Multi-thread per insured can come later if the
-- user case ever justifies it; for v1, simplicity wins.
-- =============================================================================

create table chat_threads (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references coi_clients(id) on delete cascade unique,
  messages        jsonb not null default '[]'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index chat_threads_client_idx on chat_threads (client_id);
create index chat_threads_recency_idx on chat_threads (last_message_at desc);

comment on table chat_threads is
  'Persistent conversation history for the client-facing chat widget. One row per insured. Messages array stores the Anthropic-shaped role+content turns.';
comment on column chat_threads.messages is
  'Array of {role: user|assistant, content: string | block[]}. Mirrors what /api/chat sends to Anthropic.';

-- RLS: insureds can read/update only their own thread (matched by their
-- coi_clients row via contact_email). Service role bypasses.
alter table chat_threads enable row level security;

create policy "chat_threads_self_select"
  on chat_threads
  for select
  using (
    exists (
      select 1 from coi_clients c
      where c.id = chat_threads.client_id
        and c.contact_email = auth.email()
    )
  );

create policy "chat_threads_self_update"
  on chat_threads
  for update
  using (
    exists (
      select 1 from coi_clients c
      where c.id = chat_threads.client_id
        and c.contact_email = auth.email()
    )
  );
