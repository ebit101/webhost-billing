# Human-Directed Codex Work Path

## Purpose

Webhost Billing is an AI-assisted, open-source technical preview. OpenAI Codex is used
as an engineering assistant, while a human maintainer owns the product direction,
authorizes work, reviews evidence, controls releases, and remains accountable for the
result. Every accepted change is human-reviewed before it becomes project work.

This is a development-method statement, not a product-feature claim. The application
does not currently include an AI runtime or AI-powered billing behavior. Webhost
Billing is an independent open-source project and is not affiliated with or endorsed
by OpenAI.

## Work path

Each bounded development command follows the same reviewable path:

1. **Plan:** the maintainer defines the product scope, architecture, business rules,
   security boundaries, and production gates.
2. **Authorize:** the maintainer explicitly authorizes one command from
   `CODEX_DEVELOPMENT_COMMANDS.md`.
3. **Inspect:** Codex reads the project instructions, plan, durable decisions, and
   latest progress report before changing the repository.
4. **Implement:** Codex changes only the authorized scope and preserves unrelated
   work. Development uses fictional data and fake providers unless a separate command
   authorizes a controlled external boundary.
5. **Validate:** formatting, static analysis, tests, database checks, security scans,
   builds, and operational checks are run in proportion to the risk. A check is never
   reported as passed unless it completed successfully.
6. **Review:** the human maintainer reviews every accepted change and its evidence.
   Generated output is not accepted merely because it was produced by Codex or passed
   an automated check.
7. **Record:** durable choices go into `docs/DECISIONS.md`; implemented scope, changed
   files, evidence, risks, and the exact recommended next command go into
   `docs/PROGRESS.md`.
8. **Deliver:** passing, human-reviewed work receives a focused commit, is reconciled
   without history rewriting, and is pushed through the repository's security
   controls.
9. **Stop:** Codex stops after the command. The maintainer decides whether to authorize
   the next command.

## Human authority boundary

Codex assistance does not grant autonomous authority over:

- product scope, business policy, or production-readiness decisions;
- external infrastructure, DNS, provider accounts, credentials, or costs;
- live customer data, payment processing, email delivery, or hosting provisioning;
- destructive operations, permanent service termination, or irreversible releases;
- legal, tax, privacy, or regulatory acceptance.

Those actions require explicit human authorization and, where applicable, named owner
inputs, protected credentials, rollback plans, and recorded evidence. A browser
redirect is never proof of payment, a paid invoice is never proof of provisioning,
and generated code is never proof that a business rule is correct.

## Evidence trail

The public work path is inspectable through:

- `AGENTS.md` for repository operating instructions;
- `HOSTING_BILLING_SYSTEM_PLAN.md` for product and architecture requirements;
- `CODEX_DEVELOPMENT_COMMANDS.md` for authorized bounded commands;
- `docs/DECISIONS.md` for accepted durable decisions;
- `docs/PROGRESS.md` for command results, validation, risks, and blockers;
- automated tests and GitHub workflows for executable evidence;
- tagged releases, checksums, SBOMs, and attestations for distributed snapshots.

The history may show corrections, blocked commands, failed checks, or deferred work.
That transparency is intentional: AI assistance does not remove uncertainty, and a
green check does not replace human review or operator acceptance at a real external
boundary.

## Contribution policy

Contributors do not need to use Codex or any other AI tool. All contributions are
reviewed against the same architecture, tests, licensing, security, authorship, and
disclosure requirements. Contributors are responsible for reviewing what they submit
and for ensuring they have the right to contribute it under Apache-2.0.

## Public wording

Recommended descriptions include:

- "AI-assisted, open-source technical preview";
- "developed through a human-directed, human-reviewed Codex workflow";
- "a technical foundation for self-hosted web-hosting billing."

Avoid descriptions such as "AI-powered billing," "production-ready," "official
Codex project," or "endorsed by OpenAI" unless future, separately reviewed facts make
the relevant statement accurate. OpenAI and Codex names and logos remain the property
of their respective owner and are not part of the Webhost Billing project identity.
