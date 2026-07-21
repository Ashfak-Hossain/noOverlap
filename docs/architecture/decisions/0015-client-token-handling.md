# 0015. The access token lives in memory

Status: Accepted

## Context

The server side of the token model was already settled: a short-lived access token sent on every
request, and a long-lived refresh token that is stored, rotated on each use, and revoked as a whole
family if a rotated one is ever replayed. The refresh token reaches the browser as an httpOnly
cookie, which scripts cannot read.

That leaves the question the browser has to answer. The access token is sent with every request, so
the client must keep it somewhere. The usual options are browser storage or an ordinary variable.

## Decision

Keep the access token in memory only, in a module-scoped variable, and never persist it.

A page reload therefore discards it, so the application asks for a new one before its first render,
using the refresh cookie the browser still holds. Any request answered with a `401` triggers one
refresh and one retry; if that refresh fails, the session is genuinely over.

Every refresh shares a single in-flight request. Refresh tokens rotate and a replayed token is treated
as theft, so several requests refreshing at once would present an already-spent token and cause the
server to revoke the entire family — signing the user out for the crime of loading a page quickly.

## Consequences

A cross-site scripting flaw, in this code or in a dependency, cannot lift the credential out of
storage, because it was never put there. The refresh token is equally beyond reach in an httpOnly
cookie. This does not make such a flaw harmless — a script running on the page can still act as the
user while it runs — but it removes the durable, stealable artefact that would outlive the visit.

The cost is machinery: a refresh on startup, a retry path, and the shared in-flight request. All of it
sits in one place, so no screen in the application is aware that tokens exist.

## Alternatives considered

Browser storage survives a reload and removes the need for any of the above, which is genuinely
simpler. It also hands any injected script a working credential it can copy elsewhere and use for as
long as it stays valid, which undoes much of what rotation and reuse detection were built to achieve.

A cookie for the access token would be sent automatically, but one readable by script offers no
advantage over storage, and one that is not readable cannot be attached as an authorization header
without inviting cross-site request forgery into the design.

## Trade-off

A more elaborate client — a refresh on startup, a retry path, and deduplicated refreshes — is accepted
in exchange for never storing a credential anywhere a script can read it. The visible cost to a
visitor is one extra request when the page first loads.
