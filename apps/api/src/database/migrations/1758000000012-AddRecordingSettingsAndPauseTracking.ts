import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adds what phase-04 needs on `meetings` and the schema never had:
 *
 * - `audio_source` / `recording_quality` — docs/data-model.md §2 lists both
 *   (US-42, US-43) and `POST /meetings` takes both, but no migration ever
 *   created them. Existing rows get the defaults the mobile settings screen
 *   starts from, so the columns can be NOT NULL from day one.
 * - `paused_at` / `paused_duration_ms` — `duration_sec` must exclude paused
 *   time (US-09). Without them the server can only compute wall-clock time,
 *   which is exactly what the story says not to report. `paused_at` is set
 *   while paused; `resume` folds the elapsed pause into `paused_duration_ms`.
 */
export class AddRecordingSettingsAndPauseTracking1758000000012 implements MigrationInterface {
  name = 'AddRecordingSettingsAndPauseTracking1758000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM creates each enum type with its column, and drops it with the column in down().
    await queryRunner.addColumns('meetings', [
      new TableColumn({
        name: 'audio_source',
        type: 'enum',
        enumName: 'audio_source',
        enum: ['device_mic', 'external_bluetooth'],
        default: "'device_mic'",
      }),
      new TableColumn({
        name: 'recording_quality',
        type: 'enum',
        enumName: 'recording_quality',
        enum: ['standard', 'high'],
        default: "'standard'",
      }),
      new TableColumn({ name: 'paused_at', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'paused_duration_ms', type: 'bigint', default: 0 }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('meetings', ['paused_duration_ms', 'paused_at', 'recording_quality', 'audio_source']);
  }
}
