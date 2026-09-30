## Summary

<!-- Explain the problem and the smallest solution implemented. -->

## Risk

- [ ] Authentication or authorization
- [ ] Money, invoices, payments, refunds, or reporting
- [ ] Database schema or migration
- [ ] External provider or hosting mutation
- [ ] Secrets, logging, or personal data
- [ ] User interface only
- [ ] Documentation only

## Validation

<!-- List exact commands and results. Do not say "tests pass" without details. -->

- [ ] Formatting checked
- [ ] Lint checked
- [ ] Type checking passed
- [ ] Relevant unit/component tests passed
- [ ] Relevant integration/invariant tests passed
- [ ] Build passed
- [ ] Documentation and changelog updated when applicable

## Safety checklist

- [ ] No credentials, `.env` files, private keys, customer data, dumps, or unredacted logs are included.
- [ ] Monetary calculations remain integer minor-unit calculations.
- [ ] Financial history remains append-only where required.
- [ ] Authorization and resource ownership are enforced server-side.
- [ ] Retries and callbacks remain idempotent.
- [ ] No uncertain external mutation is blindly retried.
- [ ] No browser redirect is treated as payment proof.
- [ ] No automatic permanent hosting termination was introduced.

## Migration and rollback

<!-- Describe forward migration and rollback/compatibility impact, or write "Not applicable". -->
