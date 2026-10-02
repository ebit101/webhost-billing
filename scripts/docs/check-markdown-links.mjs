import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function toDisplayPath(path) {
  return path.split(sep).join('/');
}

function isInsideRepository(repositoryRoot, targetPath) {
  const targetRelativePath = relative(repositoryRoot, targetPath);
  return (
    targetRelativePath === '' ||
    (!targetRelativePath.startsWith(`..${sep}`) &&
      targetRelativePath !== '..' &&
      !isAbsolute(targetRelativePath))
  );
}

function maskRange(value, start, end) {
  const characters = value.split('');
  for (let index = start; index < end; index += 1) {
    if (characters[index] !== '\n' && characters[index] !== '\r') {
      characters[index] = ' ';
    }
  }
  return characters.join('');
}

function maskMarkdownCode(markdown) {
  let masked = maskMarkdownBlocks(markdown);
  const characters = masked.split('');
  for (let index = 0; index < characters.length; index += 1) {
    if (characters[index] !== '`') continue;
    let markerLength = 1;
    while (characters[index + markerLength] === '`') markerLength += 1;
    const marker = '`'.repeat(markerLength);
    const closingIndex = masked.indexOf(marker, index + markerLength);
    if (closingIndex === -1) continue;
    for (
      let maskedIndex = index;
      maskedIndex < closingIndex + markerLength;
      maskedIndex += 1
    ) {
      if (
        characters[maskedIndex] !== '\n' &&
        characters[maskedIndex] !== '\r'
      ) {
        characters[maskedIndex] = ' ';
      }
    }
    index = closingIndex + markerLength - 1;
  }

  return characters.join('');
}

function maskMarkdownBlocks(markdown) {
  let masked = markdown;
  const lines = markdown.match(/.*(?:\r?\n|$)/gu) ?? [];
  let offset = 0;
  let fence;

  for (const line of lines) {
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/u);
    if (!fence && opening) {
      fence = { character: opening[1][0], length: opening[1].length };
      masked = maskRange(masked, offset, offset + line.length);
    } else if (fence) {
      masked = maskRange(masked, offset, offset + line.length);
      const closingPattern = new RegExp(
        `^ {0,3}${fence.character}{${fence.length},}[ \\t]*(?:\\r?\\n)?$`,
        'u',
      );
      if (closingPattern.test(line)) fence = undefined;
    }
    offset += line.length;
  }

  masked = masked.replace(/<!--[^]*?-->/gu, (comment) =>
    comment.replace(/[^\r\n]/gu, ' '),
  );
  return masked;
}

const githubSlugPunctuation =
  /[\u0000-\u001f\u007f!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/gu;

function githubHeadingSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(githubSlugPunctuation, '')
    .replaceAll(' ', '-');
}

function extractMarkdownHeadingAnchors(markdown) {
  const masked = maskMarkdownBlocks(markdown);
  const anchors = new Set();
  const occurrences = new Map();
  const lines = masked.match(/.*(?:\r?\n|$)/gu) ?? [];

  for (const line of lines) {
    const contentLine = line.replace(/(?:\r?\n)$/u, '');
    const heading = contentLine.match(/^ {0,3}#{1,6}(?:[ \t]+(.*)|[ \t]*)$/u);
    if (!heading) continue;
    const headingText = (heading[1] ?? '').replace(/[ \t]+#+[ \t]*$/u, '');
    const baseSlug = githubHeadingSlug(headingText);
    let occurrence = occurrences.get(baseSlug) ?? 0;
    let slug = baseSlug;

    while (anchors.has(slug)) {
      occurrence += 1;
      slug = `${baseSlug}-${occurrence}`;
    }
    occurrences.set(baseSlug, occurrence);
    anchors.add(slug);
  }

  return anchors;
}

function createLineLocator(markdown) {
  const lineStarts = [0];
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === '\n') lineStarts.push(index + 1);
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

function extractMarkdownReferences(markdown) {
  const masked = maskMarkdownCode(markdown);
  const locateLine = createLineLocator(markdown);
  const references = [];
  const definitionRanges = [];
  const definitionPattern =
    /^ {0,3}\[[^\]\r\n]+\]:[ \t]*(?:<([^>\r\n]+)>|([^\s]+))/gmu;
  let match;

  while ((match = definitionPattern.exec(masked)) !== null) {
    const target = match[1] ?? match[2];
    const targetOffset = match.index + match[0].indexOf(target);
    references.push({ line: locateLine(targetOffset), target });
    definitionRanges.push([match.index, match.index + match[0].length]);
  }

  const isInDefinition = (offset) =>
    definitionRanges.some(([start, end]) => offset >= start && offset < end);

  for (let index = 0; index < masked.length - 1; index += 1) {
    if (masked[index] !== ']' || masked[index + 1] !== '(') continue;
    if (isInDefinition(index)) continue;

    let cursor = index + 2;
    while (/\s/u.test(masked[cursor] ?? '')) cursor += 1;
    const targetOffset = cursor;
    let target = '';

    if (masked[cursor] === '<') {
      cursor += 1;
      const closingIndex = masked.indexOf('>', cursor);
      if (closingIndex === -1) continue;
      target = markdown.slice(cursor, closingIndex);
    } else {
      let nestedParentheses = 0;
      let escaped = false;
      for (; cursor < masked.length; cursor += 1) {
        const character = masked[cursor];
        if (escaped) {
          target += character;
          escaped = false;
          continue;
        }
        if (character === '\\') {
          escaped = true;
          continue;
        }
        if (/\s/u.test(character)) break;
        if (character === '(') nestedParentheses += 1;
        if (character === ')') {
          if (nestedParentheses === 0) break;
          nestedParentheses -= 1;
        }
        target += character;
      }
    }

    if (target) {
      references.push({ line: locateLine(targetOffset), target });
    }
    index = cursor;
  }

  return references;
}

function classifyTarget(rawTarget) {
  const target = rawTarget.trim();
  if (
    target === '' ||
    target.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(target)
  ) {
    return { ignored: true };
  }

  const queryIndex = target.indexOf('?');
  const fragmentIndex = target.indexOf('#');
  const suffixIndexes = [queryIndex, fragmentIndex].filter(
    (index) => index >= 0,
  );
  const pathEnd =
    suffixIndexes.length > 0 ? Math.min(...suffixIndexes) : target.length;
  const rawPath = target.slice(0, pathEnd);
  const rawFragment =
    fragmentIndex >= 0 ? target.slice(fragmentIndex + 1) : undefined;

  if (rawPath === '' && !rawFragment) return { ignored: true };

  try {
    return {
      fragment:
        rawFragment === undefined ? undefined : decodeURIComponent(rawFragment),
      path: decodeURIComponent(rawPath),
    };
  } catch {
    return { error: 'contains invalid URL encoding' };
  }
}

function boundedTarget(target, maximumLength = 160) {
  const singleLine = target.replace(/[\r\n]/gu, ' ');
  const value =
    singleLine.length <= maximumLength
      ? singleLine
      : `${singleLine.slice(0, maximumLength - 3)}...`;
  return JSON.stringify(value);
}

export function checkMarkdownFiles({ files, repositoryRoot }) {
  const absoluteRepositoryRoot = resolve(repositoryRoot);
  const canonicalRepositoryRoot = realpathSync(absoluteRepositoryRoot);
  const failures = [];
  const headingCache = new Map();
  const trackedMarkdownTargets = new Set();
  let checkedReferenceCount = 0;
  let checkedAnchorCount = 0;

  for (const trackedFile of files) {
    const absoluteTrackedPath = resolve(absoluteRepositoryRoot, trackedFile);
    if (
      !isInsideRepository(absoluteRepositoryRoot, absoluteTrackedPath) ||
      !existsSync(absoluteTrackedPath)
    ) {
      continue;
    }
    const canonicalTrackedPath = realpathSync(absoluteTrackedPath);
    if (
      isInsideRepository(canonicalRepositoryRoot, canonicalTrackedPath) &&
      extname(canonicalTrackedPath).toLowerCase() === '.md'
    ) {
      trackedMarkdownTargets.add(canonicalTrackedPath);
    }
  }

  for (const sourceFile of files) {
    const absoluteSourcePath = resolve(absoluteRepositoryRoot, sourceFile);
    const canonicalSourcePath = realpathSync(absoluteSourcePath);
    const markdown = readFileSync(absoluteSourcePath, 'utf8');

    for (const reference of extractMarkdownReferences(markdown)) {
      const classified = classifyTarget(reference.target);
      if (classified.ignored) continue;
      checkedReferenceCount += 1;

      if (classified.error) {
        failures.push({
          line: reference.line,
          reason: classified.error,
          sourceFile: toDisplayPath(sourceFile),
          target: reference.target,
        });
        continue;
      }

      const resolvedTarget =
        classified.path === ''
          ? absoluteSourcePath
          : resolve(dirname(absoluteSourcePath), classified.path);
      if (!isInsideRepository(absoluteRepositoryRoot, resolvedTarget)) {
        failures.push({
          line: reference.line,
          reason: 'resolves outside the repository',
          sourceFile: toDisplayPath(sourceFile),
          target: reference.target,
        });
        continue;
      }

      if (!existsSync(resolvedTarget)) {
        failures.push({
          line: reference.line,
          reason: 'target does not exist',
          sourceFile: toDisplayPath(sourceFile),
          target: reference.target,
        });
        continue;
      }

      const canonicalTarget = realpathSync(resolvedTarget);
      if (!isInsideRepository(canonicalRepositoryRoot, canonicalTarget)) {
        failures.push({
          line: reference.line,
          reason: 'resolves outside the repository through a symbolic link',
          sourceFile: toDisplayPath(sourceFile),
          target: reference.target,
        });
        continue;
      }

      if (
        classified.fragment === undefined ||
        extname(canonicalTarget).toLowerCase() !== '.md' ||
        !trackedMarkdownTargets.has(canonicalTarget)
      ) {
        continue;
      }

      checkedAnchorCount += 1;
      let headings = headingCache.get(canonicalTarget);
      if (!headings) {
        headings = extractMarkdownHeadingAnchors(
          canonicalTarget === canonicalSourcePath
            ? markdown
            : readFileSync(canonicalTarget, 'utf8'),
        );
        headingCache.set(canonicalTarget, headings);
      }
      if (!headings.has(classified.fragment)) {
        failures.push({
          line: reference.line,
          reason: 'heading anchor does not exist',
          sourceFile: toDisplayPath(sourceFile),
          target: reference.target,
        });
      }
    }
  }

  return { checkedAnchorCount, checkedReferenceCount, failures };
}

export function listTrackedMarkdownFiles(
  repositoryRoot = defaultRepositoryRoot,
) {
  const result = spawnSync('git', ['ls-files', '-z', '--', '*.md'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  });

  if (result.status !== 0 || result.error) {
    throw new Error('Could not list tracked Markdown files with Git.');
  }

  return result.stdout.split('\0').filter(Boolean);
}

export function formatLinkCheckReport(result, fileCount) {
  if (result.failures.length === 0) {
    return `Checked ${result.checkedReferenceCount} local Markdown references, including ${result.checkedAnchorCount} heading anchors, across ${fileCount} tracked Markdown files.\n`;
  }

  const lines = [
    `Markdown link validation failed with ${result.failures.length} broken reference${result.failures.length === 1 ? '' : 's'}:`,
  ];
  for (const failure of result.failures) {
    lines.push(
      `- ${failure.sourceFile}:${failure.line} ${boundedTarget(failure.target)} — ${failure.reason}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function runMarkdownLinkCheck(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? defaultRepositoryRoot;
  const files = options.files ?? listTrackedMarkdownFiles(repositoryRoot);
  const result = checkMarkdownFiles({ files, repositoryRoot });
  const write = options.write ?? ((value) => process.stdout.write(value));
  write(formatLinkCheckReport(result, files.length));
  return result.failures.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  try {
    process.exitCode = runMarkdownLinkCheck();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown validation error.';
    process.stderr.write(
      `Markdown link validation could not run: ${message}\n`,
    );
    process.exitCode = 1;
  }
}
