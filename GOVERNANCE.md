# Project Governance

Webhost Billing currently uses a maintainer-led governance model.

## Roles

- **Maintainers** set project direction, review contributions, publish releases,
  coordinate security fixes, and enforce community standards.
- **Contributors** propose issues and pull requests and participate in technical
  discussion and review.

The current repository owner is the final decision-maker while the maintainer group
is small. Maintainer membership may be expanded based on sustained, constructive,
security-conscious contributions.

## Decision making

Routine changes are decided through pull-request review. Changes to licensing,
financial invariants, authentication, provider authority, destructive operations,
database compatibility, or project governance require explicit maintainer approval
and durable documentation in `docs/DECISIONS.md` when architectural.

When consensus is not reached, maintainers document the trade-off and decision. The
project may reject a technically valid change that would expand scope, weaken safety,
or create an unsustainable maintenance burden.

## Releases

Only maintainers may create official tags, releases, or container images. Modified
distributions are permitted by the license but must not imply endorsement or present
themselves as official Webhost Billing releases.
