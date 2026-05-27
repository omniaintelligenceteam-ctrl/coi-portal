'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Upload } from 'lucide-react';
import { ActionBar, Banner, Button, Card, Input } from '@/app/components/ui';

/**
 * Single-step upload form. Validates client-side that:
 *   - a PDF file is picked
 *   - formId is uppercase + underscores
 *   - displayName + revision are non-empty
 *
 * Submits multipart to POST /api/admin/forms. Redirects to the mapper on
 * success; surfaces server error inline on failure.
 *
 * formId auto-derives from displayName (uppercase, spaces → underscores)
 * unless the admin manually edits it.
 */

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; formId: string };

function deriveFormId(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

export function NewFormWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [revision, setRevision] = useState('');
  const [formId, setFormId] = useState('');
  const [formIdEdited, setFormIdEdited] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    if (next && next.type !== 'application/pdf') {
      setState({ kind: 'error', message: 'Only PDF files can be uploaded.' });
      return;
    }
    setFile(next);
    setState({ kind: 'idle' });
  }

  function onChangeName(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setDisplayName(next);
    if (!formIdEdited) setFormId(deriveFormId(next));
  }

  function onChangeFormId(e: ChangeEvent<HTMLInputElement>) {
    setFormId(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
    setFormIdEdited(true);
  }

  const formIdValid = /^[A-Z][A-Z0-9_]{1,49}$/.test(formId);
  const canSubmit =
    file && displayName.trim() && revision.trim() && formIdValid && state.kind !== 'submitting';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !canSubmit) return;
    setState({ kind: 'submitting' });

    const body = new FormData();
    body.append('pdf', file);
    body.append('displayName', displayName.trim());
    body.append('revision', revision.trim());
    body.append('formId', formId);

    try {
      const res = await fetch('/api/admin/forms', { method: 'POST', body });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        setState({
          kind: 'error',
          message: payload.detail ?? payload.error ?? `Upload failed (${res.status})`,
        });
        return;
      }
      const json = (await res.json()) as { formId: string; mapperUrl: string };
      setState({ kind: 'success', formId: json.formId });
      router.push(json.mapperUrl);
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {state.kind === 'error' && (
        <Banner tone="danger" title="Couldn't upload">
          {state.message}
        </Banner>
      )}

      {/* PDF drop zone */}
      <Card padding="md" bordered>
        <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted">
          1 · PDF template
        </p>
        <div
          className="mt-3 flex flex-col items-center justify-center rounded-[var(--r-md)] border-2 border-dashed border-hairline-strong bg-paper-deep/30 px-6 py-10 text-center transition-colors hover:border-brand/50 hover:bg-brand-soft/30"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) {
              if (dropped.type !== 'application/pdf') {
                setState({ kind: 'error', message: 'Only PDF files can be uploaded.' });
                return;
              }
              setFile(dropped);
              setState({ kind: 'idle' });
            }
          }}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={onPickFile}
          />
          {file ? (
            <>
              <FileText className="mb-3 h-6 w-6 text-brand" aria-hidden="true" />
              <p className="text-[0.95rem] font-medium text-ink">{file.name}</p>
              <p className="mt-1 font-mono text-[0.72rem] text-ink-muted">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="caps mt-3 -m-1 rounded p-1 text-[0.6rem] font-semibold tracking-[0.18em] text-brand hover:text-brand-deep"
              >
                Pick another file
              </button>
            </>
          ) : (
            <>
              <Upload className="mb-3 h-6 w-6 text-ink-faint" aria-hidden="true" />
              <p className="text-[0.95rem] font-medium text-ink">
                Drop a PDF or click to browse
              </p>
              <p className="mt-1 text-[0.78rem] text-ink-muted">
                Letter or Legal size. Page 1 will be rasterized at 300 DPI.
              </p>
            </>
          )}
        </div>
      </Card>

      {/* Metadata */}
      <Card padding="md" bordered>
        <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted">
          2 · Form details
        </p>
        <div className="mt-4 space-y-5">
          <div>
            <label
              htmlFor="display-name"
              className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted"
            >
              Display name <span className="text-danger">*</span>
            </label>
            <Input
              id="display-name"
              value={displayName}
              onChange={onChangeName}
              placeholder="Certificate of Liability Insurance"
              className="mt-1.5"
              required
            />
          </div>

          <div>
            <label
              htmlFor="revision"
              className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted"
            >
              Revision <span className="text-danger">*</span>
            </label>
            <Input
              id="revision"
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
              placeholder="2016/03"
              className="mt-1.5"
              required
            />
            <p className="mt-1.5 text-[0.72rem] text-ink-faint">
              ACORD form revision tag — appears below the form name in the library.
            </p>
          </div>

          <div>
            <label
              htmlFor="form-id"
              className="caps block text-[0.62rem] font-semibold tracking-caps text-ink-muted"
            >
              Form ID <span className="text-danger">*</span>
            </label>
            <Input
              id="form-id"
              value={formId}
              onChange={onChangeFormId}
              placeholder="ACORD_27"
              className="mt-1.5 font-mono"
              required
            />
            <p className="mt-1.5 text-[0.72rem] text-ink-faint">
              Stable identifier (uppercase + underscores, 2-50 chars). Auto-derived from the
              display name — edit if you want a different ID.
            </p>
            {formId && !formIdValid && (
              <p className="mt-1 text-[0.72rem] text-danger">
                Use uppercase letters, digits, and underscores only. Must start with a letter.
              </p>
            )}
          </div>
        </div>
      </Card>

      <ActionBar context="Uploading takes a few seconds — we'll rasterize the PDF and extract anchor labels before showing the mapper.">
        <Button
          type="submit"
          size="lg"
          variant="primary"
          loading={state.kind === 'submitting'}
          disabled={!canSubmit}
          className="sm:ml-auto"
        >
          {state.kind === 'submitting' ? 'Uploading…' : 'Upload + start mapping'}
        </Button>
      </ActionBar>
    </form>
  );
}
