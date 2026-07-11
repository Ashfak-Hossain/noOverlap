import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppException } from 'src/common/errors/app.exception';

/**
 * Rate-limit guard that fails with the project's RFC 7807 envelope instead of the library's default
 * `ThrottlerException`. Overriding the throw keeps 429s shaped like every other error and
 * avoids leaking the internal class name as the problem title.
 *
 * @remarks Storage is the library default (in-process). A multi-instance deploy needs a shared store
 * (Redis, which we already run) so limits hold across replicas, plus a trusted-proxy config so the
 * real client IP is used — both deferred to production hardening.
 */
@Injectable()
export class ThrottlerProblemGuard extends ThrottlerGuard {
  protected throwThrottlingException(): Promise<void> {
    throw new AppException('RATE_LIMITED');
  }
}
