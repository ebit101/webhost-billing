# Installation Web Branding

Webhost Billing remains the generic project identity. A single installation can opt into
its own public web name, local PNG logo, tagline and public contacts. These controls affect
the storefront/header/footer, authentication shell, administrator/customer sidebar and
document-title templates. They do not change authentication, catalogue, money, policies,
invoice snapshots, provider modes or readiness status.

## Configuration and asset boundary

Set only public, owner-approved information before running `next build`. Never put a
credential, private contact, customer record or protected operating reference in a
`NEXT_PUBLIC_` variable: those values are compiled into browser code.

| Variable                            | Default / constraint                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_BRAND_NAME`            | `Webhost Billing`; plain text, 1–80 characters, no title placeholders |
| `NEXT_PUBLIC_BRAND_LOGO_PATH`       | Empty; optional `/branding/filename.png`, no subdirectories or query  |
| `NEXT_PUBLIC_BRAND_LOGO_WIDTH`      | `285`; intrinsic PNG width, integer 1–2048                            |
| `NEXT_PUBLIC_BRAND_LOGO_HEIGHT`     | `63`; intrinsic PNG height, integer 1–2048                            |
| `NEXT_PUBLIC_BRAND_TAGLINE`         | Empty; optional plain text, up to 120 characters                      |
| `NEXT_PUBLIC_BRAND_CONTACT_EMAIL`   | Empty; optional valid public email                                    |
| `NEXT_PUBLIC_BRAND_CONTACT_PHONE`   | Empty; optional international `+` number, 7–15 digits                 |
| `NEXT_PUBLIC_BRAND_CONTACT_ADDRESS` | Empty; optional plain text, up to 500 characters                      |
| `NEXT_PUBLIC_BRAND_WEBSITE`         | Empty; optional credential-free HTTPS origin, no path/query/fragment  |

Blank variables use generic defaults/omit optional contacts. A name without a logo uses
accessible text; leaving everything unset preserves the existing generic icon/wordmark.
The logo is served locally without Next.js image transformation, third-party requests or
CSP exceptions. Its intrinsic dimensions reserve layout space and its responsive bounding
box preserves aspect ratio. A white backing keeps the original asset legible on dark shells.

Before development/build, the web configuration checks a configured logo's regular-file
status, canonical confinement inside `apps/web/public`, size (24 bytes to 2 MB), PNG
signature/IHDR and matching dimensions. Missing files, symlinks at the file, escaping parent
links or inconsistent metadata fail with a fixed error. This is a metadata guard, not a
complete image decoder or a guarantee of visual quality; inspect the original image and
verify browser decoding, contrast and layout before deployment.

## Speed Host preparation

App-authored labels use sentence case across all installations, following the
[project presentation rule](../AGENTS.md#quality-and-change-discipline). Branding
does not change protocol codes, historical identifiers, user-entered content or
the original logo's lettering.

The owner-approved public values are in
[the opt-in example](../deploy/branding/speed-host.env.example). Logo provenance and the
correct `.com.bd` portal source are recorded in
[the business policy record](PRODUCTION_BUSINESS_POLICIES.md).
The original logo is 285 × 63 pixels, 14,658 bytes, SHA-256
`5d11099f9a262a1ada9fd6b4679466627245454084f07b40d588193675d98836`.

This workspace's ignored local `apps/web/.env.local` selects the Speed Host values, and
`apps/web/public/branding/speed-host-logo.png` holds an unchanged copy of the collected
owner asset. Neither local file is committed. The public source checkout does not include
Speed Host's trademark asset or activate Speed Host branding. Other operators should supply
their own authorized logo rather than assume the software licence grants branding rights.

For a fresh **owner installation**, place the separately supplied original PNG at that
public path and merge the public example into its ignored local environment. Preserve
existing environment settings; do not overwrite credentials or use the example as a full
production environment. Recheck the hash against the recorded original before using it.
No runtime image fetch or automatic copy from a live portal occurs.

For Docker, the web Dockerfile and production Compose build arguments explicitly forward
these public values. The original PNG must be installed in the build context first; the
Dockerfile copies the prepared `public` directory into the standalone web image. Raw
`release-artifacts/` are excluded from the context. With a branded environment but no PNG,
the image build fails instead of shipping a broken header. Staging inherits the production
web build arguments, while the fictional safe demo uses generic defaults.

Public branding is frozen in each web build, including server/client render and metadata.
Changing container runtime variables alone does not rebrand an existing image: build and
verify a new image with the selected values, then use a separately approved deployment.
Rollback means returning to the previous reviewed web image/asset/configuration; no database
migration is introduced. Rebuilding without the variables restores generic branding.

## Local verification

Run `pnpm --filter @webhost-billing/web build` with the intended public environment and
prepared PNG first. Then run `pnpm --filter @webhost-billing/web test:branding`. The default
browser expectation is `Webhost Billing`; for the owner's local Speed Host build, set
`BRANDING_EXPECTED_NAME` to `Speed Host` in the test process. This expectation does not
activate or configure branding; it must match the already built image.

The browser suite starts only a new loopback web server on port 3187 and refuses an existing
server. It checks anonymous home/password-reset shells at 320, 375 and 1440 pixels, local
logo decoding, titles, contact/navigation targets, mobile navigation, keyboard focus and
horizontal overflow. Browser requests outside that exact loopback origin or non-GET
requests are blocked and fail the test. It does not start Docker, an API, workers, databases
or integrations, sign in, submit forms or read real customer data. Screenshots are local
ignored files under `release-artifacts/branding-preview/`; inspect them before delivery.
The browser checks do not replace the full business lifecycle or production acceptance.

## Separate controls and launch gates

- Existing `email.branding` settings control transactional email name/color/sender. They
  are not changed by this feature and contain no logo field. SMTP/mailbox ownership and
  delivery acceptance remain separate; no email is sent during branding preparation.
- Existing `business.identity` controls future invoice identity snapshots. These web values
  do not rewrite issued identity or add a remote/local logo to deterministic invoice PDFs.
- Existing fictional/demo warnings remain visible even with owner branding. Branding is
  not a production/demo-mode switch and must not hide the unresolved launch gates.
- Public contacts are not tested incident responders or an SLA. Do not copy unsupported
  WHMCS catalogue features, multiple currencies, proprietary templates or marketing promises.
- `my.speedhost.bd` remains the separately gated operating target. This change authorizes
  no deployment, production policy save, customer migration, DNS change or cutover.
