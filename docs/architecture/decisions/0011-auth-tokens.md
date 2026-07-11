# 0011. RS256 access tokens, rotating refresh tokens, Argon2id

Status: Accepted

## Context

The system needs to authenticate every request cheaply, let sessions last without forcing constant
logins, revoke a session when a credential is stolen, and store passwords so that a database leak does
not hand over the passwords. These are related but distinct problems, and each has a known good answer.

## Decision

Hash passwords with Argon2id. Issue short-lived access tokens as JWTs signed with RS256, verified by a
public key. Issue long-lived refresh tokens that are stored server-side as hashes, kept in an `HttpOnly`
cookie, and rotated on every use, with reuse of an already-rotated token treated as theft and met by
revoking the whole token family. The reasoning is developed in
[../../concepts/authentication.md](../../concepts/authentication.md).

## Consequences

A request is authenticated by verifying a signature, with no database lookup, and a leaked access token
stops working within minutes. Because tokens are signed with an asymmetric key, a component can verify
them without the power to mint them, and pinning the algorithm to RS256 closes algorithm-confusion
attacks. Refresh tokens are revocable because they are stored, and rotation turns a stolen one into a
detectable event. Argon2id makes offline cracking of a leaked password database expensive.

## Alternatives considered

Symmetric HS256 signing would share one secret between signer and verifier, giving every verifier the
power to forge; asymmetric signing avoids that. Stateless refresh tokens would be simpler but could not
be revoked before expiry, which is the entire point of storing them. bcrypt is a reasonable password hash
but is not memory-hard and truncates long inputs, so Argon2id was preferred.

## Trade-off

Storing and rotating refresh tokens costs a database lookup and a write on each refresh, and managing an
asymmetric key pair is more involved than a single shared secret. Those costs buy revocable sessions,
detectable theft, and verification that does not require the signing key.
