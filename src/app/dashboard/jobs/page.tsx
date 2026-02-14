import Link from 'next/link';
import { listJobs } from '@/data/job-store';
import { getRuntimeWarnings } from '@/config/env';
import { formatStepName } from '@/lib/workflow-steps';
import { NewJobForm } from './new-job-form';

export const dynamic = 'force-dynamic';

function formatDate(iso?: string): string {
  if (!iso) {
    return 'n/a';
  }
  return new Date(iso).toLocaleString();
}

export default async function JobsPage() {
  const jobs = await listJobs();
  const warnings = getRuntimeWarnings();

  return (
    <main className="container grid">
      {warnings.length > 0 && (
        <section className="card" style={{ borderColor: '#f59e0b' }}>
          <strong>Runtime warnings</strong>
          <ul className="small">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <NewJobForm />

      <section className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}
        >
          <h2 style={{ margin: 0 }}>Jobs</h2>
          <Link href="/dashboard/jobs">Refresh</Link>
        </div>

        {jobs.length === 0 ? (
          <p className="small">No jobs yet. Create one to start the workflow.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Status</th>
                <th>Current step</th>
                <th>Retries</th>
                <th>Created</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <code>{job.id}</code>
                    <div className="small">mux: {job.muxAssetId}</div>
                  </td>
                  <td>
                    <span className={`badge ${job.status}`}>{job.status}</span>
                  </td>
                  <td>{job.currentStep ? formatStepName(job.currentStep) : 'n/a'}</td>
                  <td>{job.retries}</td>
                  <td>{formatDate(job.createdAt)}</td>
                  <td>
                    <Link href={`/dashboard/jobs/${job.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
