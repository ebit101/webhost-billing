import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import yaml from 'js-yaml';

import { extractMarkdownHeadingAnchors } from './check-markdown-links.mjs';

const defaultRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const defaultTemplateDirectory = '.github/ISSUE_TEMPLATE';
const bugReportFile = 'bug_report.yml';
const configurationFile = 'config.yml';
const supportedFieldTypes = new Set([
  'checkboxes',
  'dropdown',
  'input',
  'textarea',
  'upload',
]);
const requiredBugFields = Object.freeze([
  'version',
  'steps',
  'expected',
  'actual',
]);
const safeDemoFieldTypes = Object.freeze({
  affected_route: 'input',
  demo_health_stage: 'dropdown',
  docker_versions: 'input',
  operating_system: 'input',
});
const requiredSafeDemoFields = Object.freeze(Object.keys(safeDemoFieldTypes));
const requiredContextFields = new Set([
  'affected_route',
  'demo_health_stage',
  'operating_system',
]);
const requiredSafetyTerms = Object.freeze([
  '.demo-runtime/demo.env',
  'password',
  'cookie',
  'token',
  'personal',
  'customer',
  'payment evidence',
  'private host',
  'database content',
  'unredacted log',
]);
const requiredGuidanceTargets = Object.freeze([
  '../../docs/SAFE_EVALUATION_DEMO.md#troubleshooting',
  '../../SECURITY.md#reporting-a-vulnerability',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInside(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === '' ||
    (!pathFromParent.startsWith(`..${sep}`) &&
      pathFromParent !== '..' &&
      !isAbsolute(pathFromParent))
  );
}

function parseYamlDocument(source, sourceFile) {
  const documents = [];
  yaml.loadAll(source, (document) => documents.push(document), {
    filename: sourceFile,
    schema: yaml.JSON_SCHEMA,
  });
  if (documents.length !== 1 || !isRecord(documents[0])) {
    throw new Error('expected one YAML mapping document');
  }
  return documents[0];
}

function extractMarkdownLinks(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\[[^\]\r\n]+\]\(([^)\s]+)\)/gu)].map(
    (match) => match[1],
  );
}

function validateGuidanceTarget({
  canonicalRepositoryRoot,
  repositoryRoot,
  sourceFile,
  target,
}) {
  if (target.startsWith('https://')) {
    try {
      const url = new URL(target);
      return url.username === '' && url.password === '' && url.hostname !== ''
        ? undefined
        : 'HTTPS guidance link must not contain credentials';
    } catch {
      return 'guidance link is not a valid HTTPS URL';
    }
  }

  if (
    target.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(target) ||
    isAbsolute(target)
  ) {
    return 'guidance link must use HTTPS or a repository-local relative path';
  }

  const rawPath = target.split(/[?#]/u, 1)[0];
  if (rawPath === '') return 'guidance link must name a local file';

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return 'guidance link contains invalid URL encoding';
  }

  const absoluteTarget = resolve(
    repositoryRoot,
    dirname(sourceFile),
    decodedPath,
  );
  if (!isInside(repositoryRoot, absoluteTarget)) {
    return 'guidance link resolves outside the repository';
  }
  if (!existsSync(absoluteTarget)) return 'guidance link target does not exist';

  const canonicalTarget = realpathSync(absoluteTarget);
  if (!isInside(canonicalRepositoryRoot, canonicalTarget)) {
    return 'guidance link escapes the repository through a symbolic link';
  }

  const fragmentIndex = target.indexOf('#');
  if (fragmentIndex >= 0 && extname(canonicalTarget).toLowerCase() === '.md') {
    let fragment;
    try {
      fragment = decodeURIComponent(target.slice(fragmentIndex + 1));
    } catch {
      return 'guidance link contains invalid fragment encoding';
    }
    const anchors = extractMarkdownHeadingAnchors(
      readFileSync(canonicalTarget, 'utf8'),
    );
    if (!anchors.has(fragment)) {
      return 'guidance link heading anchor does not exist';
    }
  }
  return undefined;
}

function validateCommonForm(sourceFile, document, failures) {
  if (typeof document.name !== 'string' || document.name.trim().length < 4) {
    failures.push({
      sourceFile,
      reason: 'form name must contain at least 4 characters',
    });
  }
  if (
    typeof document.description !== 'string' ||
    document.description.trim() === ''
  ) {
    failures.push({
      sourceFile,
      reason: 'form description must be a non-empty string',
    });
  }
  if (!Array.isArray(document.body) || document.body.length === 0) {
    failures.push({
      sourceFile,
      reason: 'form body must be a non-empty array',
    });
    return [];
  }

  const fields = [];
  const seenIds = new Set();
  for (const [index, element] of document.body.entries()) {
    if (!isRecord(element) || typeof element.type !== 'string') {
      failures.push({
        sourceFile,
        reason: `body[${index}] must be a form element with a type`,
      });
      continue;
    }
    if (element.type === 'markdown') continue;
    if (!supportedFieldTypes.has(element.type)) {
      failures.push({
        sourceFile,
        reason: `body[${index}] uses unsupported field type ${JSON.stringify(element.type)}`,
      });
      continue;
    }
    if (
      typeof element.id !== 'string' ||
      !/^[A-Za-z0-9_-]+$/u.test(element.id)
    ) {
      failures.push({
        sourceFile,
        reason: `body[${index}] must have an alphanumeric, hyphen, or underscore id`,
      });
      continue;
    }
    if (seenIds.has(element.id)) {
      failures.push({
        sourceFile,
        reason: `field id ${JSON.stringify(element.id)} is duplicated`,
      });
    }
    seenIds.add(element.id);
    fields.push(element);
  }
  return fields;
}

function validateBugReport({
  canonicalRepositoryRoot,
  document,
  failures,
  fields,
  repositoryRoot,
  sourceFile,
}) {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));

  for (const fieldId of requiredBugFields) {
    const field = fieldsById.get(fieldId);
    if (!field || field.validations?.required !== true) {
      failures.push({
        sourceFile,
        reason: `bug field ${JSON.stringify(fieldId)} must exist and be required`,
      });
    }
  }

  for (const fieldId of requiredSafeDemoFields) {
    const field = fieldsById.get(fieldId);
    if (!field) {
      failures.push({
        sourceFile,
        reason: `safe-demo context field ${JSON.stringify(fieldId)} is missing`,
      });
      continue;
    }
    if (field.type !== safeDemoFieldTypes[fieldId]) {
      failures.push({
        sourceFile,
        reason: `safe-demo context field ${JSON.stringify(fieldId)} must use ${safeDemoFieldTypes[fieldId]}`,
      });
    }
    if (
      requiredContextFields.has(fieldId) &&
      field.validations?.required !== true
    ) {
      failures.push({
        sourceFile,
        reason: `safe-demo context field ${JSON.stringify(fieldId)} must be required`,
      });
    }
  }

  const deployment = fieldsById.get('deployment');
  const deploymentOptions = deployment?.attributes?.options;
  if (
    deployment?.type !== 'dropdown' ||
    deployment?.validations?.required !== true ||
    !Array.isArray(deploymentOptions) ||
    !deploymentOptions.includes('Safe evaluation demo')
  ) {
    failures.push({
      sourceFile,
      reason: 'deployment options must include "Safe evaluation demo"',
    });
  }

  const healthOptions =
    fieldsById.get('demo_health_stage')?.attributes?.options;
  if (
    !Array.isArray(healthOptions) ||
    !healthOptions.some((option) =>
      String(option).toLowerCase().startsWith('before'),
    ) ||
    !healthOptions.some((option) =>
      String(option).toLowerCase().startsWith('after'),
    )
  ) {
    failures.push({
      sourceFile,
      reason:
        'safe-demo health stage must offer before and after healthy options',
    });
  }

  const confirmation = fieldsById.get('sensitive_data_confirmation');
  const confirmationOptions = confirmation?.attributes?.options;
  const hasRequiredConfirmation =
    confirmation?.type === 'checkboxes' &&
    Array.isArray(confirmationOptions) &&
    confirmationOptions.some(
      (option) => isRecord(option) && option.required === true,
    );
  if (!hasRequiredConfirmation) {
    failures.push({
      sourceFile,
      reason: 'sensitive-data confirmation must include a required checkbox',
    });
  }
  const confirmationText = JSON.stringify(confirmation?.attributes ?? {})
    .toLowerCase()
    .replaceAll('\\u002e', '.');
  for (const term of requiredSafetyTerms) {
    if (!confirmationText.includes(term)) {
      failures.push({
        sourceFile,
        reason: `sensitive-data confirmation must cover ${JSON.stringify(term)}`,
      });
    }
  }

  const markdownValues = Array.isArray(document.body)
    ? document.body
        .filter((element) => isRecord(element) && element.type === 'markdown')
        .map((element) => element.attributes?.value)
        .filter((value) => typeof value === 'string')
    : [];
  const guidanceText = markdownValues.join('\n');
  for (const command of ['demo:doctor', 'demo:status']) {
    if (!guidanceText.includes(command)) {
      failures.push({
        sourceFile,
        reason: `safe-demo guidance must mention ${JSON.stringify(command)}`,
      });
    }
  }
  if (
    !/manually[^\n]*review/iu.test(guidanceText) ||
    !/redact/iu.test(guidanceText)
  ) {
    failures.push({
      sourceFile,
      reason: 'safe-demo guidance must require manual review and redaction',
    });
  }

  const guidanceTargets = markdownValues.flatMap(extractMarkdownLinks);
  for (const requiredTarget of requiredGuidanceTargets) {
    if (!guidanceTargets.includes(requiredTarget)) {
      failures.push({
        sourceFile,
        reason: `required guidance link ${JSON.stringify(requiredTarget)} is missing`,
      });
    }
  }
  for (const target of guidanceTargets) {
    const reason = validateGuidanceTarget({
      canonicalRepositoryRoot,
      repositoryRoot,
      sourceFile,
      target,
    });
    if (reason)
      failures.push({
        sourceFile,
        reason: `${JSON.stringify(target)} ${reason}`,
      });
  }
  return guidanceTargets.length;
}

export function checkIssueForms(options = {}) {
  const repositoryRoot = resolve(
    options.repositoryRoot ?? defaultRepositoryRoot,
  );
  const canonicalRepositoryRoot = realpathSync(repositoryRoot);
  const templateDirectory =
    options.templateDirectory ?? defaultTemplateDirectory;
  const absoluteTemplateDirectory = resolve(repositoryRoot, templateDirectory);
  const failures = [];
  let guidanceLinkCount = 0;
  let issueFormCount = 0;
  let parsedYamlCount = 0;
  let sawBugReport = false;

  const yamlFiles = readdirSync(absoluteTemplateDirectory, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /\.(?:yaml|yml)$/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const fileName of yamlFiles) {
    const sourceFile = `${templateDirectory}/${fileName}`.replaceAll('\\', '/');
    const source = readFileSync(resolve(repositoryRoot, sourceFile), 'utf8');
    let document;
    try {
      document = parseYamlDocument(source, sourceFile);
      parsedYamlCount += 1;
    } catch (error) {
      const line =
        isRecord(error) &&
        isRecord(error.mark) &&
        Number.isInteger(error.mark.line)
          ? ` near line ${error.mark.line + 1}`
          : '';
      failures.push({
        sourceFile,
        reason: `does not parse as one YAML mapping${line}`,
      });
      continue;
    }

    if (fileName === configurationFile) continue;
    issueFormCount += 1;
    const fields = validateCommonForm(sourceFile, document, failures);
    if (fileName === bugReportFile) {
      sawBugReport = true;
      guidanceLinkCount += validateBugReport({
        canonicalRepositoryRoot,
        document,
        failures,
        fields,
        repositoryRoot,
        sourceFile,
      });
    }
  }

  if (issueFormCount === 0) {
    failures.push({
      sourceFile: templateDirectory,
      reason: 'no issue-form YAML files were found',
    });
  }
  if (!sawBugReport) {
    failures.push({
      sourceFile: templateDirectory,
      reason: `${bugReportFile} is missing or invalid`,
    });
  }

  return {
    failures,
    guidanceLinkCount,
    issueFormCount,
    parsedYamlCount,
  };
}

export function formatIssueFormReport(result) {
  if (result.failures.length === 0) {
    return `Validated ${result.issueFormCount} GitHub issue forms and parsed ${result.parsedYamlCount} YAML files with ${result.guidanceLinkCount} guidance links.\n`;
  }

  const lines = [
    `Issue-form validation failed with ${result.failures.length} problem${result.failures.length === 1 ? '' : 's'}:`,
  ];
  for (const failure of result.failures) {
    lines.push(`- ${failure.sourceFile} — ${failure.reason}`);
  }
  return `${lines.join('\n')}\n`;
}

export function runIssueFormCheck(options = {}) {
  const result = checkIssueForms(options);
  const write = options.write ?? ((value) => process.stdout.write(value));
  write(formatIssueFormReport(result));
  return result.failures.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  try {
    process.exitCode = runIssueFormCheck();
  } catch {
    process.stderr.write('Issue-form validation could not run safely.\n');
    process.exitCode = 1;
  }
}

export const issueFormContract = Object.freeze({
  bugReportFile,
  requiredBugFields,
  requiredGuidanceTargets,
  requiredSafeDemoFields,
  requiredSafetyTerms,
  templateDirectory: defaultTemplateDirectory,
});
