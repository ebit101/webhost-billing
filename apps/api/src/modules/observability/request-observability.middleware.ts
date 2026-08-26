import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { runWithStructuredLogContext } from '@webhost-billing/shared';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'X-Request-ID';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestObservabilityMiddleware.name);

  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.header(REQUEST_ID_HEADER);
    const requestId =
      supplied && UUID_PATTERN.test(supplied) ? supplied : randomUUID();
    const startedAt = process.hrtime.bigint();

    response.setHeader(REQUEST_ID_HEADER, requestId);
    runWithStructuredLogContext({ requestId }, () => {
      response.once('finish', () => {
        const durationMs =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        this.logger.log(
          JSON.stringify({
            event: 'http_request_completed',
            method: request.method,
            path: request.path,
            statusCode: response.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
          }),
        );
      });
      next();
    });
  }
}
