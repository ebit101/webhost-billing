# Security alert review

Command 184 reviewed the seven open CodeQL alerts and two open Dependabot
alerts reported for `main` on 2026-11-03. Changes were validated locally.

| Alert | Disposition | Evidence |
| --- | --- | --- |
| CodeQL #1 and #2 | Fixed the staging origin verifier | CSP sources are compared as tokens. JavaScript URL candidates are parsed and compared by origin. A lookalike host fails either check. Scripts from another origin are rejected before fetch. |
| CodeQL #3 | Restored the API's default Helmet CSP | The API explicitly disabled the middleware's policy. Helmet now sends its default CSP. This is a configuration hardening change. Exploitability of the previous setting was not established. |
| CodeQL #4, #5, and #6 | False positives for application exposure | All three locations construct deliberately invalid duplicate-key fixtures in `currency-selection-request.spec.ts`. The replacements insert malformed test input to exercise the parser's rejection path. They do not sanitize or handle requests in production. The fixture assertions were retained and passed. |
| CodeQL #7 | Replaced the flagged registrar response scan | The same lossless parser serves the mock and live registrar adapters. It now quotes numeric tokens as it walks the bounded JSON input, eliminating the second unanchored regular expression pass. It retains duplicate-key checks and exact numeric strings. |
| Dependabot #29 | Existing mitigation verified | Modern `minimatch` resolves to the fixed `11.0.1`. The retained legacy callable consumer lacks the reported amplification routine. The regression suite checked actual consumer resolution and the advisory pattern. The broad version range keeps this alert open. |
| Dependabot #28 | Existing patch verified | The pinned `deepmerge@4.3.1` patch rejects prototype keys at the shipped entry points. Installed-consumer and ordinary merge regression checks passed. GitHub still reports the underlying package version. |

Focused validation passed for all 25 registrar tests, 18 currency request tests,
and 28 tooling mitigation tests. API typechecking passed. A local HTTP harness
confirmed the Helmet header on a JSON response and exercised four verifier cases:
the expected origin, a lookalike CSP source, a lookalike bundle URL, and an
off-origin script. The off-origin script received no request.

GitHub alert state remains open pending a hosted rescan or maintainer review.
Dependency applicability is specific to the installed versions and consumers
described in the [remediation notes](TOOLCHAIN_SECURITY_REMEDIATION.md).
