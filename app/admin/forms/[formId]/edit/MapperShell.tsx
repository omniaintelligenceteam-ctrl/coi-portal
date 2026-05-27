'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  StaticChip,
} from '@/app/components/ui';
import {
  FIELD_DICTIONARY,
  dictionaryByGroup,
  getDictionaryEntry,
  type FieldGroup,
} from '@/lib/forms/fieldDictionary';
import type { AnchorLabel } from '@/lib/forms/drawCore';
import type { AnchorSide, FormDef, FormFieldDef } from '@/lib/forms/types';

/**
 * Visual mapper shell. Holds the source of truth for the form's fields
 * (initialized from server props, mutated on each API call), the selected
 * field for canvas highlight, and the open/close state of the add-field
 * modal.
 *
 * Three panes:
 *   - Canvas (center): rasterized PNG with field-position dots + clickable
 *     anchor overlays
 *   - Field panel (right): grouped list of mapped fields + add button
 *   - Preview pane (left, collapsible): iframe of /api/admin/forms/<id>/preview
 *
 * Mobile: collapses to canvas + panel toggle.
 */

const PANE_PREVIEW_DEFAULT_OPEN = true;

type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; field: FormFieldDef };

export function MapperShell({
  formDef: initialFormDef,
  pngSignedUrl,
  anchors,
}: {
  formDef: FormDef;
  pngSignedUrl: string | null;
  anchors: AnchorLabel[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<readonly FormFieldDef[]>(initialFormDef.fields);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(PANE_PREVIEW_DEFAULT_OPEN);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [publishState, setPublishState] = useState<
    | { kind: 'idle' }
    | { kind: 'publishing' }
    | { kind: 'error'; message: string }
    | { kind: 'success' }
  >({ kind: 'idle' });

  const pageWidthPt = initialFormDef.pageWidthPt ?? 612;
  const pageHeightPt = initialFormDef.pageHeightPt ?? 792;

  // Status-derived flag — only published forms appear in the cert pipeline.
  const isPublished = initialFormDef.status === 'published';

  const refreshFields = useCallback(async () => {
    const res = await fetch(`/api/admin/forms/${encodeURIComponent(initialFormDef.id)}`);
    if (!res.ok) return;
    const json = (await res.json()) as { formDef: FormDef };
    setFields(json.formDef.fields);
    setPreviewVersion((n) => n + 1);
  }, [initialFormDef.id]);

  async function saveField(
    body: Omit<FormFieldDef, 'id' | 'formId'>,
    editingFieldId: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    const endpoint = editingFieldId
      ? `/api/admin/forms/${encodeURIComponent(initialFormDef.id)}/fields/${encodeURIComponent(editingFieldId)}`
      : `/api/admin/forms/${encodeURIComponent(initialFormDef.id)}/fields`;
    const method = editingFieldId ? 'PUT' : 'POST';
    const res = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fieldKey: body.fieldKey,
        dataSource: body.dataSource,
        page: body.page,
        anchorLabel: body.anchorLabel,
        anchorSide: body.anchorSide,
        dx: body.dx,
        dy: body.dy,
        absX: body.absX,
        absY: body.absY,
        fontSize: body.fontSize,
        maxWidthPt: body.maxWidthPt,
        nearY: body.nearY,
      }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      return { ok: false, error: payload.detail ?? payload.error ?? `Save failed (${res.status})` };
    }
    await refreshFields();
    return { ok: true };
  }

  async function deleteField(fieldId: string): Promise<void> {
    const res = await fetch(
      `/api/admin/forms/${encodeURIComponent(initialFormDef.id)}/fields/${encodeURIComponent(fieldId)}`,
      { method: 'DELETE' },
    );
    if (res.ok) await refreshFields();
  }

  async function onPublish() {
    setPublishState({ kind: 'publishing' });
    const res = await fetch(`/api/admin/forms/${encodeURIComponent(initialFormDef.id)}/publish`, {
      method: 'POST',
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      setPublishState({
        kind: 'error',
        message: payload.detail ?? payload.error ?? `Publish failed (${res.status})`,
      });
      return;
    }
    setPublishState({ kind: 'success' });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_320px] md:gap-5 md:p-5 lg:grid-cols-[1fr_360px]">
      {/* Center — canvas + collapsible preview */}
      <div className="min-w-0 space-y-4">
        <MapperCanvas
          pngSignedUrl={pngSignedUrl}
          anchors={anchors}
          fields={fields}
          selectedFieldId={selectedFieldId}
          onAnchorClick={(label) => {
            // Open add-field modal with this anchor pre-selected.
            setModal({ kind: 'add' });
            setPendingAnchor(label.text);
          }}
          pageWidthPt={pageWidthPt}
          pageHeightPt={pageHeightPt}
        />

        <Card padding="none" bordered>
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="focus-ring flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted">
              {previewOpen ? <Eye className="-mt-0.5 mr-1.5 inline h-3 w-3" aria-hidden="true" /> : <EyeOff className="-mt-0.5 mr-1.5 inline h-3 w-3" aria-hidden="true" />}
              Live preview
            </span>
            {previewOpen ? (
              <ChevronUp className="h-4 w-4 text-ink-faint" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 text-ink-faint" aria-hidden="true" />
            )}
          </button>
          {previewOpen && (
            <iframe
              key={previewVersion}
              src={`/api/admin/forms/${encodeURIComponent(initialFormDef.id)}/preview?v=${previewVersion}`}
              title={`${initialFormDef.displayName} preview`}
              className="block h-[55vh] w-full border-t border-hairline bg-paper-deep"
            />
          )}
        </Card>
      </div>

      {/* Right — field panel */}
      <div className="space-y-4">
        <Card padding="md" bordered>
          <div className="flex items-baseline justify-between gap-2">
            <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted">
              Fields ({fields.length})
            </p>
            <StaticChip tone={isPublished ? 'success' : 'warning'}>
              {initialFormDef.status}
            </StaticChip>
          </div>

          {publishState.kind === 'error' && (
            <Banner tone="warning" title="Publish skipped" className="mt-3">
              {publishState.message}
            </Banner>
          )}
          {publishState.kind === 'success' && (
            <Banner tone="success" title="Published" className="mt-3">
              <CheckCircle2 className="-mt-0.5 mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              Form is now live in the registry.
            </Banner>
          )}

          <Button
            type="button"
            variant="primary"
            size="md"
            fullWidth
            onClick={() => {
              setPendingAnchor(null);
              setModal({ kind: 'add' });
            }}
            leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            className="mt-4"
          >
            Add field
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={onPublish}
            disabled={fields.length === 0 || publishState.kind === 'publishing' || isPublished}
            loading={publishState.kind === 'publishing'}
            leadingIcon={<Send className="h-4 w-4" aria-hidden="true" />}
            className="mt-2"
          >
            {isPublished ? 'Published' : 'Publish form'}
          </Button>
        </Card>

        <FieldList
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelect={setSelectedFieldId}
          onEdit={(f) => setModal({ kind: 'edit', field: f })}
          onDelete={deleteField}
        />
      </div>

      {modal.kind !== 'closed' && (
        <FieldModal
          mode={modal.kind}
          initialField={modal.kind === 'edit' ? modal.field : null}
          existingKeys={new Set(fields.map((f) => f.fieldKey))}
          anchors={anchors}
          initialAnchorLabel={pendingAnchor}
          onClose={() => {
            setModal({ kind: 'closed' });
            setPendingAnchor(null);
          }}
          onSave={async (body) => {
            const editingFieldId = modal.kind === 'edit' ? modal.field.id : null;
            const result = await saveField(body, editingFieldId);
            if (result.ok) {
              setModal({ kind: 'closed' });
              setPendingAnchor(null);
            }
            return result;
          }}
        />
      )}
    </div>
  );

}

// =============================================================================
// Canvas
// =============================================================================

function MapperCanvas({
  pngSignedUrl,
  anchors,
  fields,
  selectedFieldId,
  onAnchorClick,
  pageWidthPt,
  pageHeightPt,
}: {
  pngSignedUrl: string | null;
  anchors: readonly AnchorLabel[];
  fields: readonly FormFieldDef[];
  selectedFieldId: string | null;
  onAnchorClick: (label: AnchorLabel) => void;
  pageWidthPt: number;
  pageHeightPt: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayedWidth, setDisplayedWidth] = useState(0);
  const [displayedHeight, setDisplayedHeight] = useState(0);
  const [showAnchors, setShowAnchors] = useState(true);
  const [showFields, setShowFields] = useState(true);

  useEffect(() => {
    function measure() {
      const el = containerRef.current?.querySelector('img');
      if (el instanceof HTMLImageElement) {
        setDisplayedWidth(el.clientWidth);
        setDisplayedHeight(el.clientHeight);
      }
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [pngSignedUrl]);

  if (!pngSignedUrl) {
    return (
      <Card padding="lg" bordered>
        <EmptyState
          eyebrow="No background"
          title="Template PNG isn't in storage."
          description="This form was registered in code (e.g., ACORD_25) before the upload pipeline existed. You can still add and edit fields via the side panel, but anchor labels won't appear on the canvas."
        />
      </Card>
    );
  }

  // Scale from PDF points to displayed pixels.
  const sx = displayedWidth / pageWidthPt;
  const sy = displayedHeight / pageHeightPt;

  return (
    <Card padding="none" bordered>
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted">
          Template ({Math.round(pageWidthPt)} × {Math.round(pageHeightPt)} pt)
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAnchors((v) => !v)}
            className={`caps focus-ring -m-1 rounded p-1 text-[0.6rem] font-semibold tracking-[0.18em] transition-colors ${
              showAnchors ? 'text-brand' : 'text-ink-faint hover:text-ink'
            }`}
          >
            Anchors ({anchors.length})
          </button>
          <button
            type="button"
            onClick={() => setShowFields((v) => !v)}
            className={`caps focus-ring -m-1 rounded p-1 text-[0.6rem] font-semibold tracking-[0.18em] transition-colors ${
              showFields ? 'text-seal' : 'text-ink-faint hover:text-ink'
            }`}
          >
            Fields ({fields.length})
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative overflow-auto bg-paper-deep">
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pngSignedUrl}
            alt="Template background"
            className="block max-h-[70vh] w-auto"
          />

          {/* Anchor overlays */}
          {showAnchors &&
            displayedWidth > 0 &&
            anchors.map((label, i) => {
              const x = label.x * sx;
              // PDF y origin is bottom-left; CSS y origin is top-left. Flip.
              const y = (pageHeightPt - label.y - label.height) * sy;
              const w = Math.max(label.width * sx, 4);
              const h = Math.max(label.height * sy, 4);
              return (
                <button
                  key={`a-${i}`}
                  type="button"
                  onClick={() => onAnchorClick(label)}
                  className="absolute cursor-pointer border border-brand/0 bg-brand/0 transition-colors hover:border-brand/60 hover:bg-brand/20"
                  style={{ left: x, top: y, width: w, height: h }}
                  title={label.text}
                />
              );
            })}

          {/* Field markers */}
          {showFields &&
            displayedWidth > 0 &&
            fields.map((f) => {
              if (!f.anchorLabel) {
                // Absolute coord
                if (f.absX == null || f.absY == null) return null;
                const x = f.absX * sx;
                const y = (pageHeightPt - f.absY) * sy;
                return (
                  <FieldDot
                    key={f.id}
                    x={x}
                    y={y}
                    label={f.fieldKey}
                    selected={selectedFieldId === f.id}
                  />
                );
              }
              // Anchored — find the anchor + apply offset (best-effort, mirrors drawCore)
              const matches = anchors.filter((a) => a.text === f.anchorLabel);
              if (matches.length === 0) return null;
              const anchor =
                f.nearY != null && matches.length > 1
                  ? matches.reduce((best, l) =>
                      Math.abs(l.y - f.nearY!) < Math.abs(best.y - f.nearY!) ? l : best,
                    )
                  : matches[0]!;
              const { x: px, y: py } = positionFromAnchor(anchor, f.anchorSide!, f.dx, f.dy);
              const x = px * sx;
              const y = (pageHeightPt - py) * sy;
              return (
                <FieldDot
                  key={f.id}
                  x={x}
                  y={y}
                  label={f.fieldKey}
                  selected={selectedFieldId === f.id}
                />
              );
            })}
        </div>
      </div>
    </Card>
  );
}

function FieldDot({
  x,
  y,
  label,
  selected,
}: {
  x: number;
  y: number;
  label: string;
  selected: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: x, top: y }}
    >
      <span
        className={`block h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-paper-deep ${
          selected ? 'bg-brand ring-brand/40' : 'bg-seal ring-seal/40'
        }`}
      />
      {selected && (
        <span className="caps absolute left-3 top-0 whitespace-nowrap rounded bg-ink/85 px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold text-paper">
          {label}
        </span>
      )}
    </div>
  );
}

function positionFromAnchor(
  anchor: AnchorLabel,
  side: AnchorSide,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const LINE_HEIGHT = 12;
  switch (side) {
    case 'right':
      return { x: anchor.x + anchor.width + dx, y: anchor.y + dy };
    case 'left':
      return { x: anchor.x + dx, y: anchor.y + dy };
    case 'below':
      return { x: anchor.x + dx, y: anchor.y - LINE_HEIGHT + dy };
    case 'above':
      return { x: anchor.x + dx, y: anchor.y + LINE_HEIGHT + dy };
    case 'row':
      return { x: dx, y: anchor.y + dy };
    case 'inside':
      return { x: anchor.x + dx, y: anchor.y + dy };
  }
}

// =============================================================================
// Field list (grouped by dictionary group)
// =============================================================================

function FieldList({
  fields,
  selectedFieldId,
  onSelect,
  onEdit,
  onDelete,
}: {
  fields: readonly FormFieldDef[];
  selectedFieldId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (f: FormFieldDef) => void;
  onDelete: (id: string) => void;
}) {
  if (fields.length === 0) {
    return (
      <Card padding="md" bordered>
        <EmptyState
          eyebrow="No fields yet"
          title="Click Add field above."
          description="Pick a dictionary entry and pin it to an anchor on the template. Live preview re-renders after each save."
        />
      </Card>
    );
  }

  // Group by dictionary group; unknown keys (custom) get their own bucket.
  const groups = new Map<FieldGroup | 'custom', FormFieldDef[]>();
  for (const f of fields) {
    const entry = getDictionaryEntry(f.fieldKey);
    const key = entry?.group ?? 'custom';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  return (
    <Card padding="none" bordered>
      <div className="max-h-[60vh] overflow-y-auto">
        {[...groups.entries()].map(([group, items]) => (
          <div key={group} className="border-b border-hairline last:border-b-0">
            <p className="caps sticky top-0 z-10 bg-paper-deep/95 px-4 py-2 text-[0.58rem] font-semibold tracking-[0.18em] text-ink-faint backdrop-blur">
              {group} ({items.length})
            </p>
            <ul className="divide-y divide-hairline">
              {items.map((f) => {
                const entry = getDictionaryEntry(f.fieldKey);
                const isSelected = selectedFieldId === f.id;
                return (
                  <li
                    key={f.id}
                    className={`group flex items-center gap-2 px-4 py-2.5 transition-colors ${
                      isSelected ? 'bg-brand-soft/40' : 'hover:bg-paper-deep/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(isSelected ? null : f.id)}
                      className="focus-ring -m-1 flex min-w-0 flex-1 items-baseline gap-2 rounded p-1 text-left"
                    >
                      <span className="truncate text-[0.8125rem] font-medium text-ink">
                        {entry?.label ?? f.fieldKey}
                      </span>
                      <span className="caps shrink-0 font-mono text-[0.55rem] text-ink-faint">
                        {f.anchorLabel ?? 'abs'}
                      </span>
                    </button>
                    <IconButton
                      label="Edit"
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(f)}
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label="Delete"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(f.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

// =============================================================================
// Field modal (add + edit)
// =============================================================================

type FieldFormBody = Omit<FormFieldDef, 'id' | 'formId'>;

function FieldModal({
  mode,
  initialField,
  existingKeys,
  anchors,
  initialAnchorLabel,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  initialField: FormFieldDef | null;
  existingKeys: Set<string>;
  anchors: readonly AnchorLabel[];
  initialAnchorLabel: string | null;
  onClose: () => void;
  onSave: (body: FieldFormBody) => Promise<{ ok: boolean; error?: string }>;
}) {
  const dictByGroup = useMemo(() => dictionaryByGroup(), []);
  const [fieldKey, setFieldKey] = useState(initialField?.fieldKey ?? '');
  const [anchorMode, setAnchorMode] = useState<'anchored' | 'absolute'>(
    initialField && !initialField.anchorLabel ? 'absolute' : 'anchored',
  );
  const [anchorLabel, setAnchorLabel] = useState(
    initialField?.anchorLabel ?? initialAnchorLabel ?? '',
  );
  const [anchorSide, setAnchorSide] = useState<AnchorSide>(initialField?.anchorSide ?? 'right');
  const [dx, setDx] = useState<number>(initialField?.dx ?? 0);
  const [dy, setDy] = useState<number>(initialField?.dy ?? 0);
  const [absX, setAbsX] = useState<number>(initialField?.absX ?? 100);
  const [absY, setAbsY] = useState<number>(initialField?.absY ?? 700);
  const [fontSize, setFontSize] = useState<number>(initialField?.fontSize ?? 7.5);
  const [maxWidthPt, setMaxWidthPt] = useState<string>(
    initialField?.maxWidthPt != null ? String(initialField.maxWidthPt) : '',
  );
  const [nearY, setNearY] = useState<string>(
    initialField?.nearY != null ? String(initialField.nearY) : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDuplicateKey =
    mode === 'add' && existingKeys.has(fieldKey);

  async function submit() {
    setError(null);
    if (!fieldKey) {
      setError('Pick a field from the dictionary');
      return;
    }
    if (anchorMode === 'anchored' && (!anchorLabel || !anchorSide)) {
      setError('Anchored fields need an anchor label and side');
      return;
    }
    setSubmitting(true);
    const body: FieldFormBody = {
      fieldKey,
      dataSource: fieldKey, // V1: data_source mirrors fieldKey for dictionary entries
      page: 1,
      anchorLabel: anchorMode === 'anchored' ? anchorLabel : null,
      anchorSide: anchorMode === 'anchored' ? anchorSide : null,
      dx: anchorMode === 'anchored' ? dx : 0,
      dy: anchorMode === 'anchored' ? dy : 0,
      absX: anchorMode === 'absolute' ? absX : null,
      absY: anchorMode === 'absolute' ? absY : null,
      fontSize,
      maxWidthPt: maxWidthPt.trim() ? Number(maxWidthPt) : null,
      nearY: nearY.trim() ? Number(nearY) : null,
    };
    const result = await onSave(body);
    setSubmitting(false);
    if (!result.ok) setError(result.error ?? 'Save failed');
  }

  // Sorted anchor list for the picker — deduped, alphabetical.
  const anchorOptions = useMemo(() => {
    const set = new Set(anchors.map((a) => a.text));
    return [...set].sort();
  }, [anchors]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[8vh] backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--r-lg)] border border-hairline-strong bg-card shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <p className="font-display text-[1.05rem] font-medium tracking-tight text-ink">
            {mode === 'add' ? 'Add field' : 'Edit field'}
          </p>
          <IconButton label="Close" size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <Banner tone="danger" title="Couldn't save">
              {error}
            </Banner>
          )}

          {/* Field key picker */}
          <div>
            <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
              Dictionary field <span className="text-danger">*</span>
            </label>
            <select
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              disabled={mode === 'edit'}
              className="field-underline mt-1.5 block w-full text-ink disabled:opacity-60"
            >
              <option value="">— Pick a field —</option>
              {Object.entries(dictByGroup).map(([group, entries]) => (
                <optgroup key={group} label={group.toUpperCase()}>
                  {entries.map((entry) => (
                    <option
                      key={entry.key}
                      value={entry.key}
                      disabled={mode === 'add' && existingKeys.has(entry.key)}
                    >
                      {entry.label}
                      {mode === 'add' && existingKeys.has(entry.key) ? ' (mapped)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {isDuplicateKey && (
              <p className="mt-1 text-[0.72rem] text-danger">
                This field is already mapped — edit the existing entry instead.
              </p>
            )}
          </div>

          {/* Anchored vs Absolute mode */}
          <div>
            <p className="caps mb-1.5 text-[0.62rem] font-semibold tracking-caps text-ink-muted">
              Position
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAnchorMode('anchored')}
                className={`caps focus-ring rounded-full border px-3 py-1.5 text-[0.62rem] font-semibold tracking-[0.12em] transition-colors ${
                  anchorMode === 'anchored'
                    ? 'border-brand bg-brand text-white'
                    : 'border-hairline-strong text-ink-muted hover:text-ink'
                }`}
              >
                Anchored
              </button>
              <button
                type="button"
                onClick={() => setAnchorMode('absolute')}
                className={`caps focus-ring rounded-full border px-3 py-1.5 text-[0.62rem] font-semibold tracking-[0.12em] transition-colors ${
                  anchorMode === 'absolute'
                    ? 'border-brand bg-brand text-white'
                    : 'border-hairline-strong text-ink-muted hover:text-ink'
                }`}
              >
                Absolute
              </button>
            </div>
          </div>

          {anchorMode === 'anchored' ? (
            <>
              <div>
                <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                  Anchor label <span className="text-danger">*</span>
                </label>
                <select
                  value={anchorLabel}
                  onChange={(e) => setAnchorLabel(e.target.value)}
                  className="field-underline mt-1.5 block w-full text-ink"
                >
                  <option value="">— Pick an anchor —</option>
                  {anchorOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[0.7rem] text-ink-faint">
                  Or click an anchor on the canvas to pre-fill this.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                    Side
                  </label>
                  <select
                    value={anchorSide}
                    onChange={(e) => setAnchorSide(e.target.value as AnchorSide)}
                    className="field-underline mt-1.5 block w-full text-ink"
                  >
                    {(['right', 'left', 'below', 'above', 'row', 'inside'] as const).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                    dx (pt)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={dx}
                    onChange={(e) => setDx(Number(e.target.value))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                    dy (pt)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={dy}
                    onChange={(e) => setDy(Number(e.target.value))}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                  Near Y (disambiguator)
                </label>
                <Input
                  type="text"
                  value={nearY}
                  onChange={(e) => setNearY(e.target.value)}
                  placeholder="e.g., 470"
                  className="mt-1.5"
                />
                <p className="mt-1 text-[0.7rem] text-ink-faint">
                  Optional. Set when the anchor label appears multiple times — picks the one
                  whose y is closest to this value.
                </p>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                  abs X (pt) <span className="text-danger">*</span>
                </label>
                <Input
                  type="number"
                  step="1"
                  value={absX}
                  onChange={(e) => setAbsX(Number(e.target.value))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                  abs Y (pt) <span className="text-danger">*</span>
                </label>
                <Input
                  type="number"
                  step="1"
                  value={absY}
                  onChange={(e) => setAbsY(Number(e.target.value))}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                Font size (pt)
              </label>
              <Input
                type="number"
                step="0.5"
                min="4"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted">
                Max width (pt)
              </label>
              <Input
                type="text"
                value={maxWidthPt}
                onChange={(e) => setMaxWidthPt(e.target.value)}
                placeholder="optional"
                className="mt-1.5"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline bg-paper-deep/40 px-5 py-3">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={submitting || isDuplicateKey}
            onClick={submit}
          >
            {mode === 'add' ? 'Add field' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
