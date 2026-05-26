<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR — additive amendment. New section
  "Branching, Commits, Pre-Commit Enforcement, and Dev Environment"
  introduced; the existing "Platform Constraints" section is expanded
  to cover backend language, HTTP stack, database, distribution, and
  self-host story. No principle removed or redefined.

Modified sections:
  - "Platform Constraints (Web & Mobile)" → "Platform Constraints
    (Web, Mobile, Backend, Distribution)" — five new bullets appended
    covering Go backend, net/http stack, PostgreSQL + testcontainers,
    single Docker image distribution, and `docker compose up -d`
    self-host story.
  - "Development Workflow & Quality Gates" — gate 3 ("Pre-merge gate")
    updated to cross-reference the commit-trailer and branch-name rules
    in the new section.

Added sections:
  - "Branching, Commits, Pre-Commit Enforcement, and Dev Environment"
    (placed between "Development Workflow & Quality Gates" and
    "Governance"), with sub-sections A–F covering branch policy,
    commit authorship trailers, pre-commit gates for both stacks,
    Makefile contract, local dev environment + FQDN, and ROADMAP.md
    as living artifact.

Removed sections: none.

Modified principles: none (all five core principles unchanged).

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check
       references remain generic; new section is enforced at the
       Plan and Pre-merge gates already specified.
  - ✅ .specify/templates/spec-template.md — no constitution-coupled
       sections; compatible.
  - ✅ .specify/templates/tasks-template.md — task categories already
       support tests, observability, and polish phases; compatible.
  - ✅ .specify/templates/checklist-template.md — feature-scoped
       template with no constitution coupling; compatible.
  - ⚠ CLAUDE.md — runtime guidance stub; will be expanded once
       Feature 001 plan is produced. Not blocking.

Follow-up TODOs: none.
-->

# Ring Constitution

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

Tests MUST be written, reviewed, and observed to fail before any implementation
code is written for the behavior under test. The Red-Green-Refactor cycle is
strictly enforced: a failing test (Red) precedes the minimum implementation that
makes it pass (Green), which precedes any refactor.

Pull requests that introduce production behavior without a corresponding,
previously-failing test MUST be rejected at review. Exceptions (e.g., spike
branches, throwaway prototypes) MUST be marked as such and never merged to a
release branch.

**Rationale**: Ring spans web and mobile clients with shared contracts; without
test-first discipline, regressions surface late and platform-specific, where
they are most expensive to diagnose and fix.

### II. Integration Testing Discipline

Integration tests MUST cover every contract boundary: HTTP/RPC endpoints, shared
schemas, persistence interfaces, and any cross-platform protocol between web and
mobile clients. A contract change without an updated integration test is a
breaking change and MUST be treated as such (see Principle IV).

New libraries or services MUST land with at least one integration test that
exercises a realistic call path, not only unit tests of internal helpers. Tests
that mock the system-under-test's own collaborators (e.g., mocking the database
in a repository test) are unit tests and do NOT satisfy this requirement.

**Rationale**: Most production incidents in client/server systems originate at
contract seams, not within individual modules. Integration coverage is the
cheapest insurance against the failure modes that matter.

### III. Observability & Structured Logging

Every server-side operation and every user-visible client action MUST emit
structured log records (key-value or JSON), not free-text strings. Log records
MUST carry: a stable event name, correlation/request identifier, actor or
session identifier where applicable, and outcome (success/failure + reason).

Errors MUST be logged at the point of origin with full context; re-raising and
re-logging at higher layers is prohibited unless it adds new context.
User-facing errors MUST be paired with an internal log record that links via
correlation ID.

**Rationale**: Web + mobile means errors arrive third-hand from heterogeneous
clients. Structured, correlatable logs are the only viable debugging surface;
text-only logs do not scale beyond a single developer's terminal.

### IV. Semantic Versioning & Breaking-Change Discipline

All shipped artifacts (APIs, mobile app releases, shared libraries, persistent
schemas) MUST follow MAJOR.MINOR.PATCH semantic versioning:

- **MAJOR**: any backward-incompatible change to a public contract, on-disk
  format, or wire protocol.
- **MINOR**: backward-compatible additions of capability.
- **PATCH**: bug fixes, performance, and refactors that preserve all observable
  behavior.

Every MAJOR change MUST ship with: (a) a migration plan, (b) a deprecation
window covering at least one MINOR release before removal where feasible, and
(c) updated integration tests proving both the old and new contract paths
during the deprecation window.

**Rationale**: Mobile clients in the field cannot be force-upgraded. Without
strict versioning and migration discipline, a single careless change can brick
installed apps or corrupt user data.

### V. Simplicity & YAGNI

Designs MUST start from the smallest viable solution that satisfies current
specified requirements. Speculative abstractions, configuration knobs without a
concrete current user, and frameworks introduced "in case we need them later"
are prohibited.

When a feature plan proposes additional complexity beyond a baseline (extra
projects, layers, indirection, or dependencies), the plan MUST justify it in
the plan's Complexity Tracking table with: the specific problem solved, the
simpler alternative considered, and why that alternative was insufficient.

**Rationale**: Complexity compounds in cross-platform codebases. Anything we
add today must be paid for in tests, observability, and migration cost on every
future MAJOR release.

## Platform Constraints (Web, Mobile, Backend, Distribution)

Because Ring targets web and mobile clients served by a single Go backend and
distributed as a self-hostable container image, the following constraints apply:

- **Shared contracts are source of truth**: the canonical schema/IDL for any
  cross-platform contract lives in a single shared location; per-platform
  duplicates MUST be generated, not hand-maintained.
- **Mobile compatibility window**: server changes MUST remain compatible with
  the two most recently released mobile app versions, or be gated behind a
  feature flag readable by the client.
- **No silent platform divergence**: if behavior intentionally differs between
  web and mobile, the divergence MUST be documented in the feature spec and
  covered by platform-specific tests.
- **Offline tolerance**: any client feature that depends on network
  connectivity MUST define its behavior on degraded or absent network, even if
  that behavior is "show an error" — undefined offline behavior is a defect.
- **Backend language**: All backend code MUST be written in Go using the
  latest stable supported release (currently Go 1.26). CI MUST test against
  the two most recent major releases per Go's support policy.
- **HTTP stack**: Backend MUST default to the `net/http` standard library
  (Go 1.22+ ServeMux pattern routing). Adopting a third-party HTTP framework
  requires a constitution amendment and a justified Complexity Tracking entry
  in the relevant plan.
- **Database**: PostgreSQL is the only supported persistence engine. The
  latest stable major version is the default (currently PostgreSQL 17).
  Integration tests MUST exercise real PostgreSQL via testcontainers;
  mocking the database is prohibited (this strengthens Principle II).
- **Distribution**: The product MUST ship as a single self-contained Docker
  image where the Go binary serves the compiled SvelteKit frontend via
  `embed.FS`. Adding additional runtime services requires a constitution
  amendment.
- **Self-host story**: `docker compose up -d` MUST be sufficient to run the
  full stack (app, postgres, reverse proxy) on a fresh host with only a
  `.env` file and a configured FQDN.

## Development Workflow & Quality Gates

Every feature follows the Spec Kit workflow: `/speckit-specify` →
`/speckit-clarify` (when needed) → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`. The following gates MUST pass at the indicated phase:

1. **Plan gate (Constitution Check in plan.md)**: Reviewer MUST verify the plan
   does not violate Principles I–V, or that any violation is justified in the
   Complexity Tracking table.
2. **Pre-implementation gate**: For each user story, the failing test(s) MUST
   exist and be observed failing before implementation tasks begin.
3. **Pre-merge gate**: All integration tests for affected contracts MUST pass;
   structured logs for new code paths MUST be present; version bump (if any)
   MUST match the change classification under Principle IV. Every commit on
   the branch MUST carry the authorship trailers defined in Branching, Commits,
   Pre-Commit Enforcement, and Dev Environment (Sub-section B), and the branch
   name MUST conform to the range regex defined in Sub-section A.
4. **Review gate**: At least one reviewer other than the author MUST approve.
   Reviews MUST explicitly confirm constitution compliance for changes
   touching contracts, persistence, or cross-platform behavior.

CI MUST enforce gates 2 and 3 where mechanically possible (test presence,
integration test execution, lint, trailer validation, branch-name validation).
Gates 1 and 4 are human review responsibilities.

## Branching, Commits, Pre-Commit Enforcement, and Dev Environment

### Sub-section A — Branch Policy

- The `main` branch is protected: no direct commits, no direct pushes;
  all changes land via pull request.
- Branch naming uses three numeric ranges, enforced by a pre-push hook with
  the regex `^(0\d{2}|1\d{2}|2\d{2})-[a-z0-9-]+$`:
  - **001–099** — planned features (driven by ROADMAP.md).
  - **101–199** — ad-hoc features (off-roadmap tactical work).
  - **201–299** — hot fixes (urgent production fixes; minimal scope).
- The suffix MUST be a clean kebab-case slug
  (e.g., `001-repo-skeleton-end-to-end-hello`).

### Sub-section B — Commit Authorship Trailers

Every commit message MUST end with two trailers on their own lines:

```
Authorship: <AI Generated | AI Assisted | Human>
AI-Tool: <Claude | Gemini | Cursor | Other>[, ...]
```

Rules:

- **AI Generated** — produced end-to-end by an AI agent; human only reviewed.
- **AI Assisted**  — human authored most of the change; AI helped with parts.
- **Human**        — no AI involvement; in this case `AI-Tool` MUST be `none`.
- When multiple tools were used, `AI-Tool` is comma-separated
  (e.g., `AI-Tool: Claude, Cursor`).
- A `commit-msg` hook MUST validate that both trailers are present and use
  only the allowed values.

### Sub-section C — Pre-Commit Gates (Both Stacks)

A pre-commit hook MUST run before every commit and orchestrate gates across
both stacks. At minimum:

- **Frontend**: `lint-staged` (Prettier + ESLint `--fix`), Vitest changed-only,
  `tsc --noEmit`.
- **Backend**: `gofumpt`, `golangci-lint --new-from-rev HEAD --fix` (including
  `gosec`), `go test -short ./...`, `govulncheck ./...`.

Any non-zero exit MUST block the commit. Using `--no-verify` to bypass the
hook is prohibited by team norm. CI MUST re-run the same gates on the pull
request to catch any local bypasses.

### Sub-section D — Makefile Contract

A top-level `Makefile` MUST exist and provide at minimum the targets:
`dev`, `up`, `down`, `build`, `image`, `test`, `lint`, `migrate`, `logs`,
`clean`, `trust`.

New tooling commands SHOULD be added as Makefile targets rather than as
ad-hoc scripts, so that the developer-facing surface remains discoverable
via `make help` and uniform across environments.

### Sub-section E — Local Dev Environment

- Local development MUST run behind a reverse proxy (Caddy by default) with
  a configurable FQDN. The default is `ring.localtest.me`; the value is
  overridable via the `RING_FQDN` environment variable.
- The proxy MUST terminate TLS in both dev and prod. `make trust` MUST be
  the documented one-time step that installs Caddy's internal-CA root into
  the developer's system trust store.
- `docker compose up -d` MUST be the canonical way to start the stack.

### Sub-section F — ROADMAP.md as Living Artifact

- A `ROADMAP.md` at the repository root MUST exist and list every planned
  spec (001–099). Each row carries stage columns:
  **Specify | Clarify | Plan | Tasks | Analyze | T→I | Implement**.
- Stage columns use the markers: ⬜ pending · 🟡 in-progress · ✅ done ·
  ⛔ blocked.
- Each spec row also has a "Spec Context Seed" block elsewhere in the file
  that captures the exact text to feed `/speckit-specify` for that spec.
- Updates are automatic: each `after_<phase>` hook in
  `.specify/extensions.yml` invokes a `speckit.roadmap.mark-done` command
  that flips the corresponding column to ✅.
- Ad-hoc (101–199) and hotfix (201–299) work MAY be added to ROADMAP.md
  retroactively but is not blocking.

## Governance

This constitution supersedes all other development practices and conventions
in this repository. Where another document conflicts with this constitution,
the constitution wins until amended.

**Amendment procedure**: Amendments are proposed via pull request that updates
this file and any dependent templates flagged in the Sync Impact Report. An
amendment MUST identify the version bump type (MAJOR/MINOR/PATCH) per the rules
below and update the version line accordingly. Approval requires the same
reviewer threshold as a normal pull request.

**Versioning policy** (for this document):

- **MAJOR**: a principle is removed, renamed in a backward-incompatible way,
  or redefined such that previously-compliant code becomes non-compliant.
- **MINOR**: a new principle or section is added, or an existing principle is
  materially expanded.
- **PATCH**: clarifications, wording fixes, typo corrections, and non-semantic
  refinements.

**Compliance review**: Constitution compliance is reviewed at each plan gate
(see Development Workflow & Quality Gates). A quarterly retrospective SHOULD
revisit whether the principles are still serving the project and propose
amendments where they are not.

**Runtime guidance**: Per-task and per-feature operational guidance lives in
`CLAUDE.md` and in the active feature's `plan.md`. Those documents MUST defer
to this constitution on any conflict.

**Version**: 1.1.0 | **Ratified**: 2026-05-26 | **Last Amended**: 2026-05-27
