import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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
    target.startsWith('#') ||
    target.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(target)
  ) {
    return { ignored: true };
  }

  const pathWithoutSuffix = target.split(/[?#]/u, 1)[0];
  try {
    return { path: decodeURIComponent(pathWithoutSuffix) };
  } catch {
    return { error: 'contains invalid URL encoding' };
  }
}

export function checkMarkdownFiles({ files, repositoryRoot }) {
  const absoluteRepositoryRoot = resolve(repositoryRoot);
  const canonicalRepositoryRoot = realpathSync(absoluteRepositoryRoot);
  const failures = [];
  let checkedReferenceCount = 0;

  for (const sourceFile of files) {
    const absoluteSourcePath = resolve(absoluteRepositoryRoot, sourceFile);
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

      const resolvedTarget = resolve(
        dirname(absoluteSourcePath),
        classified.path,
      );
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
      }
    }
  }

  return { checkedReferenceCount, failures };
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
    return `Checked ${result.checkedReferenceCount} local Markdown references across ${fileCount} tracked Markdown files.\n`;
  }

  const lines = [
    `Markdown link validation failed with ${result.failures.length} broken reference${result.failures.length === 1 ? '' : 's'}:`,
  ];
  for (const failure of result.failures) {
    lines.push(
      `- ${failure.sourceFile}:${failure.line} ${JSON.stringify(failure.target)} — ${failure.reason}`,
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
