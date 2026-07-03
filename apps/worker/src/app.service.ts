import { Injectable } from '@nestjs/common';
import type { ContractsPlaceholder } from '@no-overlap/contracts';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  contractsCheck(): ContractsPlaceholder {
    return { _placeholder: true };
  }
}
