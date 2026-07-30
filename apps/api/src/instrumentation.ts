import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// The exporter defaults to http://localhost:4318/v1/traces and reads OTEL_EXPORTER_OTLP_ENDPOINT,
// so deployment points it at the jaeger service by env rather than a code change.
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    // This process is 'api'; the worker is 'worker'. The distinct names are what make one booking two
    // services in a single trace rather than an anonymous blur. Defaulted per app rather than required
    // on the command line, so a plain `pnpm dev` is labelled correctly; the env var stays an override
    // for a deployment that needs to say otherwise.
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'api',
  }),
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Three instrumentations are off because they describe the runtime rather than the system.
      // Every file read, socket open and name lookup becomes a span, and because these fire outside
      // any request they arrive as standalone traces — thirty of them in five minutes from an idle
      // worker alone. That volume does not merely add noise: it buries the booking saga that this
      // tracing exists to show, and makes finding one real trace a search rather than a glance.
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
});

sdk.start();
