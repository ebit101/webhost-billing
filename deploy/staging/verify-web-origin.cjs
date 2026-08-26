'use strict';

const [baseUrlInput, expectedOriginInput] = process.argv.slice(2);

if (!baseUrlInput || !expectedOriginInput) {
  throw new Error('Base URL and expected API origin are required');
}

const baseUrl = new URL(baseUrlInput);
const expectedOrigin = new URL(expectedOriginInput).origin;
const forbiddenOrigin = 'https://api.billing.example.com';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseText(url) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  assert(
    response.status === 200,
    `${url}: expected 200, received ${response.status}`,
  );
  return { response, body: await response.text() };
}

async function main() {
  const loginUrl = new URL('/login', baseUrl);
  const { response, body: html } = await responseText(loginUrl);
  const csp = response.headers.get('content-security-policy') ?? '';

  assert(
    csp.length > 0,
    'Login response did not include a Content-Security-Policy',
  );
  assert(
    csp.includes(`connect-src 'self' ${expectedOrigin}`),
    `CSP does not allow the expected API origin ${expectedOrigin}`,
  );
  assert(
    !csp.includes(forbiddenOrigin),
    'CSP contains the placeholder API origin',
  );

  const scriptPaths = [
    ...new Set(
      [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  assert(
    scriptPaths.length > 0,
    'Login page did not reference JavaScript assets',
  );

  let expectedOriginFound = false;
  for (const scriptPath of scriptPaths) {
    const scriptUrl = new URL(scriptPath, baseUrl);
    const { body } = await responseText(scriptUrl);
    assert(
      !body.includes(forbiddenOrigin),
      `${scriptUrl.pathname} contains the placeholder API origin`,
    );
    if (body.includes(expectedOrigin)) expectedOriginFound = true;
  }

  assert(
    expectedOriginFound,
    `Login JavaScript did not contain the expected API origin ${expectedOrigin}`,
  );
  console.log(`Browser API origin: PASS (${expectedOrigin})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Origin check failed');
  process.exitCode = 1;
});
