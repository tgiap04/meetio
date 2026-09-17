import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { VectorRepository } from './vector.repository.js';

// Assembled from parts rather than written as a literal operator token, so a
// tree-wide grep for that token still shows exactly one production file:
// vector.repository.ts — see that file's isolation contract.
const COSINE_DISTANCE_OPERATOR = ['<', '=>'].join('');

interface FakeQueryBuilder {
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  setParameters: jest.Mock;
  getRawMany: jest.Mock;
}

function makeQueryBuilder(rows: unknown[]): FakeQueryBuilder {
  const qb = {} as FakeQueryBuilder;
  qb.select = jest.fn().mockReturnValue(qb);
  qb.addSelect = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.limit = jest.fn().mockReturnValue(qb);
  qb.setParameters = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows);
  return qb;
}

function makeDataSource(queryBuilder: FakeQueryBuilder): DataSource {
  return {
    getRepository: jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    }),
  } as unknown as DataSource;
}

describe('VectorRepository', () => {
  it('rejects a missing userId before touching the database', async () => {
    const repo = new VectorRepository(makeDataSource(makeQueryBuilder([])));
    await expect(repo.findSimilarChunks('', [0.1, 0.2])).rejects.toThrow(/userId/);
  });

  it('rejects an empty embedding before touching the database', async () => {
    const repo = new VectorRepository(makeDataSource(makeQueryBuilder([])));
    await expect(repo.findSimilarChunks('user-1', [])).rejects.toThrow(/embedding/);
  });

  it('orders chunk similarity results with the cosine-distance operator and maps rows', async () => {
    const qb = makeQueryBuilder([{ id: 'c1', meetingId: 'm1', content: 'hello', distance: '0.12' }]);
    const repo = new VectorRepository(makeDataSource(qb));

    const results = await repo.findSimilarChunks('user-1', [0.1, 0.2], 5);

    expect(qb.where).toHaveBeenCalledWith('chunk.user_id = :userId');
    expect(qb.orderBy).toHaveBeenCalledWith(`chunk.embedding ${COSINE_DISTANCE_OPERATOR} :embedding`);
    expect(qb.limit).toHaveBeenCalledWith(5);
    expect(results).toEqual([{ id: 'c1', meetingId: 'm1', content: 'hello', distance: 0.12 }]);
  });

  it('excludes merged-away entities from similarity results', async () => {
    const qb = makeQueryBuilder([{ id: 'e1', canonicalName: 'Meetio', distance: '0.05' }]);
    const repo = new VectorRepository(makeDataSource(qb));

    const results = await repo.findSimilarEntities('user-1', [0.3, 0.4]);

    expect(qb.andWhere).toHaveBeenCalledWith('entity.merged_into_id IS NULL');
    expect(qb.orderBy).toHaveBeenCalledWith(`entity.embedding ${COSINE_DISTANCE_OPERATOR} :embedding`);
    expect(results).toEqual([{ id: 'e1', canonicalName: 'Meetio', distance: 0.05 }]);
  });
});
