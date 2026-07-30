/**
 * End-to-end trace check for the async seam.
 *
 * Books a reservation through the running API, waits for the worker to confirm it, then asks Jaeger
 * whether that booking produced a single trace spanning both processes. It exercises the real path —
 * HTTP, the outbox, the relay, the queue, the worker — rather than asserting anything in isolation,
 * because a trace that crosses the seam is exactly the thing no unit test can see.
 *
 * Run against a live stack (api + worker + infra + jaeger):  node apps/api/test/trace-smoke.mjs
 */

const API = process.env.API_URL ?? 'http://localhost:3000';
const JAEGER = process.env.JAEGER_URL ?? 'http://localhost:16686';
const PASSWORD = 'correct-horse-battery-staple';

const DAY = 86_400_000;
// A distinct future window per run, so repeated runs never collide on the exclusion constraint and
// mistake a real "slot taken" for a failure. Far enough out to clear the seeded data.
const base = 600 + (Math.floor(Date.now() / 1000) % 400) * 3;

const j = (res) => res.json();
const authed = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

async function register(role) {
  const email = `trace-${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, role }),
  });
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  }).then(j);
  return login.accessToken;
}

async function main() {
  console.log('1. creating a host and a listing…');
  const hostToken = await register('HOST');
  const listing = await fetch(`${API}/listings`, {
    method: 'POST',
    headers: authed(hostToken),
    body: JSON.stringify({
      title: 'Trace probe',
      city: 'Porto',
      nightlyPriceCents: 8200,
      maxGuests: 2,
    }),
  }).then(j);

  console.log('2. booking as a guest…');
  const guestToken = await register('GUEST');
  const held = await fetch(`${API}/reservations`, {
    method: 'POST',
    headers: authed(guestToken),
    body: JSON.stringify({
      listingId: listing.id,
      checkIn: new Date(Date.now() + base * DAY).toISOString(),
      checkOut: new Date(Date.now() + (base + 2) * DAY).toISOString(),
    }),
  });
  if (held.status !== 201) {
    console.error(`   booking failed: ${held.status}`, await held.text());
    process.exit(1);
  }
  const reservation = await held.json();
  console.log(`   held ${reservation.id}`);

  console.log('3. waiting for the worker to confirm (relay polls every 2s)…');
  const deadline = Date.now() + 25_000;
  let status = reservation.status;
  while (status !== 'CONFIRMED' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const current = await fetch(`${API}/reservations/${reservation.id}`, {
      headers: authed(guestToken),
    }).then(j);
    status = current.status;
  }
  if (status !== 'CONFIRMED') {
    console.error(
      `   never confirmed (last status: ${status}) — is the worker running?`,
    );
    process.exit(1);
  }
  console.log('   confirmed.');

  // Spans are batched and exported on a schedule, so the trace is not queryable the instant the
  // booking settles. Give the exporters a moment to flush before asking Jaeger.
  console.log('4. letting spans export…');
  await new Promise((r) => setTimeout(r, 6000));

  console.log('5. asking Jaeger for the trace…');
  const url = `${JAEGER}/api/traces?service=worker&lookback=15m&limit=30`;
  const traces = (await fetch(url).then(j)).data ?? [];
  const booking = traces.find((t) =>
    t.spans.some((s) => s.operationName === 'charge'),
  );
  if (!booking) {
    console.error(
      '   no trace with a charge span — did tracing export? are net/dns disabled?',
    );
    process.exit(1);
  }

  const services = [
    ...new Set(Object.values(booking.processes).map((p) => p.serviceName)),
  ].sort();
  const ops = booking.spans.map((s) => s.operationName);
  console.log(`\n   trace id: ${booking.traceID}`);
  console.log(`   services: ${services.join(', ')}`);
  console.log(`   spans:    ${ops.join(' | ')}`);

  const spansBoth = services.includes('api') && services.includes('worker');
  console.log(
    spansBoth
      ? '\nPASS: one booking, one trace, across both processes.'
      : '\nFAIL: the charge started its own trace — traceparent did not survive the queue.',
  );
  process.exit(spansBoth ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
