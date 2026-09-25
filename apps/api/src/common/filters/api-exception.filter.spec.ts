import { jest } from '@jest/globals';
import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';
import { ApiExceptionFilter } from './api-exception.filter.js';

function createHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('preserves an explicit code/details set on the exception response body', () => {
    const { host, json, status } = createHost();
    const exception = new HttpException(
      { code: ApiErrorCode.QUOTA_EXCEEDED, message: 'over budget', details: { limit: 100 } },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      error: { code: ApiErrorCode.QUOTA_EXCEEDED, message: 'over budget', details: { limit: 100 } },
    });
  });

  describe('never guesses a domain-specific code from an HTTP status (api-spec §9)', () => {
    it('maps an unclassified 404 to NOT_FOUND, not MEETING_NOT_FOUND', () => {
      const { host, json, status } = createHost();
      filter.catch(new NotFoundException('Cannot GET /api/nope'), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(json).toHaveBeenCalledWith({
        error: { code: ApiErrorCode.NOT_FOUND, message: 'Cannot GET /api/nope', details: {} },
      });
    });

    it('maps an unclassified failure to INTERNAL_ERROR, not PROCESSING_FAILED', () => {
      const { host, json, status } = createHost();
      filter.catch(new Error('boom'), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json).toHaveBeenCalledWith({
        error: { code: ApiErrorCode.INTERNAL_ERROR, message: 'Lỗi hệ thống, vui lòng thử lại sau', details: {} },
      });
    });

    it('never forwards the text of a non-HTTP error to the client', () => {
      const { host, json } = createHost();
      filter.catch(new Error('duplicate key value violates unique constraint "uq_segment_meeting_seq"'), host);
      const body = JSON.stringify(json.mock.calls[0][0]);
      expect(body).not.toContain('uq_segment_meeting_seq');
      expect(body).not.toContain('duplicate key');
    });

    it('maps a validation failure to VALIDATION_ERROR', () => {
      const { host, json, status } = createHost();
      filter.catch(new BadRequestException(['email must be an email']), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(json).toHaveBeenCalledWith({
        error: {
          code: ApiErrorCode.VALIDATION_ERROR,
          message: 'email must be an email',
          details: {},
        },
      });
    });

    it('reserves PROCESSING_FAILED for 422, where api-spec §9 puts it', () => {
      const { host, json } = createHost();
      filter.catch(new HttpException('pipeline died', HttpStatus.UNPROCESSABLE_ENTITY), host);

      expect(json).toHaveBeenCalledWith({
        error: { code: ApiErrorCode.PROCESSING_FAILED, message: 'pipeline died', details: {} },
      });
    });
  });

  it('still lets domain code emit MEETING_NOT_FOUND explicitly on a 404 (ownership rule)', () => {
    // US-03 / api-spec §0: an unowned resource answers 404 MEETING_NOT_FOUND, never 403.
    // The generic default above must not take this away from the domain layer.
    const { host, json, status } = createHost();
    filter.catch(
      new HttpException(
        { code: ApiErrorCode.MEETING_NOT_FOUND, message: 'Không tìm thấy cuộc họp' },
        HttpStatus.NOT_FOUND,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.MEETING_NOT_FOUND,
        message: 'Không tìm thấy cuộc họp',
        details: {},
      },
    });
  });
});
