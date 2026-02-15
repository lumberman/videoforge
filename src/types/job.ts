export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export type WorkflowStepName =
  | 'download_video'
  | 'transcription'
  | 'structured_transcript'
  | 'chapters'
  | 'metadata'
  | 'embeddings'
  | 'translation'
  | 'voiceover'
  | 'artifact_upload'
  | 'mux_upload'
  | 'cms_notify';

export interface JobOptions {
  generateVoiceover?: boolean;
  uploadMux?: boolean;
  notifyCms?: boolean;
}

export interface JobCreatePayload {
  muxAssetId: string;
  languages: string[];
  options?: JobOptions;
}

export interface JobStepState {
  name: WorkflowStepName;
  status: StepStatus;
  retries: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface JobErrorDetails {
  code?: string;
  operatorHint?: string;
  isDependencyError?: boolean;
}

export interface JobError {
  step: WorkflowStepName;
  message: string;
  at: string;
  code?: string;
  operatorHint?: string;
  isDependencyError?: boolean;
}

export interface JobRecord {
  id: string;
  muxAssetId: string;
  languages: string[];
  options: JobOptions;
  status: JobStatus;
  currentStep?: WorkflowStepName;
  retries: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  artifacts: Record<string, string>;
  steps: JobStepState[];
  errors: JobError[];
}

export interface JobsDb {
  jobs: JobRecord[];
}
