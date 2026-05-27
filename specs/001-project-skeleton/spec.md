# Feature Specification: Project Skeleton — End-to-End Hello

**Feature Branch**: `001-project-skeleton`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Establish the project skeleton end-to-end. Build a Go 1.26 backend using net/http stdlib routing (Go 1.22+ ServeMux pattern), and a SvelteKit SPA built with adapter-static. Embed the compiled SvelteKit build/ output via embed.FS so the Go binary serves the compiled frontend at / and reserves /api/* and /ws for backend handlers. PostgreSQL 17 runs in the same docker-compose stack with a healthcheck-gated dependency. A Caddy reverse proxy in the compose stack terminates TLS for a configurable FQDN (default ring.localtest.me, with Caddy's internal CA in dev; Let's Encrypt via ACME in prod). Provide the Makefile contract per the constitution (Sub-section D). CI runs golangci-lint, govulncheck, ESLint, Prettier check, tsc --noEmit, go test ./..., and pnpm test on every PR. Include one passing integration test that spins up the binary against a testcontainers-go-managed Postgres and asserts: (a) GET / returns the embedded SvelteKit shell; (b) GET /healthz returns 200 with a successful DB ping; (c) the Caddyfile-fronted FQDN serves the same content over TLS. No business logic in this spec — only the slice that proves the full stack runs end-to-end. The Constitution Check section of plan.md MUST verify all five principles (Test-First, Integration Testing, Observability, SemVer, Simplicity/YAGNI) plus the Platform Constraints additions."

## Clarifications

### Session 2026-05-27

- Q: `/healthz` exposure & response detail — public/auth posture and how much information the response discloses? → A: Public, unauthenticated, minimal body (status `ok`/`unhealthy` only, no diagnostic detail).
- Q: Post-boot behavior when the persistence engine becomes unreachable after a successful initial boot? → A: Stay running; `/healthz` returns 503; background reconnect with exponential backoff and structured warning logs; `/api/*` handlers fail fast with a generic "service degraded" error; the web shell at `/` continues to serve.
- Q: What does the placeholder web shell at `/` actually render? → A: A minimal page showing the application name `Ring`, the running build's version, the build commit SHA (injected at build time), and the stable marker string `skeleton OK`. No JS interaction, no API calls; the marker, version, and SHA must be present in the initial HTML payload.
- Q: How is `/ws` end-to-end reachability proven in the skeleton (without a real WebSocket handshake)? → A: Register a `/ws` handler that returns HTTP 426 Upgrade Required for non-upgrade requests; the integration test asserts `/ws` returns 426 both via the direct application port and through the reverse proxy at the configured FQDN under TLS.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer brings the full stack up locally with TLS in one command (Priority: P1)

A new contributor clones the repository onto a clean development machine, runs the documented one-time trust step, fills in a `.env` file from the template, and starts the stack. Within minutes they can open the configured FQDN in a browser over HTTPS and see the web client shell served by the same backend process that exposes the API and WebSocket namespaces.

**Why this priority**: This is the smallest end-to-end slice that proves the stack composes correctly. Every later feature presupposes that the persistence engine, the backend process, the embedded web client, and the TLS-terminating reverse proxy can all be brought up together. Without this slice nothing else can be developed or demonstrated.

**Independent Test**: A reviewer on a freshly imaged machine can follow only the `README` instructions, run the documented start command, and reach the application at the configured FQDN over HTTPS without manual edits to system files. The web shell loads and the health endpoint returns success.

**Acceptance Scenarios**:

1. **Given** a clean development machine with the prerequisites installed and the repository cloned, **When** the developer copies `.env.example` to `.env`, runs the one-time trust-store install step, and starts the stack, **Then** the configured FQDN serves the embedded web client shell over a browser-trusted HTTPS connection.
2. **Given** a running local stack, **When** the developer requests the health endpoint, **Then** the response is a success status and the response body confirms that the backend successfully connected to the persistence engine.
3. **Given** a running local stack, **When** the developer requests a path under the reserved backend namespaces (`/api/*` or `/ws`), **Then** the request reaches a backend handler rather than the embedded web client.

---

### User Story 2 - Every pull request is gated by automated quality checks (Priority: P2)

A contributor opens a pull request against the default branch. A single automated pipeline runs static analysis, vulnerability scanning, formatting checks, type checks, and the full test suites for both backend and web client. A pull request cannot be merged until every gate passes.

**Why this priority**: The constitution mandates Test-First Development and Integration Testing Discipline. Without an enforcement surface at pull-request time, those principles are unenforceable in practice. Quality gates must exist from the first commit, before any business logic lands, so regressions are caught at the smallest possible blast radius.

**Independent Test**: A contributor opens a deliberately broken pull request (failing test, lint violation, or vulnerable dependency) and confirms that the merge button is blocked by a red check. A clean pull request shows all checks green.

**Acceptance Scenarios**:

1. **Given** a pull request that introduces a test failure, **When** the pipeline runs, **Then** the pipeline reports failure and merging the pull request is blocked.
2. **Given** a pull request that introduces a lint violation, formatter drift, type error, or known vulnerable dependency, **When** the pipeline runs, **Then** the corresponding gate reports failure and merging is blocked.
3. **Given** a pull request whose backend and web-client code are both clean, **When** the pipeline runs, **Then** every gate reports success and the pull request becomes eligible for review and merge.

---

### User Story 3 - Operator deploys the stack to a fresh host (Priority: P3)

An operator copies the repository to a fresh production host, populates a `.env` file with the public FQDN and required secrets, and runs the documented production start command. The stack comes up behind a publicly trusted TLS certificate issued automatically for the configured FQDN, and the production image starts the application only after the persistence engine reports healthy.

**Why this priority**: A self-host deployment story is a constitutional invariant. Validating it on the skeleton ensures the path is real, not aspirational, before any feature accumulates production-specific assumptions.

**Independent Test**: On a fresh host with the public FQDN pointing at it and ports 80/443 reachable, the operator runs the documented production start command and a public HTTPS request to the FQDN returns the web shell with a publicly trusted certificate.

**Acceptance Scenarios**:

1. **Given** a fresh production host, a populated `.env`, and DNS pointing the public FQDN at the host, **When** the operator runs the documented production start command, **Then** the stack comes up and the public FQDN serves the web shell over a publicly trusted HTTPS connection.
2. **Given** a running production stack, **When** the persistence engine is restarted or temporarily unavailable, **Then** the application process is not started before the persistence engine reports healthy on initial boot, and the health endpoint reflects the persistence engine's current reachability after boot.

---

### Edge Cases

- **Trust-store step skipped in dev**: Browsers warn on the dev FQDN because the developer never installed the internal certificate authority root. The spec MUST document this as a one-time prerequisite and the symptom MUST be recognizable.
- **Persistence engine slow to become ready**: The application MUST NOT start serving traffic on initial boot until the persistence engine accepts connections. A slow database start MUST result in the application process waiting, not crashing in a loop.
- **FQDN misconfigured in prod**: If the public FQDN does not resolve to the host or the required ports are unreachable, automatic certificate issuance fails. The operator MUST see a clear failure surfaced in the proxy logs rather than a silent half-up state.
- **Reserved namespace collision**: A request to `/api/anything` or `/ws` MUST always reach the backend, never the embedded web client, even when no handler is registered for that exact path. An unrouted backend path returns a backend-shaped error response, not the web shell.
- **Build cache drift**: A stale embedded web client bundled in a previously built artifact MUST NOT silently be served alongside a newer backend. The single artifact MUST always serve the web client and backend that were built together.
- **Persistence engine becomes unreachable after initial boot**: A transient outage, restart, or network partition affecting the persistence engine after the application has already booted successfully MUST NOT cause the application process to crash or enter a restart loop. The application MUST stay up, mark itself unhealthy via `/healthz`, fail fast on `/api/*` and `/ws` with a generic degraded response, continue serving the web shell at `/`, and reconnect in the background with exponential backoff once the persistence engine returns.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single self-contained build artifact MUST serve the compiled web client at `/` and reserve `/api/*` and `/ws` as backend-only namespaces. The web client MUST be served from the same process and the same artifact as the backend.
- **FR-002**: The persistence engine MUST run as a sibling service to the application in the container stack, and the application MUST be gated on a healthcheck of the persistence engine so that on initial boot the application does not start until the persistence engine accepts connections.
- **FR-003**: A reverse proxy in the container stack MUST terminate TLS for a configurable FQDN. In development the proxy MUST issue certificates from an internal certificate authority. In production the proxy MUST obtain publicly trusted certificates automatically for the configured FQDN.
- **FR-004**: The repository MUST provide a top-level `Makefile` that exposes every target named in the constitution's Makefile contract (Sub-section D), including at minimum: `dev`, `up`, `down`, `build`, `image`, `test`, `lint`, `migrate`, `logs`, `clean`, `trust`. Each target MUST perform the action implied by its name.
- **FR-005**: A health endpoint MUST be exposed at `/healthz`, reachable unauthenticated over the public TLS endpoint, that returns a successful status only when the application has verified connectivity to the persistence engine, and a failure status otherwise. The response body MUST be a minimal status indicator (`{"status":"ok"}` or `{"status":"unhealthy"}`) and MUST NOT disclose connection strings, hostnames, software versions, uptime, stack traces, or any other diagnostic detail.
- **FR-006**: A continuous-integration pipeline MUST run on every pull request and MUST gate merging on the success of all of the following checks: backend static analysis (lint), backend vulnerability scanning, backend test suite, web-client lint, web-client formatter check, web-client type check, and web-client test suite.
- **FR-007**: At least one integration test MUST exist that boots the production build artifact against an ephemeral real instance of the persistence engine and asserts that (a) a request to `/` returns the embedded web client shell whose initial HTML payload contains the literal marker `skeleton OK` and the build commit SHA injected at build time, (b) a request to `/healthz` returns success and confirms persistence-engine connectivity, (c) a request through the reverse proxy at the configured FQDN over TLS returns the same content as the direct request to `/`, and (d) a non-upgrade request to `/ws` returns HTTP 426 Upgrade Required both via the direct application port and through the reverse proxy at the configured FQDN under TLS. The integration test MUST NOT mock the persistence engine.
- **FR-008**: The full local development stack MUST be startable on a clean machine with only a populated `.env` file, a one-time trust-store install step, and a single documented start command — no manual edits to system host files or system service configuration are permitted.
- **FR-009**: All shipped runtime artifacts MUST be a single container image containing the backend process and the compiled web client; no additional runtime service beyond the persistence engine and the reverse proxy may be required to run the stack.
- **FR-010**: The application MUST emit structured (machine-parseable, key-value) log records for server-side operations; free-text log strings are not acceptable. At minimum every server request handled MUST log a stable event name, a correlation identifier, and an outcome.
- **FR-011**: The repository MUST provide a `.env.example` template that documents every environment variable the stack consumes; `.env` itself MUST be excluded from version control.
- **FR-012**: After successful initial boot, if the persistence engine becomes unreachable, the application MUST continue running rather than crash. While the persistence engine is unreachable: `/healthz` MUST return an unhealthy status; the application MUST attempt to reconnect in the background with exponential backoff and MUST emit a structured warning log on each retry attempt; handlers under `/api/*` and `/ws` MUST fail fast with a generic "service degraded" response that does not disclose the underlying error; the web client shell at `/` MUST continue to serve unchanged.
- **FR-013**: The placeholder web client served at `/` MUST render: the application name `Ring`, the running build's version, the build commit SHA (injected at build time), and the stable marker string `skeleton OK`. The page MUST NOT perform any client-side API calls and MUST NOT rely on JavaScript execution for its content; the marker, version, and SHA MUST be present in the initial HTML payload of the response.
- **FR-014**: A handler MUST be registered at `/ws` that, for requests which are not a valid WebSocket upgrade attempt, returns HTTP 426 Upgrade Required with no response body content and no diagnostic detail. The handler MUST be reachable both directly on the application's listen port and through the TLS-terminating reverse proxy at the configured FQDN. A real WebSocket handshake on `/ws` is out of scope for this feature; only namespace reservation and proxy passthrough are proven here.

### Key Entities

This feature establishes infrastructure only and introduces no domain entities. The first domain entity will be introduced in a later feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new developer on a clean machine reaches the local FQDN over a browser-trusted HTTPS connection in under 10 minutes from `git clone`, including the one-time trust-store install step.
- **SC-002**: 100% of pull requests that introduce a quality regression in any of the gated dimensions (lint, vulnerability, type, format, test) are blocked from merge by the pipeline; no manual override is required to catch them.
- **SC-003**: The end-to-end integration test passes on 10 consecutive pipeline runs with zero re-runs required, demonstrating zero observable flake at introduction.
- **SC-004**: On a fresh production host with a populated `.env` and DNS in place, the documented production start command yields a successful response from the public health endpoint within 60 seconds of the start command returning.
- **SC-005**: The web client served at `/` and the backend serving `/api/*` always originate from the same build; at no observable moment can a deployed instance serve a frontend bundle built from a different commit than its backend.
- **SC-006**: A reviewer auditing the spec against the constitution can answer "yes" for every one of the five core principles (Test-First, Integration Testing, Observability, Semantic Versioning, Simplicity & YAGNI) and every Platform Constraint addition.

## Assumptions

- **Platform stack is constitution-locked, not chosen by this feature.** The choice of backend language, web-client framework, persistence engine, reverse proxy, and the single-image distribution model are invariants set by the constitution. This spec inherits and respects them; it does not re-decide them.
- **The default development FQDN resolves without manual `/etc/hosts` editing.** `ring.localtest.me` is assumed to resolve to `127.0.0.1` via the public `localtest.me` service. Developers who choose a custom dev FQDN are responsible for making it resolve.
- **The integration test uses a real persistence engine via ephemeral container.** Per the constitution's prohibition on mocking the persistence engine, the integration test launches the persistence engine in an ephemeral container managed by the test process itself.
- **Web Push (VAPID) configuration is out of scope for this feature.** The `.env.example` template carries placeholder fields for them; generation, use, and validation are deferred to a later feature.
- **No business logic, no authentication, no user-facing application features are in scope.** The deliverable is the smallest viable end-to-end slice that proves the full stack runs. The web client shell at `/` is a placeholder; the backend exposes only the namespaces and the health endpoint required to demonstrate composition.
- **CI provider details are an implementation choice.** The spec mandates that all named gates run on every pull request and block merge on failure; the specific provider, runner image, and pipeline syntax are decided in `plan.md`.
- **Production certificate issuance over ACME requires a publicly reachable FQDN.** Operators deploying behind networks where ports 80 and 443 are not reachable from the public internet will need a future feature to support alternative certificate sources.
- **User stories ship in priority order; later-priority stories presuppose earlier-priority code exists.** User Story 1 (P1) is fully independent. User Story 2 (P2, CI gates) is independently *valuable* but its independent-test criterion (a broken PR shows red checks) requires real code from US1 for the gates to exercise. User Story 3 (P3, production deploy) similarly presupposes the US1 binary exists and extends the US2 workflow. This is documented here so reviewers do not treat the explicit cross-story ordering in `tasks.md` (US2 after US1; US3 after US1+US2) as a deviation from independent-testability; it is a consequence of the skeleton-feature scope, not a story-decomposition flaw.
