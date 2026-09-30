# Public Release Guide

## Release status

Webhost Billing is open-source alpha software licensed under Apache-2.0. The source
repository may move faster than tagged releases, and the `0.x` series can contain
breaking changes. There is no stable production-support promise until a `1.0.0`
release is explicitly announced.

The public source repository and any operator's hosted installation are separate
security boundaries. Publication does not authorize testing a hosted installation.

## Release channels

- **`main`** — reviewed development state; may change without compatibility notice.
- **Prerelease tags** such as `v0.1.0-alpha.1` — evaluation candidates.
- **Stable tags** — reserved for releases that pass every required release gate.

Only repository maintainers may publish official tags, GitHub Releases, container
images, checksums, SBOMs, or provenance attestations.

## Versioning

Use Semantic Versioning once a public API or supported deployment contract is
declared:

- patch: backwards-compatible fixes;
- minor: backwards-compatible features, or documented breaking changes before 1.0;
- major: breaking changes after 1.0.

Database migrations remain forward-only. Release notes must identify schema changes,
configuration changes, security fixes, deprecations, and rollback constraints.

## Required release gate

Before creating a tag:

1. Work from a clean, reviewed `main` commit.
2. Verify that the copyright holder has the right to distribute every changed file.
3. Scan the complete Git history and release artifact for credentials and private data.
4. Install exactly from `pnpm-lock.yaml` and run the full formatting, lint, type,
   unit, integration, invariant, browser, migration, build, and dependency-audit gate.
5. Review `pnpm licenses list --prod`, update `THIRD_PARTY_NOTICES.md`, and preserve
   all required third-party license material.
6. Generate an SPDX or CycloneDX SBOM for each distributed artifact.
7. If containers are distributed, build them from the exact tag without embedded
   credentials, scan every image, and identify images by immutable digest. A
   source-only release must say explicitly that it contains no container images.
8. Attach checksums, SBOMs, provenance attestations, upgrade instructions, migration
   notes, known limitations, and rollback information to the GitHub Release.
9. Verify the release from a fresh clone and, for images, by pulling the published
   digest rather than using a local build.
10. Keep `latest` informational only; deployments must pin an exact version or digest.

The production launch commands in `CODEX_DEVELOPMENT_COMMANDS.md` remain separate.
Publishing an open-source release never authorizes deployment, DNS changes, real
payments, email delivery, or hosting-panel mutations.

The repository's `.gitleaks.toml` extends the default Gitleaks rules with only
reviewed exact-value exceptions for documentation phrases and explicitly fictional
test data. New exceptions require the same line-by-line review and must never be
used to suppress a real or ambiguous credential.

## Source release artifacts

Run `pnpm release:source:build -- <tag>` from the clean commit named by the tag.
The command refuses a dirty or mismatched checkout and produces Git archives,
complete and production-only CycloneDX SBOMs, and `SHA256SUMS` under the ignored
`release-artifacts/<tag>/` directory. Publish the release as a draft, upload every
asset, and publish only after verifying the remote tag, asset digests, release
notes, and prerelease status.

Enable GitHub release immutability before the first release. An immutable release
locks its tag and assets and receives GitHub's release attestation. Consumers can
verify the release with `gh release verify <tag>` and an individual downloaded
asset with `gh release verify-asset <tag> <path>`.

## Repository settings

Maintainers should configure GitHub with:

- branch rules for `main` requiring pull requests, one approval, resolved
  conversations, and successful CI/CodeQL checks;
- deletion and force-push protection;
- Dependabot alerts and security updates;
- secret scanning and push protection;
- private vulnerability reporting;
- automatic branch deletion after merge;
- Discussions when community support capacity exists;
- immutable releases when available for the repository.

Administrative bypass should be limited to emergency security or repository recovery
work and documented afterward.

## Compatibility and support

The supported runtime is Node.js 24 with pnpm 11.22 and the container/database versions
pinned by the repository. Operators own their infrastructure, provider accounts,
secrets, backups, legal compliance, and upgrades. See `SUPPORT.md` and `SECURITY.md`.

## Branding

Apache-2.0 permits modification and redistribution but does not grant trademark
rights. Forks should use a distinct name and visual identity when their changes could
reasonably be mistaken for an official release. Accurate statements such as "based on
Webhost Billing" are welcome.

Describe Webhost Billing as an **AI-assisted open-source technical preview** while its
production gate remains `NO-GO`. "AI-assisted" refers to the documented development
workflow; it does not claim that the released application contains an AI runtime or
AI-powered billing behavior. Every accepted change is human-reviewed. Do not market
an alpha source release as production-ready.

Codex may be identified factually as a development assistant in documentation and
project history. Keep Webhost Billing as the product identity, do not incorporate
OpenAI names or logos into its branding, do not imply sponsorship or endorsement, and
include the independent-project disclaimer wherever the Codex workflow is introduced.
