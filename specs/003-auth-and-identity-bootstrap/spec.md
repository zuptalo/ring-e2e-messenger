# Feature Specification: Auth & Identity Bootstrap

**Feature Branch**: `003-auth-and-identity-bootstrap`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "User registration via email magic link, session/JWT issuance, and libsignal identity-key publishing. New Postgres tables: users, identity_keys, prekeys. New backend endpoints: POST /api/auth/request (issue magic link), GET /api/auth/callback (verify token, create session), POST /api/keys/publish (upload identity key + signed prekey + one-time prekeys), GET /api/keys/{user} (fetch peer's prekey bundle for X3DH). Frontend: registration flow, libsignal IdentityKeyStore wired to RxDB for at-rest encryption of session keys. Integration tests (testcontainers + Playwright): full register → publish → fetch flow; rejects forged tokens; rate-limits per-IP magic-link requests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passwordless sign-in via email link (Priority: P1)

A person opens the installed Ring app, enters their email address, and receives a one-time link by email. Following that link signs them in — creating an account on first use and re-using it thereafter — and lands them in the authenticated app with a session that persists across launches. No password is ever chosen or stored.

**Why this priority**: This is the entry gate to the entire product — without an identity and a session, no other feature (messaging, contacts, push) can exist. It is the minimum viable slice: a person can get a durable, authenticated identity.

**Independent Test**: Submit an email, retrieve the delivered link, follow it, and confirm the app shows an authenticated state that survives an app relaunch. Fully testable on its own with no other story implemented.

**Acceptance Scenarios**:

1. **Given** an unrecognised email, **When** the person requests a link and follows it, **Then** a new account is created and an authenticated session is established.
2. **Given** a previously-registered email, **When** the person requests a link and follows it, **Then** they are signed in to the existing account (no duplicate account).
3. **Given** an authenticated session, **When** the person closes and reopens the app, **Then** they remain signed in without re-requesting a link.
4. **Given** a link that has already been used once, **When** the person follows it again, **Then** sign-in is refused.
5. **Given** a link older than its validity window, **When** the person follows it, **Then** sign-in is refused with a clear "request a new link" message.

---

### User Story 2 - Publishing my encryption identity (Priority: P2)

Once signed in, the person's device publishes the public cryptographic material that lets others start an end-to-end-encrypted conversation with them: a long-term identity key, a signed prekey, and a batch of one-time prekeys. The person never sees or manages this directly — it happens automatically on first sign-in and is refreshed as needed.

**Why this priority**: An authenticated account that cannot be contacted securely is inert. Publishing identity material is what makes a user a reachable participant in the encrypted network; it is the prerequisite the next feature (1:1 messaging) consumes. It depends on P1 (must be signed in to publish).

**Independent Test**: As a signed-in user, trigger key publication and confirm the account is now associated with a complete, retrievable public key set, while no private material leaves the device.

**Acceptance Scenarios**:

1. **Given** a freshly registered user, **When** their device publishes identity material, **Then** the account is associated with one identity key, one signed prekey, and a batch of one-time prekeys.
2. **Given** a user who has already published, **When** their device republishes (e.g., to replenish one-time prekeys), **Then** the stored set is updated for that account and no other account is affected.
3. **Given** any published user, **When** their stored material is inspected, **Then** only public components are present — no private keys are ever transmitted or stored server-side.

---

### User Story 3 - Fetching a peer's key bundle to start a conversation (Priority: P3)

A signed-in person looks up another registered user and retrieves that peer's published key bundle — enough to establish an encrypted session with them — including one of the peer's one-time prekeys when any remain.

**Why this priority**: This closes the loop that makes published identities useful: it is the lookup the initiating side performs before the first encrypted message. It depends on P2 (there must be published material to fetch).

**Independent Test**: With two registered, published users, have user A fetch user B's bundle and confirm it contains the components needed to begin an encrypted session, and that a one-time prekey is handed out and not re-handed to the next fetch.

**Acceptance Scenarios**:

1. **Given** a peer who has published material with one-time prekeys remaining, **When** a signed-in user fetches that peer's bundle, **Then** the bundle includes the peer's identity key, signed prekey, and exactly one unused one-time prekey.
2. **Given** a peer whose one-time prekeys are exhausted, **When** a signed-in user fetches that peer's bundle, **Then** the bundle is still returned with the identity key and signed prekey and is explicitly marked as having no one-time prekey.
3. **Given** the same peer, **When** two different users each fetch a bundle, **Then** no single one-time prekey is handed to more than one fetcher.
4. **Given** an unauthenticated caller, **When** they attempt to fetch any bundle, **Then** the request is refused.

---

### Edge Cases

- **Account enumeration**: requesting a link for an unknown email behaves indistinguishably (same response, same timing characteristics) from requesting one for a known email, so an attacker cannot probe who has an account.
- **Abuse / flooding**: repeated link requests from one source beyond a threshold are throttled rather than continuing to send mail.
- **Tampered token**: a link whose token has been altered is refused exactly like an invalid one.
- **Email never arrives / delivery fails**: the person can request a fresh link; an expired or undelivered link never grants access.
- **One-time prekey depletion**: peers can still start conversations (degrade to identity + signed prekey only) until the owner's device replenishes the batch.
- **Concurrent bundle fetches**: simultaneous fetches for the same peer must not hand the same one-time prekey to two callers.
- **Publishing without a session / for another account**: refused — only the authenticated owner may publish or replace their own keys.
- **Existing functionality**: the prior skeleton routes and behavior (home shell, health check) remain unchanged; this feature is purely additive.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a person initiate sign-in by submitting only an email address (no password).
- **FR-002**: The system MUST deliver a single-use, time-limited sign-in link to the submitted email address.
- **FR-003**: On the first successful verification for an unrecognised email, the system MUST create a new account; for a recognised email it MUST sign in the existing account without creating a duplicate.
- **FR-004**: The system MUST refuse verification links that are expired, already used, or tampered with, and MUST surface a clear path to request a new one.
- **FR-005**: The system MUST rate-limit sign-in-link requests per originating source so that abuse and mass-mailing are prevented.
- **FR-006**: The system MUST NOT reveal whether a given email already has an account (no account enumeration via the request step).
- **FR-007**: On successful verification the system MUST establish an authenticated session that authorizes subsequent requests and that the client can persist across app launches.
- **FR-008**: The system MUST allow the signed-in client to validate/refresh its session and MUST reject requests bearing missing, expired, or invalid session credentials.
- **FR-009**: An authenticated user MUST be able to publish their public encryption identity: one long-term identity key, one signed prekey, and a batch of one-time prekeys.
- **FR-010**: The system MUST associate published key material with exactly the authenticated owner account and MUST allow only that owner to publish or replace it.
- **FR-011**: The system MUST never accept, transmit, or store private key material; only public key components are published and retrievable.
- **FR-012**: An authenticated user MUST be able to fetch another registered user's key bundle sufficient to initiate an encrypted session.
- **FR-013**: When fetching a bundle, the system MUST hand out at most one of the peer's one-time prekeys and MUST NOT hand the same one-time prekey to more than one fetcher.
- **FR-014**: When a peer's one-time prekeys are exhausted, the system MUST still return a usable bundle (identity key + signed prekey) and indicate that no one-time prekey was included.
- **FR-015**: The client MUST protect locally-stored session and identity secrets at rest on the device.
- **FR-016**: All key-publishing and key-fetching actions MUST require a valid authenticated session.
- **FR-017**: The feature MUST be additive — existing prior-feature routes, the app shell, and the health contract MUST continue to function unchanged.

### Key Entities *(include if feature involves data)*

- **Account (User)**: A person's durable identity in Ring, established by a verified email address; carries a stable internal identifier other features reference. One account per verified email.
- **Sign-in Link / Verification Token**: A single-use, time-limited credential bound to one email request; consumed on first successful use; never valid after expiry or reuse.
- **Session**: The authenticated state issued after verification that authorizes a person's subsequent actions and persists on their device until it expires or is revoked.
- **Identity Key**: A user's long-term public identity for end-to-end encryption; the anchor other users trust when starting a conversation.
- **Signed Prekey**: A medium-lived public prekey vouched for by the identity key, offered to peers initiating a session.
- **One-Time Prekey**: A single-use public prekey consumed by exactly one peer when starting a conversation; supplied in batches and replenished by the owner's device.
- **Key Bundle**: The published public set (identity key + signed prekey + optional one-time prekey) a peer retrieves to begin an encrypted session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new person can go from entering their email to an authenticated, persisted session in under 2 minutes (excluding email-delivery latency outside the system's control).
- **SC-002**: 100% of expired, already-used, or tampered sign-in links are refused — there is no input that grants a session without a valid, unused, unexpired link.
- **SC-003**: Sign-in-link requests from a single source beyond the configured threshold are throttled rather than sent, demonstrably resisting flooding and enumeration.
- **SC-004**: After a user publishes, any authenticated peer fetching that user's bundle always receives a complete bundle (identity key + signed prekey present 100% of the time; a one-time prekey included whenever the batch is non-empty).
- **SC-005**: No retrieval path ever returns private key material — verified by inspecting every published/fetched payload.
- **SC-006**: A single one-time prekey is never delivered to two different fetchers across concurrent and sequential requests.
- **SC-007**: A request for a sign-in link is indistinguishable (response shape and timing) between an existing and a non-existing email, preventing account enumeration.
- **SC-008**: Locally-stored session/identity secrets are unreadable at rest without the user's device-held protection.
- **SC-009**: All prior-feature contracts (app shell at the root, health check) continue to pass unchanged after this feature ships.

## Assumptions

- **Delivery channel**: Email is the sole sign-in channel for this feature; the system sends the link by email, and automated tests intercept the link rather than relying on a real inbox. Choice of email provider is an implementation detail deferred to planning.
- **Link validity & throttle thresholds**: Reasonable security defaults are assumed (a short link lifetime on the order of ~15 minutes; a small per-source request quota per hour); exact values are tuned in planning and need not change scope.
- **Single device per account (v1)**: Each account bootstraps one device's identity. Multi-device key management and key rotation/verification UX (safety numbers) are out of scope for this feature and handled later.
- **Encryption protocol**: Identity/prekey concepts follow the established X3DH-style model the project has already committed to (constitution-locked cryptography library); this feature establishes and publishes identity material but does not itself send encrypted messages — that is the next feature.
- **No password/recovery flows**: Passwordless email links are the only authentication method; password reset, social login, and account recovery are out of scope.
- **Reuse of existing stack**: Persistence, the single embedded image, the reverse-proxy/TLS path, and the on-device encrypted store introduced in earlier features are reused; this feature adds tables, endpoints, and client flows on top without changing prior contracts.
- **Server stores only public material**: The server holds account records and published *public* key components; all private keys remain on the user's device.
