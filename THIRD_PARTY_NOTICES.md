# Third-Party Notices

Webhost Billing depends on third-party open-source packages. Those packages retain
their own copyrights and licenses; the Webhost Billing Apache License 2.0 does not
replace them.

The current production dependency graph includes software distributed under MIT,
MIT-0, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, EPL-2.0,
OFL-1.1, CC-BY-4.0, LGPL-3.0-or-later, Zlib, and compatible compound expressions.

Before distributing an official source archive or container image, maintainers must:

1. install from the committed lockfile;
2. run `pnpm licenses list --prod` and review every unknown or copyleft result;
3. preserve dependency license and attribution files in the distribution;
4. generate and attach an SBOM for the exact release artifact;
5. verify source/notice obligations for bundled native libraries, fonts, data sets,
   and container base images;
6. retain this file, `LICENSE`, and `NOTICE` with the distribution.

Notable non-MIT categories currently include the self-hosted Noto Sans Bengali font
(OFL-1.1), browser compatibility data (CC-BY-4.0), and the Sharp platform package,
which reports an Apache-2.0 and LGPL-3.0-or-later compound license. This is a release
inventory aid, not a substitute for the license text shipped by each dependency or a
legal review.

Run the dependency license command again for every release; this list can change when
the lockfile changes.
