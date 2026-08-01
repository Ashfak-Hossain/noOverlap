# 0021. Load measured at a fixed arrival rate

Status: Accepted

## Context

Published throughput and latency figures are only worth reading if the way they were produced is
sound. Two properties of this system shape how it has to be measured.

Every booking needs its own dates. A load test that books the same window repeatedly measures the
exclusion constraint rejecting duplicates, which is a real thing to measure and is not throughput.

More consequentially, there is a choice of workload model. A closed-loop generator keeps a fixed
number of connections busy and waits for each response before sending the next, so when the system
stalls the generator stops sending. The slowest period contributes the fewest samples, and the
percentiles come out flattering. This is coordinated omission, and it is the difference between a
latency figure that means something and one that quietly describes the tool.

## Decision

Use k6, driven by its constant-arrival-rate executor: requests are issued at a fixed rate whether or
not earlier ones have returned. The scenario books across a pool of listings and gives every request
its own dates, so no result is ever the overlap constraint doing its job.

Measurements are taken with tracing disabled and with the request rate limit raised, and both
conditions are recorded alongside the numbers.

## Consequences

Overload shows up honestly: latency rises and requests pile up. Under a closed-loop generator the same
overload appears as a lower request rate with unchanged latency, which reads as health.

The two conditions are not incidental. Instrumentation sits in the request path and changes what it
measures. The rate limiter is sized for production, so measuring capacity through it produces numbers
that describe the limiter declining traffic — and they look excellent, because refusing is faster than
serving. The scenario now stops the moment it is rate limited rather than reporting percentiles built
from rejections, which is a worse failure than an error because somebody might believe it.

k6 is a binary installed outside the package manager, unlike everything else here, so its version is
recorded with the results. An unpinned tool makes a number unreproducible.

This does not replace the concurrency harness, which answers a different question: many simultaneous
holds on one slot yield exactly one winner and no overlapping rows. That remains the proof of the
central guarantee. Conflating the two would lose both — a throughput run against a single slot
measures contention, and a correctness proof spread across many listings proves nothing.

## Alternatives considered

autocannon would keep the whole toolchain inside the package manager, which genuinely helps anyone
cloning the repository. It is closed-loop only, so its output carries the coordinated-omission caveat
permanently and the caveat would have to be published beside every number. Choosing a tool and then
explaining why its results are optimistic is worse than installing a binary.

## Trade-off

We accept a dependency outside the package manager, and the discipline of recording its version and
conditions with every result, in exchange for a load model that does not flatter the system under
stress. The figures this produces are lower than a closed-loop tool would report on the same hardware.
That is the point.
