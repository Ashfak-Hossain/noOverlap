import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

/**
 * Throughput and latency for the booking endpoint.
 *
 * Measures the system serving bookings, which is a different question from the one the concurrency
 * harness answers. That harness storms a single slot to prove exactly one guest wins; this spreads
 * across a pool of listings and gives every request its own date window, so nothing here is ever
 * rejected for overlapping and the numbers describe bookings being served rather than the exclusion
 * constraint doing its job.
 *
 * Run against a live stack:
 *   k6 run apps/api/test/load/booking.k6.js
 *
 * Two conditions must hold or the result is meaningless. The API's rate limit has to be raised
 * (THROTTLE_LIMIT), or this measures the throttler refusing traffic. And tracing has to be off, or it
 * measures an instrumented system rather than this one.
 */

const API = __ENV.API_URL || 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery-staple';
const LISTINGS = Number(__ENV.LISTINGS || 20);
const RATE = Number(__ENV.RATE || 30);
const DURATION = __ENV.DURATION || '60s';

const DAY = 86400000;
// Far enough ahead that nothing collides with seeded or hand-made data.
const BASE_DAY = 5000;

const slotTaken = new Counter('booking_slot_taken');

export const options = {
  scenarios: {
    booking: {
      // Open model: requests are issued at a fixed rate whether or not earlier ones have returned.
      // A closed model would stop sending while the system stalls, so the slowest period would
      // contribute the fewest samples and the percentiles would come out flattering.
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(50, RATE * 2),
      maxVUs: Math.max(200, RATE * 10),
    },
  },
  thresholds: {
    // Deliberately loose on a first run. Tighten once there is a measured baseline to hold the
    // system to — a threshold invented before any measurement only tests the guess.
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

function register(role) {
  const email = `load-${role}-${Date.now()}-${Math.floor(Math.random() * 1e9)}@example.com`;
  http.post(
    `${API}/auth/register`,
    JSON.stringify({ email, password: PASSWORD, role }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
  const login = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return login.json('accessToken');
}

/**
 * Builds the dataset once, before measurement starts. Its cost is not part of the result.
 *
 * A pool rather than one listing, because bookings against a single row measure lock contention on
 * that row. Both are worth knowing and they are not the same number.
 */
export function setup() {
  const hostToken = register('HOST');
  const listingIds = [];

  for (let i = 0; i < LISTINGS; i++) {
    const res = http.post(
      `${API}/listings`,
      JSON.stringify({
        title: `Load ${i}`,
        city: 'Porto',
        nightlyPriceCents: 8000 + i,
        maxGuests: 4,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hostToken}`,
        },
      },
    );
    if (res.status === 201) listingIds.push(res.json('id'));
  }

  if (listingIds.length === 0) {
    throw new Error(
      'no listings created — is the API up, and is the rate limit raised?',
    );
  }

  return { guestToken: register('GUEST'), listingIds };
}

export default function (data) {
  // A globally unique window per request. The virtual-user id and iteration number together identify
  // the request, so no two ever ask for the same dates and a 409 here would be a real defect rather
  // than the load generator colliding with itself.
  const slot = __VU * 5000 + __ITER;
  const checkIn = new Date(Date.now() + (BASE_DAY + slot * 3) * DAY);
  const checkOut = new Date(Date.now() + (BASE_DAY + slot * 3 + 2) * DAY);

  const res = http.post(
    `${API}/reservations`,
    JSON.stringify({
      listingId: data.listingIds[slot % data.listingIds.length],
      checkIn: checkIn.toISOString(),
      checkOut: checkOut.toISOString(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.guestToken}`,
      },
      tags: { name: 'POST /reservations' },
    },
  );

  // Stop the moment the rate limiter answers. Past this point every number the run produces
  // describes the throttler refusing traffic rather than the system serving it, and a plausible
  // summary printed after sixty wasted seconds is worse than an error: the latency looks excellent,
  // because rejections are fast.
  if (res.status === 429) {
    exec.test.abort(
      'rate limited — the API is enforcing its production limit. Restart it with a raised ' +
        'ceiling (THROTTLE_LIMIT) before measuring capacity.',
    );
  }

  // Counted rather than ignored: every request asks for its own window, so a conflict means the
  // assumption above is wrong and the throughput figure is measuring the wrong thing.
  if (res.status === 409) slotTaken.add(1);

  check(res, {
    'held (201)': (r) => r.status === 201,
    'not rate limited (429)': (r) => r.status !== 429,
  });
}
