import { AppException } from '../errors/app.exception';
import { buildValidationException } from '../validation';
import { ProblemDetailsFilter } from './problem-details.filter';
import type { ArgumentsHost } from '@nestjs/common';

function mockHost(): {
  host: ArgumentsHost;
  body: () => unknown;
  code: () => number;
} {
  let statusCode = 0;
  let json: unknown;
  const res = {
    status: (c: number) => {
      statusCode = c;
      return res;
    },
    setHeader: () => res,
    json: (b: unknown) => {
      json = b;
      return res;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {} }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, body: () => json, code: () => statusCode };
}

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  it('maps an AppException to problem+json via the catalog', () => {
    const m = mockHost();
    filter.catch(new AppException('EMAIL_ALREADY_EXISTS', 'taken'), m.host);
    expect(m.code()).toBe(409);
    expect(m.body()).toMatchObject({
      status: 409,
      title: 'Email already registered',
      detail: 'taken',
    });
  });

  it('maps an unknown error to 500', () => {
    const m = mockHost();
    filter.catch(new Error('boom'), m.host);
    expect(m.code()).toBe(500);
  });

  it('surfaces validation field errors', () => {
    const m = mockHost();
    filter.catch(
      buildValidationException([
        {
          property: 'email',
          constraints: { isEmail: 'email must be an email' },
          children: [],
        },
      ]),
      m.host,
    );
    expect(m.code()).toBe(400);
    expect((m.body() as { errors: unknown[] }).errors).toEqual([
      { field: 'email', message: 'email must be an email' },
    ]);
  });
});
