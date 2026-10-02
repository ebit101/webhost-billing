import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkMarkdownFiles } from './check-markdown-links.mjs';

const defaultRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const defaultMapFile = 'docs/CONTRIBUTOR_PATHS.md';
const requiredAreaHeadings = Object.freeze([
  'Demo tooling',
  'Next.js UI',
  'NestJS API modules',
  'Worker and scheduler jobs',
  'Shared contracts',
  'Database migrations',
]);

function createLineLocator(value) {
  const lineStarts = [0];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n') lineStarts.push(index + 1);
  }
  return (offset) => {
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (lineStarts[middle] <= offset) low = middle;
      else high = middle;
    }
    return low + 1;
  };
}

function extractRootScriptReferences(markdown) {
  const references = [];
  const lines = markdown.match(/.*(?:\r?\n|$)/gu) ?? [];
  const locateLine = createLineLocator(markdown);
  let lineNumber = 0;
  let fence;

  for (const line of lines) {
    lineNumber += 1;
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/u);
    if (!fence && opening) {
      fence = {
        character: opening[1][0],
        language: opening[2].trim().toLowerCase(),
        length: opening[1].length,
      };
      continue;
    }
    if (fence) {
      const closingPattern = new RegExp(
        `^ {0,3}${fence.character}{${fence.length},}[ \\t]*(?:\\r?\\n)?$`,
        'u',
      );
      if (closingPattern.test(line)) {
        fence = undefined;
        continue;
      }
      if (fence.language !== 'bash' && fence.language !== 'sh') continue;
      const command = line.trim();
      if (command === '' || command.startsWith('#')) continue;
      const match = command.match(/^corepack pnpm(?: run)?\s+(\S+)/u);
      references.push({
        line: lineNumber,
        script: match?.[1],
        validCommand: Boolean(match && !match[1].startsWith('-')),
      });
    }
  }

  const inlinePattern = /`corepack pnpm(?: run)?\s+(\S+?)(?:\s+[^`]*)?`/gu;
  let inlineMatch;
  while ((inlineMatch = inlinePattern.exec(markdown)) !== null) {
    references.push({
      line: locateLine(inlineMatch.index),
      script: inlineMatch[1],
      validCommand: !inlineMatch[1].startsWith('-'),
    });
  }

  return references;
}

function findUnlinkedPathLiterals(markdown) {
  const locateLine = createLineLocator(markdown);
  const failures = [];
  const pattern =
    /`((?:(?:apps|packages|scripts|docs|demo)\/[A-Za-z0-9_./*()-]+)|(?:AGENTS|README|CONTRIBUTING|SECURITY|SUPPORT|CHANGELOG|CODE_OF_CONDUCT|GOVERNANCE|HOSTING_BILLING_SYSTEM_PLAN|CODEX_DEVELOPMENT_COMMANDS)\.md|package\.json)`/gu;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    failures.push({
      line: locateLine(match.index),
      reason: `repository path ${JSON.stringify(match[1])} must be a local Markdown link`,
    });
  }
  return failures;
}

function findMissingHeadings(markdown) {
  const headings = new Set(
    [...markdown.matchAll(/^###\s+(.+?)\s*$/gmu)].map((match) => match[1]),
  );
  return requiredAreaHeadings
    .filter((heading) => !headings.has(heading))
    .map((heading) => ({
      reason: `required area heading ${JSON.stringify(heading)} is missing`,
    }));
}

export function checkContributorPathMap(options = {}) {
  const repositoryRoot = resolve(
    options.repositoryRoot ?? defaultRepositoryRoot,
  );
  const mapFile = options.mapFile ?? defaultMapFile;
  const markdown = readFileSync(resolve(repositoryRoot, mapFile), 'utf8');
  const packageDocument = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
  );
  const rootScripts = packageDocument.scripts ?? {};
  const linkResult = checkMarkdownFiles({ files: [mapFile], repositoryRoot });
  const failures = linkResult.failures.map((failure) => ({
    line: failure.line,
    reason: `${JSON.stringify(failure.target)} ${failure.reason}`,
  }));

  failures.push(...findMissingHeadings(markdown));
  failures.push(...findUnlinkedPathLiterals(markdown));

  const scriptReferences = extractRootScriptReferences(markdown);
  if (scriptReferences.length === 0) {
    failures.push({ reason: 'no root pnpm validation scripts were found' });
  }
  for (const reference of scriptReferences) {
    if (!reference.validCommand) {
      failures.push({
        line: reference.line,
        reason:
          'validation commands must use `corepack pnpm <root-script>` without pnpm options',
      });
      continue;
    }
    if (!Object.hasOwn(rootScripts, reference.script)) {
      failures.push({
        line: reference.line,
        reason: `root pnpm script ${JSON.stringify(reference.script)} does not exist`,
      });
    }
  }

  return {
    checkedPathCount: linkResult.checkedReferenceCount,
    checkedScriptCount: new Set(
      scriptReferences
        .filter((reference) => reference.validCommand)
        .map((reference) => reference.script),
    ).size,
    failures,
  };
}

export function formatContributorPathReport(result) {
  if (result.failures.length === 0) {
    return `Checked ${result.checkedPathCount} contributor-map paths and ${result.checkedScriptCount} root pnpm scripts.\n`;
  }

  const lines = [
    `Contributor path validation failed with ${result.failures.length} problem${result.failures.length === 1 ? '' : 's'}:`,
  ];
  for (const failure of result.failures) {
    const location = failure.line ? `${defaultMapFile}:${failure.line} ` : '';
    lines.push(`- ${location}${failure.reason}`);
  }
  return `${lines.join('\n')}\n`;
}

export function runContributorPathCheck(options = {}) {
  const result = checkContributorPathMap(options);
  const write = options.write ?? ((value) => process.stdout.write(value));
  write(formatContributorPathReport(result));
  return result.failures.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  try {
    process.exitCode = runContributorPathCheck();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown validation error.';
    process.stderr.write(
      `Contributor path validation could not run: ${message}\n`,
    );
    process.exitCode = 1;
  }
}

export const contributorPathContract = Object.freeze({
  mapFile: defaultMapFile,
  requiredAreaHeadings,
});
