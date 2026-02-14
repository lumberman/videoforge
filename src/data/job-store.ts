import { env } from '@/config/env';
import { createId } from '@/lib/id';
import { updateJsonFile, readJsonFile } from '@/lib/json-store';
import { buildInitialSteps } from '@/lib/workflow-steps';
import type {
  JobCreatePayload,
  JobError,
  JobRecord,
  JobsDb,
  JobStatus,
  StepStatus,
  WorkflowStepName
} from '@/types/job';

const EMPTY_DB: JobsDb = { jobs: [] };

async function loadDb(): Promise<JobsDb> {
  return readJsonFile(env.jobsDbPath, EMPTY_DB);
}

export async function listJobs(): Promise<JobRecord[]> {
  const db = await loadDb();
  return [...db.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJobById(id: string): Promise<JobRecord | undefined> {
  const db = await loadDb();
  return db.jobs.find((job) => job.id === id);
}

export async function createJob(payload: JobCreatePayload): Promise<JobRecord> {
  const now = new Date().toISOString();
  const job: JobRecord = {
    id: createId('job'),
    muxAssetId: payload.muxAssetId,
    languages: payload.languages,
    options: payload.options ?? {},
    status: 'pending',
    retries: 0,
    createdAt: now,
    updatedAt: now,
    artifacts: {},
    steps: buildInitialSteps(),
    errors: []
  };

  await updateJsonFile(env.jobsDbPath, EMPTY_DB, (db) => ({
    jobs: [...db.jobs, job]
  }));

  return job;
}

export async function mutateJob(
  jobId: string,
  mutator: (job: JobRecord) => JobRecord
): Promise<JobRecord | undefined> {
  let updated: JobRecord | undefined;

  await updateJsonFile(env.jobsDbPath, EMPTY_DB, (db) => {
    const jobs = db.jobs.map((job) => {
      if (job.id !== jobId) {
        return job;
      }
      updated = mutator(job);
      return updated;
    });
    return { jobs };
  });

  return updated;
}

export async function setJobStatus(
  jobId: string,
  status: JobStatus,
  currentStep?: WorkflowStepName
): Promise<void> {
  await mutateJob(jobId, (job) => {
    const now = new Date().toISOString();
    return {
      ...job,
      status,
      currentStep: currentStep ?? job.currentStep,
      startedAt: job.startedAt ?? (status === 'running' ? now : job.startedAt),
      completedAt:
        status === 'completed' || status === 'failed' ? now : job.completedAt,
      updatedAt: now
    };
  });
}

export async function updateStepStatus(
  jobId: string,
  step: WorkflowStepName,
  status: StepStatus,
  opts?: { error?: string; incrementRetry?: boolean }
): Promise<void> {
  await mutateJob(jobId, (job) => {
    const now = new Date().toISOString();
    const stepState = job.steps.find((s) => s.name === step);
    const nextRetries = opts?.incrementRetry ? job.retries + 1 : job.retries;

    if (!stepState) {
      return { ...job, updatedAt: now, retries: nextRetries };
    }

    const nextErrors: JobError[] = [...job.errors];
    if (opts?.error) {
      nextErrors.push({ step, message: opts.error, at: now });
    }

    return {
      ...job,
      retries: nextRetries,
      currentStep: status === 'running' ? step : job.currentStep,
      steps: job.steps.map((s) => {
        if (s.name !== step) {
          return s;
        }
        return {
          ...s,
          status,
          retries: opts?.incrementRetry ? s.retries + 1 : s.retries,
          startedAt: s.startedAt ?? (status === 'running' ? now : s.startedAt),
          finishedAt:
            status === 'completed' || status === 'failed' || status === 'skipped'
              ? now
              : s.finishedAt,
          error:
            opts?.error ??
            (status === 'running' || status === 'completed' || status === 'skipped'
              ? undefined
              : s.error)
        };
      }),
      errors: nextErrors,
      updatedAt: now
    };
  });
}

export async function mergeArtifacts(
  jobId: string,
  artifacts: Record<string, string>
): Promise<void> {
  await mutateJob(jobId, (job) => ({
    ...job,
    artifacts: {
      ...job.artifacts,
      ...artifacts
    },
    updatedAt: new Date().toISOString()
  }));
}
