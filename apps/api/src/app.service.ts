import { Injectable } from '@nestjs/common';
import type { ContractsPlaceholder } from '@no-overlap/contracts';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  /** Placeholder: proves @no-overlap/contracts resolves and is consumed. */
  contractsCheck(): ContractsPlaceholder {
    return { _placeholder: true };
  }
}
