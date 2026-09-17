import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Meeting } from './meeting.entity.js';
import { JobStep } from '../enums/job-step.enum.js';
import { JobStatus } from '../enums/job-status.enum.js';

/**
 * One step of the async meeting-processing pipeline. `UNIQUE (meeting_id,
 * step)` is what makes retries idempotent — a step already `succeeded` is
 * skipped on rerun (docs/data-model.md §6, US-29).
 */
@Entity('processing_jobs')
@Index('uq_job_meeting_step', ['meeting_id', 'step'], { unique: true })
export class ProcessingJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'meeting_id', type: 'uuid' })
  meeting_id!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting;

  @Column({ type: 'enum', enum: JobStep, enumName: 'job_step' })
  step!: JobStep;

  @Column({
    type: 'enum',
    enum: JobStatus,
    enumName: 'job_status',
    default: JobStatus.PENDING,
  })
  status!: JobStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  started_at!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finished_at!: Date | null;
}
