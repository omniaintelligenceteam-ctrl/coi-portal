/**
 * Statement — design system showcase.
 *
 * Admin-only via the parent /admin/layout.tsx email gate. This page is the
 * QA reference for the design system: every primitive in every variant and
 * state, color tokens, type scale, motion examples. Useful for visual
 * regression testing when refactoring tokens.
 *
 * Visit /admin/design after signing in as an admin to see the full system.
 */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Download,
  Info,
  Plus,
  Search,
  Send,
  Settings,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Banner,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Checkbox,
  Chip,
  DataTable,
  EmptyState,
  IconButton,
  Input,
  StaticChip,
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  Toggle,
  Tr,
} from '@/app/components/ui';
import { Hairline } from '@/app/components/Hairline';
import { ThemeToggle } from '@/app/components/ThemeToggle';

export const dynamic = 'force-dynamic';

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12 sm:px-10 sm:py-16">
      {/* Header */}
      <div className="mb-12 flex flex-wrap items-end justify-between gap-6 border-b border-hairline pb-8">
        <div>
          <p className="caps text-[0.62rem] font-semibold text-brand">Phase 1 · QA reference</p>
          <h1 className="mt-3 font-display text-[2.75rem] leading-[1.05] tracking-display text-ink">
            Statement <span className="text-brand">design system</span>
          </h1>
          <p className="mt-3 max-w-[60ch] text-[0.95rem] leading-[1.55] text-ink-muted">
            Every token, every primitive, every state. The single QA reference for the
            Statement language. Toggle the theme in the top right to compare light and dark.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle size="md" />
        </div>
      </div>

      {/* === COLOR === */}
      <Section eyebrow="01" title="Color">
        <p className="mb-6 max-w-[60ch] text-[0.875rem] text-ink-muted">
          One canvas, one ink, one accent. Functional colors used sparingly — coral for danger,
          forest for success, amber for warning, gold for ceremonial moments (verified, sealed).
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Swatch name="canvas" var="--color-canvas" hex="#F8F8F6" />
          <Swatch name="paper-deep" var="--color-paper-deep" hex="#F2F2EE" />
          <Swatch name="card" var="--color-card" hex="#FFFFFF" />
          <Swatch name="ink" var="--color-ink" hex="#0F0F0E" inverted />
          <Swatch name="ink-muted" var="--color-ink-muted" hex="#4A4A47" inverted />
          <Swatch name="ink-faint" var="--color-ink-faint" hex="#8A8A85" inverted />
          <Swatch name="hairline" var="--color-hairline" hex="#E7E6E0" />
          <Swatch name="hairline-strong" var="--color-hairline-strong" hex="#BCBBB4" />
          <Swatch name="brand" var="--color-brand" hex="#0B2545" inverted label="Sovereign Blue" />
          <Swatch name="brand-deep" var="--color-brand-deep" hex="#061A36" inverted />
          <Swatch name="brand-near" var="--color-brand-near" hex="#214E89" inverted />
          <Swatch name="brand-soft" var="--color-brand-soft" hex="#E7EDF5" />
          <Swatch name="seal" var="--color-seal" hex="#B8923A" inverted label="Ceremonial gold" />
          <Swatch name="success" var="--color-success" hex="#16A34A" inverted />
          <Swatch name="warning" var="--color-warning" hex="#B45309" inverted />
          <Swatch name="danger" var="--color-danger" hex="#DC2626" inverted />
        </div>
      </Section>

      {/* === TYPE === */}
      <Section eyebrow="02" title="Type">
        <p className="mb-6 max-w-[60ch] text-[0.875rem] text-ink-muted">
          Geist for everything. Display weight at 350 with -0.025em tracking does the
          headline work — no editorial serif. Geist Mono for IDs, dates, cert numbers, and
          anything tabular.
        </p>
        <div className="space-y-4">
          <TypeRow label="display 64 / weight 350" sample="The Policy Place." sampleClass="font-display text-[64px] leading-[0.95] text-ink" />
          <TypeRow label="display 48 / weight 350" sample="A storied estate." sampleClass="font-display text-[48px] leading-[1] text-ink" />
          <TypeRow label="h1 — 36 / weight 450" sample="Certificate of liability insurance." sampleClass="text-[36px] font-[450] leading-[1.1] tracking-[-0.018em] text-ink" />
          <TypeRow label="h2 — 24 / weight 500" sample="Today's queue · 4 pending review" sampleClass="text-[24px] font-medium leading-[1.2] tracking-[-0.015em] text-ink" />
          <TypeRow label="h3 — 18 / weight 500" sample="Riverside Construction LLC" sampleClass="text-[18px] font-medium text-ink" />
          <TypeRow label="body — 15 / 1.5" sample="The body workhorse — set at 15px with 1.5 leading. Used for descriptions, form labels, and prose throughout the admin and client surfaces." sampleClass="text-[15px] leading-[1.5] text-ink" />
          <TypeRow label="small — 13 / muted" sample="Submitted 4:02 PM by jeff@riverside.example" sampleClass="text-[13px] text-ink-muted" />
          <TypeRow label="mono — 12.5 / tnum" sample="PP-20260520-A1B2 · 04/01/2026" sampleClass="font-mono text-[12.5px] num-tabular text-ink" />
          <TypeRow label="caps — 11 / 0.12em" sample="Pending review" sampleClass="caps text-[11px] text-ink" />
          <TypeRow label="numbers — 44 / tabular" sample="$2,000,000" sampleClass="font-display text-[44px] num-tabular leading-[1] text-ink" />
        </div>
      </Section>

      {/* === BUTTONS === */}
      <Section eyebrow="03" title="Buttons">
        <p className="mb-6 max-w-[60ch] text-[0.875rem] text-ink-muted">
          Primary uses Sovereign Blue. Ink is the alternative weight for non-brand actions.
          Sized by importance — sm for table-row inline, md for primary CTAs, lg for hero
          moments.
        </p>
        <div className="space-y-6">
          <Cluster label="Variants — md size">
            <Button variant="primary">Approve &amp; send</Button>
            <Button variant="secondary">Edit values</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Reject</Button>
            <Button variant="seal" leadingIcon={<CheckCircle2 className="h-4 w-4" />}>
              Mark verified
            </Button>
            <Button variant="link">View details →</Button>
          </Cluster>
          <Cluster label="Sizes">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Cluster>
          <Cluster label="States">
            <Button>Default</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button leadingIcon={<Send className="h-4 w-4" />}>Send</Button>
            <Button trailingIcon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
            <Button uppercase>Uppercase</Button>
          </Cluster>
          <Cluster label="Icon buttons">
            <IconButton label="Search" variant="secondary"><Search className="h-4 w-4" /></IconButton>
            <IconButton label="Settings" variant="secondary"><Settings className="h-4 w-4" /></IconButton>
            <IconButton label="Download" variant="secondary"><Download className="h-4 w-4" /></IconButton>
            <IconButton label="Delete" variant="ghost" className="text-danger"><Trash2 className="h-4 w-4" /></IconButton>
          </Cluster>
        </div>
      </Section>

      {/* === FIELDS === */}
      <Section eyebrow="04" title="Form fields">
        <p className="mb-6 max-w-[60ch] text-[0.875rem] text-ink-muted">
          Hairline border, focus ring in Sovereign Blue with a brand-soft tint. Errors
          shake (.field-shake) on submit failure. All field types respect 16px minimum on
          mobile to defeat iOS auto-zoom.
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Input label="Business name" defaultValue="Riverside Construction LLC" hint="Required" />
          <Input label="Contact email" type="email" defaultValue="jeff@riverside.example" />
          <Input label="Phone" type="tel" defaultValue="(270) 555-0142" />
          <Input label="Field with error" defaultValue="abc" error="Must be at least 8 characters" />
          <Input label="Disabled field" defaultValue="Read-only" disabled />
          <Input label="With placeholder" placeholder="Type a business name…" />
          <div className="sm:col-span-2">
            <Textarea label="Notes" rows={3} placeholder="Optional notes for the reviewer…" />
          </div>
        </div>
      </Section>

      {/* === TOGGLES / CHECKBOXES === */}
      <Section eyebrow="05" title="Toggles &amp; checkboxes">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card padding="md">
            <Toggle
              checked
              onChange={() => {}}
              label="Auto-approve enabled"
              description="Cert requests from this client skip the queue once the reviewer agent passes."
            />
            <Toggle
              onChange={() => {}}
              label="Email me on every request"
              description="Even when auto-approve is on."
            />
            <Toggle disabled onChange={() => {}} label="Disabled toggle" />
          </Card>
          <Card padding="md">
            <Checkbox label="General Liability" defaultChecked />
            <Checkbox label="Workers' Compensation" defaultChecked />
            <Checkbox label="Commercial Auto" defaultChecked />
            <Checkbox label="Umbrella" />
            <Checkbox label="Disabled option" disabled />
          </Card>
        </div>
      </Section>

      {/* === CHIPS / PILLS === */}
      <Section eyebrow="06" title="Chips &amp; status pills">
        <Cluster label="Interactive chips">
          <Chip active>All</Chip>
          <Chip>Pending</Chip>
          <Chip tone="success">Approved</Chip>
          <Chip tone="warning">Flagged</Chip>
          <Chip tone="danger">Rejected</Chip>
          <Chip tone="brand" active>
            Reviewed
          </Chip>
          <Chip count={12}>With count</Chip>
        </Cluster>
        <Cluster label="Static pills (read-only)">
          <StaticChip tone="brand">Reviewed</StaticChip>
          <StaticChip tone="success">Approved</StaticChip>
          <StaticChip tone="warning">Pending</StaticChip>
          <StaticChip tone="danger">Voided</StaticChip>
          <StaticChip tone="seal">Issued</StaticChip>
        </Cluster>
      </Section>

      {/* === BANNERS === */}
      <Section eyebrow="07" title="Banners">
        <div className="space-y-4">
          <Banner tone="info" title="Reviewer pass">
            All coverages active. AI endorsement language matches Brook's saved override for
            Riverside Construction.
          </Banner>
          <Banner tone="success" title="Cert sent">
            PP-20260520-A1B2 emailed to Calvert City Industrial Park. Audit row inserted.
          </Banner>
          <Banner tone="warning" title="Coverage expires soon">
            ACME Welding's General Liability policy expires May 28 — 8 days. Renew before issuing.
          </Banner>
          <Banner tone="danger" title="Cannot generate cert">
            Riverside Construction's Workers' Comp policy was cancelled mid-term. Restore or
            replace before issuing.
          </Banner>
          <Banner tone="seal" title="Verified" icon={<CheckCircle2 className="h-4 w-4" />}>
            This certificate was issued by The Policy Place on May 20, 2026. Status: current.
          </Banner>
          <Banner tone="neutral">
            A neutral notice — no urgency, just information.
          </Banner>
        </div>
      </Section>

      {/* === CARDS === */}
      <Section eyebrow="08" title="Cards">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader
              eyebrow="Default surface"
              title="Riverside Construction"
              subtitle="12 certs · last issued Mon"
            />
            <p className="mt-4 text-[0.875rem] text-ink-muted">
              Standard card pattern — white surface, hairline border, restrained shadow.
            </p>
          </Card>
          <Card surface="paper" tone="brand">
            <CardHeader
              eyebrow="Brand tone"
              title="Reviewer pass"
              subtitle="claude-sonnet-4-6 · 220ms"
            />
            <p className="mt-4 text-[0.875rem] text-ink-muted">
              Sovereign Blue inset for first-class agent output.
            </p>
          </Card>
          <Card surface="paper" tone="seal" raised>
            <CardHeader
              eyebrow="Seal tone"
              title="Issued"
              subtitle="PP-20260520-A1B2"
            />
            <p className="mt-4 text-[0.875rem] text-ink-muted">
              Gold tone reserved for verified / sealed moments.
            </p>
          </Card>
        </div>
      </Section>

      {/* === TABLES === */}
      <Section eyebrow="09" title="Data tables">
        <DataTable>
          <Thead>
            <Th>Cert #</Th>
            <Th>Client</Th>
            <Th>Holder</Th>
            <Th>Status</Th>
            <Th align="right">Requested</Th>
          </Thead>
          <Tbody>
            <Tr>
              <Td><span className="font-mono text-[0.78rem]">PP-20260520-A1B2</span></Td>
              <Td>Riverside Construction</Td>
              <Td>Calvert City Industrial</Td>
              <Td><StaticChip tone="brand">Reviewed</StaticChip></Td>
              <Td align="right"><span className="font-mono text-[0.72rem] text-ink-muted">4:02 PM</span></Td>
            </Tr>
            <Tr>
              <Td><span className="font-mono text-[0.78rem]">PP-20260520-K3M4</span></Td>
              <Td>ACME Welding</Td>
              <Td>Baptist Health Paducah</Td>
              <Td><StaticChip tone="warning">Pending</StaticChip></Td>
              <Td align="right"><span className="font-mono text-[0.72rem] text-ink-muted">3:41 PM</span></Td>
            </Tr>
            <Tr>
              <Td><span className="font-mono text-[0.78rem]">PP-20260518-X9Y2</span></Td>
              <Td>Riverside Construction</Td>
              <Td>Baptist Health Paducah</Td>
              <Td><StaticChip tone="success">Sent</StaticChip></Td>
              <Td align="right"><span className="font-mono text-[0.72rem] text-ink-muted">Mon</span></Td>
            </Tr>
          </Tbody>
        </DataTable>
      </Section>

      {/* === EMPTY STATE === */}
      <Section eyebrow="10" title="Empty states">
        <EmptyState
          eyebrow="Queue clear"
          title="Nothing pending review"
          description="When a cert request comes in, it'll land here ranked by the reviewer agent."
          actions={
            <Button leadingIcon={<Plus className="h-4 w-4" />}>New cert</Button>
          }
        />
      </Section>

      {/* === MOTION === */}
      <Section eyebrow="11" title="Motion">
        <p className="mb-6 max-w-[60ch] text-[0.875rem] text-ink-muted">
          Restrained but present. Default duration 220ms with a sharp ease-out. List items
          mount in 30ms staggers. Larger ceremonial moments (seal stamp, approve halo) use
          their own keyframes — kept verbatim from the prior system.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader eyebrow="Staggered mount" title=".rise utility" subtitle="30ms increments" />
            <ul className="mt-4 space-y-2">
              <li className="rise rounded-md border border-hairline px-3 py-2 text-[0.85rem]">First row</li>
              <li className="rise rounded-md border border-hairline px-3 py-2 text-[0.85rem]">Second row</li>
              <li className="rise rounded-md border border-hairline px-3 py-2 text-[0.85rem]">Third row</li>
              <li className="rise rounded-md border border-hairline px-3 py-2 text-[0.85rem]">Fourth row</li>
            </ul>
          </Card>
          <Card>
            <CardHeader eyebrow="Seal stamp" title=".seal-stamp" subtitle="480ms — issued moment" />
            <div className="mt-6 grid place-items-center">
              <div className="seal-stamp grid h-24 w-24 place-items-center rounded-full border-2 border-seal bg-seal-soft text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-seal-deep">
                Issued<br />May 20
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow="AI scan" title=".ai-scan" subtitle="while reviewer reads" />
            <div className="relative mt-4 h-12 overflow-hidden rounded-md bg-paper-deep">
              <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-transparent via-brand to-transparent opacity-40 ai-scan" />
            </div>
          </Card>
        </div>
      </Section>

      <footer className="mt-16 border-t border-hairline pt-6 text-[0.75rem] text-ink-faint">
        Statement v1.0 · Phase 1 (design system foundation). Every primitive on this page
        renders against the same tokens — toggle the theme above to verify dark mode parity.
      </footer>
    </main>
  );
}

/* ---------- Local helpers ---------- */

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16 border-t border-hairline pt-10 first:border-t-0 first:pt-0">
      <div className="mb-6 flex items-baseline gap-4">
        <span className="caps font-mono text-[0.62rem] font-semibold text-brand">{eyebrow}</span>
        <h2 className="font-display text-[1.5rem] leading-[1.15] tracking-display text-ink">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Swatch({
  name,
  var: cssVar,
  hex,
  inverted = false,
  label,
}: {
  name: string;
  var: string;
  hex: string;
  inverted?: boolean;
  label?: string;
}) {
  return (
    <div className="rounded-[var(--r-md)] border border-hairline overflow-hidden">
      <div
        className={`h-16 w-full ${inverted ? 'text-white' : 'text-ink'} flex items-end p-2`}
        style={{ background: `var(${cssVar})` }}
      >
        {label && <span className="text-[0.65rem] font-semibold">{label}</span>}
      </div>
      <div className="bg-card p-2">
        <p className="font-mono text-[0.7rem] text-ink">{name}</p>
        <p className="font-mono text-[0.65rem] text-ink-faint">{hex}</p>
      </div>
    </div>
  );
}

function TypeRow({
  label,
  sample,
  sampleClass,
}: {
  label: string;
  sample: string;
  sampleClass: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-hairline pb-4 last:border-b-0 lg:grid-cols-[180px_1fr] lg:items-baseline lg:gap-6">
      <p className="font-mono text-[0.7rem] text-ink-faint">{label}</p>
      <div className={sampleClass}>{sample}</div>
    </div>
  );
}

function Cluster({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="caps mb-3 text-[0.62rem] font-semibold text-ink-faint">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
