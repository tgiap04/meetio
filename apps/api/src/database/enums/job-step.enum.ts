/**
 * Pipeline stage of an async meeting-processing job.
 * Mirrors PG enum `job_step` (see docs/data-model.md §6).
 */
export enum JobStep {
  CHUNK = 'chunk',
  EMBED = 'embed',
  EXTRACT = 'extract',
  RESOLVE = 'resolve',
  SUMMARIZE = 'summarize',
}
