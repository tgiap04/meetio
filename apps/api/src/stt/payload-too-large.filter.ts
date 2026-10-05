import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter.js';

/**
 * Multer's file-size limit surfaces as a bare 413, which the global filter would label
 * INTERNAL_ERROR. The app has no dedicated code for it, so it is a VALIDATION_ERROR with status 413.
 */
@Catch(PayloadTooLargeException)
export class PayloadTooLargeFilter implements ExceptionFilter {
  private readonly envelope = new ApiExceptionFilter();

  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    this.envelope.catch(
      new HttpException({ code: ApiErrorCode.VALIDATION_ERROR, message: 'Đoạn âm thanh quá lớn', details: {} }, HttpStatus.PAYLOAD_TOO_LARGE),
      host,
    );
  }
}
