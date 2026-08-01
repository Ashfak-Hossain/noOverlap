# Operating the deployment

Everything that runs in production is a container, and every container is either built from this
repository or managed by the host panel. There are four of the former: the API, the worker, a
migration job that runs to completion before either starts, and the compiled web client behind nginx.
PostgreSQL and Redis are the latter, and they are deliberately not in this repository's Compose file —
the reasoning is in [decisions/0023-deployment-shape.md](decisions/0023-deployment-shape.md).

This page is the operator's half of that: how to ship a change, how to undo one, and how to find out
what is wrong when something is.

## Deploying

A deploy is a push. Merging to the default branch triggers a build that publishes four images, each
tagged twice — `latest`, which the deployment follows, and the commit sha, which is what makes the
previous section possible. Once the build is green, triggering a deploy on the host pulls those images
and recreates the containers.

The Compose file sets every service to pull on every deploy. That is not a default worth relying on:
`latest` is a mutable tag, and a host that already holds a copy of it counts that as a cache hit and
keeps running the old build. The result is a deploy that reports success while changing nothing, which
is a considerably more expensive failure than the few seconds a pull costs.

Migrations apply as part of the deploy rather than by hand. The migration job runs first and both
services wait on it completing successfully, so nothing serves traffic against a schema it has not been
migrated to. If the migration fails, the job exits non-zero, the dependent services never start, and
the previous containers keep running — a failed migration is a deploy that does not happen rather than
a system that half-changed.

Confirm a deploy landed by asking the API rather than by reading the deploy log:

```bash
curl -s https://nooverlap.ashfak.dev/api/health
# {"status":"ok","db":"up","redis":"up"}
```

That probe reports on PostgreSQL and Redis, not on the process answering it. A process that is up but
cannot reach its database is not healthy, and this is the difference between the two.

## Rolling back

Every image carries an immutable tag naming the commit that produced it, which is the entire reason
rollback is cheap. Pin the failing services to the previous commit's sha and recreate them:

```bash
docker compose -f docker-compose.prod.yml pull
IMAGE_TAG=<previous-commit-sha> docker compose -f docker-compose.prod.yml up -d api worker
```

Reverting the commit and letting the pipeline rebuild reaches the same place and is the better habit
when there is time, because the repository then describes what is actually running. Pinning is the
faster path when something is broken now.

Rolling back application code is safe. Rolling back **across a migration** is not, and the two need
separating in your head before you need to do it. A migration that only adds things can be left in
place while the code that used it retreats. One that drops or rewrites a column cannot, and there is no
automatic reverse — recovery is a restore from the database backup the host panel takes, which means
accepting the data written since. Write migrations that add before they remove, and this stays
hypothetical.

## Reading logs

Each container logs to stdout, which is what makes them readable from the panel and from the command
line without any log configuration at all.

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
docker logs --tail 100 -f <container>
```

The status column is worth more than a first glance suggests. A container cycling through `Restarting`
is failing at boot, and the useful output is the last few lines before each restart rather than the
most recent lines overall, which will be the beginning of the next doomed attempt.

Two boot failures account for most of them. Anything reporting that a hostname cannot be resolved means
a connection string pointing at something that is not there, usually because a whole URL was pasted
where a hostname belonged. Anything reporting an authentication refusal means the credential is absent
rather than wrong — a client that has no password does not send one, and the server's answer looks
identical to a bad password.

## Watching the seam

The API exposes counts and depths in the Prometheus text format. It is not routed publicly, because it
describes the shape of internal traffic and nothing outside needs it, so read it from inside:

```bash
docker exec <api-container> node -e \
  "fetch('http://localhost:3000/metrics').then(r=>r.text()).then(console.log)"
```

Four numbers answer most operational questions. `outbox_unpublished_rows` is the seam's vital sign: it
counts events that have committed but not yet been published, and it is the one figure that goes wrong
silently. Response times do not degrade when the relay falls behind, so this can climb into the
thousands while every latency graph looks excellent. `queue_depth` separates "nothing is happening"
from "nothing is consuming", which are indistinguishable in logs and which once hid a stopped worker
for an afternoon. `booking_attempts_total` split by outcome makes contention visible. And
`booking_deadlock_retries_total` counts something otherwise unobservable, since a retry that succeeds
writes nothing anywhere.

A backlog that is climbing and not draining means the relay is not keeping up or the worker is not
consuming. Its ceiling is arithmetic — the relay claims 100 rows every two seconds, so it publishes 50
events per second and no more. Sustained arrivals above that accumulate by definition, and the backlog
drains once they subside. Nothing is lost; what is spent is time to confirmation.

A queue depth that is climbing while the backlog is flat means the opposite: events are being published
and nothing is taking them off. Check that the worker is running before looking anywhere else.

The dead-letter queue holds jobs that exhausted their retries. It should be empty, and anything in it
is a message that failed repeatedly rather than one that failed once, so it wants reading before it
wants replaying.

## Running a migration

Under normal circumstances you do not. Migrations run as part of a deploy, and reaching for the command
by hand usually means something has already gone sideways.

When it is genuinely needed, run the migration image rather than the service images. The distinction is
deliberate: applying a migration requires the schema tooling, which is a development dependency and is
therefore absent from the images that run continuously. The processes serving traffic carry nothing
capable of altering the schema, which is a property worth keeping.

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
```

## When the site serves the wrong thing

The proxy routes by path and by priority, and the client's rule is a catch-all. Anything the more
specific rules do not claim falls through to it, which produces a distinctive symptom: a request to an
API path returns the client's HTML with a 200 rather than an error.

That is worth recognizing, because it means the API's route is **absent**, not broken. A registered
route pointing at a dead container answers with a gateway error. Getting HTML back means the proxy
never had a rule for that path — almost always because the API container is not running, so its routing
labels are not there to be read. Check whether the container is alive before touching any proxy
configuration.
