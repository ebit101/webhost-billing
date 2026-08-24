# Webhost Billing Frontend Design System

## Product surfaces

The Next.js application has three deliberately distinct but related shells:

- **Public/store:** bright marketing pages with a compact sticky header, mobile navigation, plan cards, plan comparison, calls to action, and a business footer.
- **Customer portal:** a calm workspace centered on services, invoices, renewals, support, and account security.
- **Administrator:** a denser operational workspace centered on customers, orders, services, invoices, payments, support, automation, and settings.

The portal and administrator previews use fictional `.test` identities and representative values only. Placeholder module pages establish navigation, spacing, and feedback states; they do not implement future business workflows.

## Route structure

Next.js route groups separate shells without changing public URLs:

```text
app/(store)             / and /hosting
app/(portal)/portal     /portal and portal module previews
app/(admin)/admin       /admin and administrator module previews
app/login, register…    authentication screens
```

Authentication redirects customers to `/portal` and administrators to `/admin` after a successful API login. The fictional shell content is not an authorization mechanism. Every future real data request must continue using API role and ownership enforcement.

## Visual language

- Geist is the primary interface typeface; Geist Mono is reserved for technical identifiers where useful.
- Slate provides neutral surfaces and text. Cyan/teal `brand-*` tokens provide primary actions and navigation emphasis.
- Emerald communicates successful or active state, amber communicates attention or pending state, red communicates errors or destructive action, and blue communicates informational state.
- Workspace cards use 16-pixel corner radii, light borders, restrained shadows, and consistent 4/8-pixel-derived spacing.
- Public marketing sections use larger radii, type, and whitespace while preserving the same palette and interaction rules.

Global tokens and reduced-motion handling live in `apps/web/src/app/globals.css`.

## Shared components

- `Brand`, `PublicHeader`, `PublicFooter`, and `WorkspaceShell`
- `Button` and exported link-compatible button styles
- `PageHeader` and `MetricCard`
- Generic `DataTable` with a required accessible caption and horizontal small-screen overflow
- `StatusBadge` with named semantic tones
- `EmptyState`, `LoadingState`, and `ErrorState`
- `ConfirmationDialog` with labelled alert-dialog semantics, initial focus, focus containment, Escape/backdrop dismissal, focus restoration, busy state, and destructive styling
- `ToastProvider` and `useToast` with polite/error live announcements, manual dismissal, bounded stacking, and automatic timeout
- Decorative `Icon` glyphs are hidden from assistive technology; interactive controls provide visible or screen-reader labels.

## Responsive behavior

- Public navigation collapses to a keyboard-operable disclosure below the medium breakpoint.
- Portal and administrator navigation becomes an off-canvas drawer below the large breakpoint, with a backdrop, scroll lock, Escape dismissal, focus movement, and focus restoration.
- Summary cards progress from one to two to four columns as space permits.
- Dense dashboard sidebars stack below primary content at narrower widths.
- Tables retain semantic table markup and use horizontal scrolling rather than compressing content into unreadable columns.
- Controls use a minimum 40–44 pixel interaction height where practical.

## Accessibility baseline

- Every rendered page has a descriptive title and primary heading.
- A skip link targets `#main-content`.
- Active workspace links use `aria-current="page"`.
- Navigation disclosures expose `aria-expanded` and `aria-controls`.
- Forms use visible labels, browser autocomplete metadata, clear focus rings, disabled/busy states, and alert/status announcements.
- Error boundaries explain that data was not changed and offer an explicit retry.
- Animations respect `prefers-reduced-motion`.
- Color is paired with text or icons and is not the only state indicator.

## Component tests

The web application uses Vitest, jsdom, React Testing Library, and `user-event`. Tests cover:

- opening, selecting from, and Escape-closing responsive navigation;
- restoring focus to the mobile navigation trigger;
- dialog labelling, initial focus, Tab containment, Escape dismissal, and confirmation;
- toast live-region presentation and dismissal;
- accessible table captions and status content.

Run the focused suite with:

```bash
pnpm --filter @webhost-billing/web test
```
