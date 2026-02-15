'use client';

import React from 'react';
import { useState } from 'react';

type RequestStatus =
  | { type: 'idle' }
  | { type: 'success'; message: string; jobId: string }
  | { type: 'error'; message: string };

export function parseLanguageInput(value: string): string[] {
  return [...new Set(value.split(',').map((lang) => lang.trim()).filter(Boolean))];
}

export function NewJobForm() {
  const [muxAssetId, setMuxAssetId] = useState('sample-mux-asset');
  const [languages, setLanguages] = useState('es,fr');
  const [generateVoiceover, setGenerateVoiceover] = useState(false);
  const [uploadMux, setUploadMux] = useState(false);
  const [notifyCms, setNotifyCms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<RequestStatus>({ type: 'idle' });

  const canSubmit = muxAssetId.trim().length > 0 && !isSubmitting;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!muxAssetId.trim()) {
      setStatus({ type: 'error', message: 'Mux Asset ID is required.' });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: 'idle' });

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          muxAssetId: muxAssetId.trim(),
          languages: parseLanguageInput(languages),
          options: {
            generateVoiceover,
            uploadMux,
            notifyCms
          }
        })
      });

      const json = (await response.json()) as { jobId?: string; error?: string };

      if (!response.ok || !json.jobId) {
        throw new Error(json.error ?? 'Failed to create job.');
      }

      setStatus({
        type: 'success',
        jobId: json.jobId,
        message: `Job ${json.jobId} created. Refresh to see updates.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create job.';
      setStatus({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h2 style={{ marginTop: 0 }}>Create Enrichment Job</h2>
      <div className="grid cols-2">
        <label>
          <div className="small">Mux Asset ID</div>
          <input
            value={muxAssetId}
            onChange={(e) => setMuxAssetId(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label>
          <div className="small">Languages (comma-separated)</div>
          <input
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
            style={{ width: '100%', padding: 8 }}
            placeholder="es,fr,de"
          />
        </label>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label>
          <input
            type="checkbox"
            checked={generateVoiceover}
            onChange={(e) => setGenerateVoiceover(e.target.checked)}
          />{' '}
          Generate voiceover
        </label>
        <label>
          <input
            type="checkbox"
            checked={uploadMux}
            onChange={(e) => setUploadMux(e.target.checked)}
          />{' '}
          Upload to Mux
        </label>
        <label>
          <input
            type="checkbox"
            checked={notifyCms}
            onChange={(e) => setNotifyCms(e.target.checked)}
          />{' '}
          Notify CMS (Strapi)
        </label>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" disabled={!canSubmit} style={{ padding: '8px 14px' }}>
          {isSubmitting ? 'Creating...' : 'Start Job'}
        </button>
      </div>

      {status.type !== 'idle' && (
        <p
          role="status"
          aria-live="polite"
          className="small"
          style={{ marginTop: 10, color: status.type === 'error' ? 'var(--error)' : 'var(--ok)' }}
        >
          {status.message}{' '}
          {status.type === 'success' ? <a href={`/dashboard/jobs/${status.jobId}`}>Open job</a> : null}
        </p>
      )}
    </form>
  );
}
