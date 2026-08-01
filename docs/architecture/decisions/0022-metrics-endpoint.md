# 0022. A metrics endpoint, without a metrics stack

Status: Accepted

## Context

Three failures went unnoticed because nothing exposed them.

Under load the outbox backlog reached eight thousand events while the booking endpoint posted its best
latency of the run. The endpoint does not slow down when the relay falls behind, so nothing in the
response times suggested a problem; the backlog was found by querying the database by hand.

A worker died and the system looked healthy. Holds were created, events were published, the sweeps
ran. The only broken thing was that nobody was consuming the queue, which is invisible from every
angle except the queue itself.

And the retry that recovers a booking from a database deadlock cannot be observed at all. A retry that
succeeds writes nothing, so its absence from the logs means either that it worked or that the
condition never arose — and those call for very different responses.

Each is a question about the present moment: how deep is the backlog, is anything consuming, how often
is this happening. Logs answer that badly, because reconstructing a current value by reading history is
exactly the work worth removing.

## Decision

Expose a scrape endpoint in the standard Prometheus text format from the API, reporting the outbox
depth, the depth of each queue, booking outcomes by whether the guest got the slot, and how often a
hold was retried after a deadlock. Run no metrics server and no dashboards.

Values that live in Postgres and Redis are read when the endpoint is called rather than on a timer.

## Consequences

The numbers are available to anything that can make an HTTP request — a person with `curl`, a load
run, a deployment check — with no monitoring infrastructure to run, configure, or keep alive. The
first scrape surfaced a dead-lettered job nobody knew was there.

There is no history and there are no graphs, which is the more useful half of monitoring: the endpoint
answers "how deep is the backlog now", not "has it been climbing for three minutes". Because the format
is the one a scraper already expects, adopting one later is a configuration change rather than a code
change, and that is the part worth having now.

Reading on scrape means a scrape does real work, so this is not an endpoint to poll in a tight loop. At
any rate something would realistically use, that costs less than a timer running whether or not anyone
is listening.

The endpoint is exempt from rate limiting, for the same reason the health probe is: a limiter exists to
protect a service from its callers, and something polling on a schedule is not one. Being throttled
would silence it exactly when traffic is high enough to be worth watching. It carries no guest data —
counts and depths, not records — but it does describe the shape of internal traffic, so a public
deployment should keep it behind the proxy rather than open to the internet.

## Alternatives considered

Running a scraper and dashboards alongside the application is what production looks like, and history
turns a number into a signal. It costs more containers, scrape configuration, a provisioned dashboard,
and the upkeep of all three. On a single host that is a monitoring stack standing next to the thing it
monitors and sharing its failure modes — and one nobody will open.

Adding the same counts as fields on existing log lines needs no dependency and nothing new to run. It
cannot answer a current-value question without reading back through history, which is the specific
weakness that let the outbox backlog stay invisible in the first place.

## Trade-off

We accept no history and no graphs in exchange for no infrastructure to run and no configuration to
drift, and the questions that prompted this are about the present moment anyway. The format keeps the
missing half one configuration change away.
