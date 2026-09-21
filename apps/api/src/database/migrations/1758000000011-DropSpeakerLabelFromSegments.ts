import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Drops `transcript_segments.speaker_label` (docs/data-model.md §0, US-13).
 *
 * The product's primary scenario is a phone sitting next to a laptop, picking
 * up an online meeting through the laptop speaker. That is a single mixed
 * audio stream: the on-device recogniser cannot separate who is talking, and
 * the user cannot tag a speaker for people on the far end of a call. Keeping
 * the column would guarantee a field that is either always NULL or wrong, and
 * a column nothing can ever fill correctly is worse than no column — every
 * reader has to rediscover that it is dead.
 *
 * No meetings endpoint exists yet (phase-04 is still pending), so nothing
 * writes this column outside the dev seed. Dropping it now costs nothing;
 * dropping it after the transcript API ships would cost a contract change.
 */
export class DropSpeakerLabelFromSegments1758000000011 implements MigrationInterface {
  name = 'DropSpeakerLabelFromSegments1758000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('transcript_segments', 'speaker_label');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreated nullable and empty. Any labels that existed before `up()` ran
    // are gone — they were dev seed data only, and the product no longer has a
    // path that produces them, so there is nothing to restore them from.
    await queryRunner.addColumn(
      'transcript_segments',
      new TableColumn({ name: 'speaker_label', type: 'text', isNullable: true }),
    );
  }
}
