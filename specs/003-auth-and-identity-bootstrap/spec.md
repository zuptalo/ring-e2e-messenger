# Feature Specification: Auth & Identity Bootstrap

**Feature Branch**: `003-auth-and-identity-bootstrap`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "User registration via email magic link, session/JWT issuance, and libsignal identity-key publishing. New Postgres tables: users, identity_keys, prekeys. New backend endpoints: POST /api/auth/request (issue magic link), GET /api/auth/callback (verify token, create session), POST /api/keys/publish (upload identity key + signed prekey + one-time prekeys), GET /api/keys/{user} (fetch peer's prekey bundle for X3DH). Frontend: registration flow, libsignal IdentityKeyStore wired to RxDB for at-rest encryption of session keys. Integration tests (testcontainers + Playwright): full register → publish → fetch flow; rejects forged tokens; rate-limits per-IP magic-link requests."

> **Design note**: During clarification (2026-05-30) the authentication model was
> deliberately changed from the original email-magic-link seed to an **anonymous,
> invite-only, zero-knowledge** model. Email/SMS are removed entirely; identity is a
> device-held keypair, registration is gated by invite codes, and the server stores
> only ciphertext and anonymous identifiers. The libsignal identity/prekey publishing
> from the seed is retained. See the **Clarifications** section for the decisions.

## Clarifications

### Session 2026-05-30

- Q: Should authentication use email magic links or an anonymous model? → A: Anonymous — identity is a device-generated keypair; no email, SMS, or other PII is collected.
- Q: What happens if a user loses their key? → A: No recovery — losing the key permanently forfeits the account and all encrypted data; onboarding must strongly guide key backup (password manager / recovery phrase).
- Q: Metadata / social-graph privacy target for v1? → A: Client-encrypted user-data blobs (server can't read the friends list, etc.) plus a delivery design that hides the sender (sealed-sender-compatible). Full traffic-analysis resistance (timing, cover traffic) is out of scope for v1.
- Q: How is registration gated? → A: Invite-only. When no users exist, the server prints a one-time bootstrap invite code to its console log; thereafter a newcomer can only join with a valid invite code from an existing user.
- Q: How are invites delivered, given an installed iOS PWA cannot be deep-linked from a Safari link? → A: As a plain alphanumeric **code** (shown as text/QR) that the newcomer pastes inside the installed PWA during onboarding; any accompanying link only points to the install page, never "opens the app."
- Q: May the server see the invite graph? → A: Yes (option A) — the server records the anonymous inviter→invitee relationship to enforce single-use and enable abuse mitigation (revoking an invite subtree). Blind/anonymous invites are deferred. The exposure is mild because identities are anonymous public keys, not real people.
- Q: Invite code lifetime and management? → A: Single-use, valid for **7 days**; a user may mint several codes and revoke any that are still unused; a user may attach a private **nickname** to a code that is stored only on the client and backed up as part of the user's encrypted data (never readable by the server).
- Q: How is a peer addressed when there is no directory? → A: Out-of-band exchange of an invite code; redeeming an invite establishes the inviter as the new user's first contact.
- Q: Session model? → A: Server-side, revocable sessions (the server can invalidate a session on logout / compromise).
- Q: Retention for inactive accounts? → A: Hard-delete an account and all its account-scoped data after a configurable period (default 365 days) with no authenticated activity; any authenticated action resets the timer. Purge is silent (no PII channel to warn) and disclosed at registration and sign-in. If a purge empties the server, the console bootstrap re-activates.
- Q: Should disappearing messages, presence/last-seen, receipts, profile-sharing prompts, and hidden chats be in 003? → A: No — those belong to feature 004 (messaging: per-message + on-the-fly per-conversation TTL, sent/delivered/seen receipts, system messages, Viber-style hidden chats) and a new presence-and-privacy feature. 003 only lays compatible foundations (see Non-Goals & Forward-Compatibility).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Join the network with an invite code (Priority: P1)

A newcomer installs the app, opens it as a standalone PWA, and is asked for an invite code. They paste a code given to them out-of-band by an existing member. The app generates an anonymous identity keypair on the device, registers it against the code, and drops them into the authenticated app — with no email, phone number, or any personal information requested. The very first member of a brand-new server uses a bootstrap code the server printed to its console log.

**Why this priority**: This is the gate to the entire product and the heart of the anonymity model. Without invite-gated, PII-free registration there is no network. It is the minimum viable slice: a person can obtain a durable anonymous identity and get in.

**Independent Test**: With a valid invite code (or the console bootstrap code on an empty server), complete onboarding inside the standalone PWA and confirm an authenticated session exists, with no PII collected. Fully testable alone.

**Acceptance Scenarios**:

1. **Given** an empty server, **When** it starts with no users, **Then** exactly one bootstrap invite code is emitted to the console log and can be redeemed once to create the first account.
2. **Given** a valid, unused, unexpired invite code, **When** a newcomer redeems it during onboarding, **Then** a new anonymous account is created for their device keypair and an authenticated session is established.
3. **Given** registration onboarding, **When** the account is created, **Then** no email, phone, or other personal identifier is requested or stored.
4. **Given** any invite code that is expired (older than 7 days), already redeemed, or revoked, **When** a newcomer attempts to redeem it, **Then** registration is refused with a clear message.
5. **Given** a successful redemption, **When** the new account is created, **Then** the inviting member becomes the new user's first contact.
6. **Given** an existing population of users, **When** the server restarts, **Then** no new bootstrap console code is emitted.

---

### User Story 2 - Come back / move to a new device with my key (Priority: P1)

A returning member opens the app and authenticates by proving possession of their stored key — typically auto-filled from their password manager, or by pasting their recovery secret on a new device. They regain their identity and can decrypt their data. There is no email reset: the key is the only way back, and the app makes that responsibility clear and helps them back it up at registration.

**Why this priority**: An anonymous identity is worthless if it isn't durable. Recovery-by-key is what makes the keypair a real account rather than a throwaway, and the "no reset" reality must be communicated up front so users don't lose everything.

**Independent Test**: Register, back up the key, then re-authenticate on a second client using only that key and confirm the same identity and encrypted data are restored; confirm there is no email/password reset path.

**Acceptance Scenarios**:

1. **Given** a registered user who saved their key, **When** they re-open the app on the same device, **Then** they are signed in by proving key possession, without re-registering.
2. **Given** a registered user, **When** they load their stored key/recovery secret on a new device, **Then** they recover the same anonymous identity and can decrypt their server-stored data.
3. **Given** onboarding, **When** the identity is created, **Then** the user is clearly warned that losing the key is unrecoverable and is guided to back it up (e.g., to a password manager).
4. **Given** a user who lost their key, **When** they seek recovery, **Then** the system offers no reset path (by design) and the prior account/data remain inaccessible.

---

### User Story 3 - Publish my encryption identity (Priority: P2)

After joining, the user's device publishes the public cryptographic material that lets others start an end-to-end-encrypted conversation with them — a long-term identity key, a signed prekey, and a batch of one-time prekeys — automatically and without exposing any private key.

**Why this priority**: A registered identity that can't be contacted securely is inert; publishing prekey material makes the user a reachable participant and is the prerequisite the messaging feature consumes. Depends on P1.

**Independent Test**: As a registered user, trigger publication and confirm the account is associated with a complete, retrievable public key set while no private material leaves the device.

**Acceptance Scenarios**:

1. **Given** a freshly registered user, **When** their device publishes identity material, **Then** the account is associated with one identity key, one signed prekey, and a batch of one-time prekeys.
2. **Given** a user who already published, **When** their device republishes to replenish one-time prekeys, **Then** their stored set is updated and no other account is affected.
3. **Given** any published user, **When** their stored material is inspected, **Then** only public components are present — no private keys are ever transmitted or stored server-side.

---

### User Story 4 - Mint and manage invite codes (Priority: P2)

A member generates invite codes to bring people in. Each code is single-use and valid for 7 days. They can see their outstanding codes, give each a private nickname (to remember who it's for) that only they can read, and revoke any code that hasn't been used yet.

**Why this priority**: The network only grows through members minting invites, and the abuse model depends on codes being controllable (revocable, time-bounded, single-use). The private nickname is a usability aid that must respect the zero-knowledge guarantee. Depends on P1.

**Independent Test**: As a member, mint a code, attach a nickname, confirm the nickname is unreadable to the server, revoke the code while unused, and confirm it can no longer be redeemed.

**Acceptance Scenarios**:

1. **Given** an authenticated member, **When** they mint an invite code, **Then** a single-use code valid for 7 days is created and shown as text and a scannable form.
2. **Given** a member with outstanding codes, **When** they revoke a code that has not been redeemed, **Then** that code can no longer be redeemed.
3. **Given** a code that has already been redeemed, **When** the member attempts to revoke it, **Then** the existing account created from it is unaffected (revocation only prevents future redemption).
4. **Given** a member attaches a nickname to a code, **When** the nickname is stored, **Then** it is held only as part of the member's client-encrypted data and is never readable by the server.
5. **Given** a code older than 7 days, **When** anyone attempts to redeem it, **Then** it is rejected as expired.

---

### User Story 5 - Fetch a peer's key bundle to start a conversation (Priority: P3)

A member retrieves another member's published key bundle — enough to establish an encrypted session — including one of the peer's one-time prekeys when any remain.

**Why this priority**: This closes the loop that makes published identities useful — the lookup the initiating side performs before the first encrypted message. Depends on P3 (there must be published material).

**Independent Test**: With two registered, published members, have one fetch the other's bundle and confirm it contains the components to begin an encrypted session, and that a one-time prekey is handed out only once.

**Acceptance Scenarios**:

1. **Given** a peer who published with one-time prekeys remaining, **When** a member fetches that peer's bundle, **Then** it includes the peer's identity key, signed prekey, and exactly one unused one-time prekey.
2. **Given** a peer whose one-time prekeys are exhausted, **When** a member fetches that peer's bundle, **Then** a usable bundle (identity key + signed prekey) is still returned, marked as having no one-time prekey.
3. **Given** the same peer, **When** two different members each fetch a bundle, **Then** no single one-time prekey is handed to more than one of them.
4. **Given** an unauthenticated caller, **When** they attempt to fetch any bundle, **Then** the request is refused.

---

### Edge Cases

- **Invalid invite**: expired (>7 days), already redeemed, or revoked codes are all rejected at redemption.
- **Concurrent redemption** of the same single-use code: only one redemption succeeds; the other is rejected.
- **Bootstrap idempotence**: the console bootstrap code is emitted only while zero users exist; if it expires unused on an empty server, a fresh one is emitted on next start; once any user exists, none is emitted.
- **Lost key**: no recovery path exists; the account and all its encrypted data are permanently inaccessible (communicated up front).
- **Same key on multiple devices**: loading the key on a new device is treated as recovery/move of a single logical identity; concurrent multi-device sessions and per-device key management are out of scope for v1.
- **One-time prekey depletion**: peers can still start conversations with identity + signed prekey until the owner's device replenishes the batch.
- **Concurrent bundle fetches**: simultaneous fetches for one peer must not hand the same one-time prekey to two callers.
- **Publishing/minting without a session, or acting on another account**: refused — only the authenticated owner may publish keys, mint/revoke their codes, or read/write their data.
- **Abuse**: an invite (sub)tree can be revoked to cut off a bad actor's downstream invitees.
- **Existing functionality**: prior features' routes, the app shell, the health check, and the install-first PWA onboarding continue to work unchanged; invite-code entry happens inside the standalone app (no deep link).
- **Inactivity purge is silent**: there is no channel to warn an inactive user before deletion, so the purge is silent; the policy is instead disclosed at registration and sign-in.
- **Purge cascade & orphans**: deleting an account removes its keys, sessions, invites, invite-graph edges, and encrypted blobs; peers/invitees that referenced it simply find the user "no longer exists" (their own encrypted data is untouched and unreadable by the server).
- **Re-bootstrap after purge**: if a purge removes the last remaining account, the server returns to the empty state and re-emits a console bootstrap code.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Identity MUST be a device-generated keypair; the system MUST NOT request or store email, phone number, or other personally identifying information.
- **FR-002**: The system MUST authenticate a client by verifying possession of its private key (e.g., signing a server-issued challenge); there MUST be no passwords.
- **FR-003**: A user MUST be able to re-authenticate on the same or a new device by supplying their stored key / recovery secret, recovering the same identity and access to their encrypted data.
- **FR-004**: The system MUST clearly warn during onboarding that losing the key is unrecoverable (account + all encrypted data are permanently lost) and MUST guide the user to back the key up (e.g., to a password manager / recovery phrase). No email/password reset path may exist.
- **FR-005**: On successful authentication the system MUST establish a server-side, revocable session that authorizes subsequent requests and can be invalidated server-side (logout / compromise).
- **FR-006**: Account creation MUST require a valid, unused, unexpired invite code; without one, no account can be created.
- **FR-007**: When no users exist, the system MUST emit exactly one bootstrap invite code to the server console log so the first user can join, and MUST stop emitting bootstrap codes once any user exists.
- **FR-008**: An authenticated user MUST be able to mint invite codes; each MUST be single-use and valid for 7 days, and presentable as both text and a scannable form.
- **FR-009**: An authenticated user MUST be able to list and revoke their own still-unused, still-valid codes; revoked, expired, or already-redeemed codes MUST NOT be redeemable.
- **FR-010**: Redeeming an invite code MUST establish the inviting user as the new user's first contact.
- **FR-011**: The system MUST record the inviter→invitee relationship between anonymous identities sufficiently to enforce single-use and to support abuse mitigation by revoking an invite subtree.
- **FR-012**: A user MUST be able to attach a private nickname to an invite code; the nickname MUST be stored only client-side and backed up as part of the user's encrypted data, and MUST never be readable by the server.
- **FR-013**: An authenticated user MUST be able to publish their public encryption identity (identity key + signed prekey + a batch of one-time prekeys), tied to their account.
- **FR-014**: Only the owner MUST be able to publish or replace their own key material; the system MUST never accept, transmit, or store private key material.
- **FR-015**: An authenticated user MUST be able to fetch another user's key bundle (identity key + signed prekey + one one-time prekey when available); at most one one-time prekey is handed out and the same one is never handed to more than one fetcher.
- **FR-016**: When a peer's one-time prekeys are exhausted, the system MUST still return a usable bundle (identity key + signed prekey) marked as having no one-time prekey.
- **FR-017**: User-owned state (first contact, invite-code nicknames, and other client data) MUST be stored on the server only as client-encrypted blobs that the server cannot read.
- **FR-018**: The server MUST persist only ciphertext and anonymous public identifiers — never real-world identity — and the architecture MUST NOT require the server to know a message's sender (forward-compatible with sealed-sender delivery in the messaging feature).
- **FR-019**: All authenticated actions (minting/revoking invites, publishing keys, fetching bundles, reading/writing user data) MUST require a valid session.
- **FR-020**: The feature MUST be additive: prior features' routes, the app shell, the health contract, and the install-first PWA onboarding MUST continue to function unchanged, and invite-code entry MUST occur inside the standalone PWA (not via a deep link).
- **FR-021**: The system MUST treat an account as inactive after a configurable retention period (default 365 days) with no authenticated activity, and MUST then permanently (hard) delete the account and all account-scoped server-side data — identity record, published key material, sessions, invite codes it minted, its invite-graph edges, and its encrypted user-data blobs. Later features MUST purge their own account-scoped data (e.g. messages, media, mailbox) under the same trigger. Any authenticated action MUST reset the inactivity timer.
- **FR-022**: The system MUST disclose the inactivity-deletion policy to the user at registration and on sign-in (the only available channels, since there is no email/PII to send a warning to); deletion otherwise occurs silently.

### Key Entities *(include if feature involves data)*

- **Identity (Account)**: An anonymous member, represented by a public key; carries a stable internal identifier other features reference. No PII. One identity per keypair.
- **Keypair / Recovery Secret**: The private key (or a seed phrase deriving it) held by the user and backed up externally; the sole means of authentication and recovery.
- **Session**: Server-side, revocable authenticated state issued after key-possession is proven; persists on the device until it expires or is revoked.
- **Invite Code**: A single-use credential valid for 7 days, minted by a member; revocable while unused; on redemption it creates the inviter→invitee link and bootstraps first contact. Carries an optional **client-only nickname** stored as encrypted user data.
- **Identity Key / Signed Prekey / One-Time Prekey / Key Bundle**: The published public material a peer retrieves to begin an encrypted session (one-time prekeys are single-use and replenished by the owner).
- **Encrypted User-Data Blob**: A general-purpose, client-encrypted store of the member's own state that the server holds but cannot read — currently first contact and invite-code nicknames, and the deliberate extension point for future client settings (per-conversation message TTLs, presence-visibility grants, hidden-conversation flags + PIN, profile, contact list) so they need no server schema change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A newcomer with a valid invite code can register and reach an authenticated session in under 2 minutes, providing zero email/phone/PII.
- **SC-002**: 100% of account-creation attempts lacking a valid, unused, unexpired invite code are rejected.
- **SC-003**: On an empty server the first user can join only via the console-logged bootstrap code, and once any user exists no further bootstrap code is emitted (verified across restarts).
- **SC-004**: Invite codes are non-redeemable in 100% of cases once they are older than 7 days, already redeemed, or revoked.
- **SC-005**: A user can re-authenticate and recover their identity + encrypted data on a new device using only their stored key, with no server-side reset path available.
- **SC-006**: The server stores no PII and no plaintext user data — every user-data field, including invite nicknames, is opaque ciphertext to the server (verified by inspecting stored records).
- **SC-007**: After publishing, any authenticated peer fetching a user's bundle receives identity key + signed prekey 100% of the time, plus exactly one unique one-time prekey while the batch is non-empty, with no one-time prekey ever reused across fetchers (including under concurrency).
- **SC-008**: Locally-stored keys and secrets are unreadable at rest without the user's device-held protection.
- **SC-009**: All prior-feature contracts (app shell at the root, health check, PWA install/onboarding) continue to pass unchanged after this feature ships.
- **SC-010**: After the configurable retention period (default 365 days) with no authenticated activity, 100% of the account's server-side data is permanently removed and its key bundle is no longer fetchable; any authenticated action within the period resets the timer. The retention period is operator-configurable.

## Assumptions

- **Anonymous identity, no recovery**: Identity is a device keypair; the user's stored key/recovery secret is the only way back. Lost key = permanently lost account and data — accepted by design, mitigated only by strong backup UX.
- **Invite mechanics**: Codes are single-use, valid 7 days; a member can mint several and revoke unused ones; each code may carry a private, client-only nickname backed up as encrypted user data. The first user joins via a one-time bootstrap code printed to the server console.
- **Invite delivery**: Invites travel as codes (text/QR) entered inside the installed PWA; any link only points to the install page. This deliberately avoids relying on opening links into an installed iOS home-screen PWA (not supported without a native app).
- **Metadata posture (v1)**: The friends list and other user data are stored as client-encrypted blobs (server cannot read them), and the design keeps message delivery sender-anonymous (sealed-sender-compatible). Resistance to traffic-analysis (timing, volume, cover traffic) is out of scope for v1. The server may see the anonymous invite graph (inviter→invitee by public key) for single-use enforcement and abuse mitigation.
- **Single logical device per identity (v1)**: The key can be moved/recovered to a new device, but concurrent multi-device sessions, per-device keys, and device-linking UX are out of scope for this feature.
- **Scope boundary**: This feature establishes identity, anonymous authentication, invite-only registration, encryption-key publishing/fetch, and zero-knowledge user-data storage. Sending encrypted messages, sealed-sender delivery, and media are the messaging feature (004+); this feature only makes that possible.
- **Stack reuse**: The constitution-locked cryptography (X3DH-style identity/prekeys), the single embedded image, the reverse-proxy/TLS path, and the on-device encrypted store from earlier features are reused; this feature adds storage, endpoints, and client flows without changing prior contracts.
- **Server stores only public/ciphertext**: The server holds anonymous account records, published *public* key components, the invite graph, and opaque encrypted blobs; all private keys and all plaintext user data remain on the user's device.
- **Retention**: accounts inactive for a configurable period (default 365 days) are hard-deleted along with all account-scoped data; the timer resets on any authenticated activity; the purge is silent (disclosed at registration/sign-in). Related housekeeping (expired unused invite codes, dead sessions) is swept promptly on its own cadence.
- **Divergence from ROADMAP seed**: The original 003 seed (email magic link + session/JWT) is superseded by this anonymous, invite-only, zero-knowledge model per the 2026-05-30 clarification; the libsignal identity/prekey portion of the seed is retained.

## Non-Goals & Forward-Compatibility

This feature deliberately excludes messaging, presence, and related UX — those are later features (004 messaging; the new presence-and-privacy feature). 003 only ensures its foundations do not block them:

- **General-purpose encrypted store**: the user-data blob is generic so future client settings (per-conversation message TTLs, presence-visibility grants, hidden-conversation flags + PIN, profile, contact list) require no server schema change.
- **Server-held expiry metadata**: stored ciphertext is designed to carry a server-visible expiry timestamp so disappearing messages (per-message and on-the-fly per-conversation TTL for new messages of any type — feature 004) can be purged server-side even if never delivered; the server sees *when* to delete, never *what*.
- **Server is never a presence oracle**: the retention "last active" timestamp is server-internal and never user-visible. User-facing online status / last seen is a separate, end-to-end-controlled signal shared only with granted contacts (global on/off + per-conversation overrides), delivered later so the server never learns activity patterns or the social graph.
- **Extensible, sender-anonymous message envelope**: receipts (sent/delivered/seen), system messages (e.g., a profile-share prompt), and presence pings are typed payloads over the sealed-sender channel; 003 keeps the envelope extensible.
- **Hidden conversations are client-side**: a Viber-style hidden chat is a client flag + PIN held in the encrypted store; the server never knows a conversation is hidden.

**Out of scope for 003**: sending/receiving messages, media, message-TTL enforcement, receipts, presence/last-seen, profile-sharing prompts, hidden-chat UX, multi-device, and blind invites.
