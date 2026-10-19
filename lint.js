#!/usr/bin/env node
// Usage: EXCLUDE='<.gitignore-style patterns>' RULES='<YAML>' node lint.js, from inside the repo to check.

const { spawnSync } = require('node:child_process');
const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');
const Yaml = require('yaml');
const { GitDiff, GitRepo, PullRequest } = require('./git');

const ACTION_DIR = __dirname;
const DEFAULT_CONFIG_FILE = Path.join(ACTION_DIR, 'config.yml');
const MODES = [true, false, 'only-new'];
const AST_GREP = Path.join(ACTION_DIR, 'node_modules', '.bin', 'ast-grep');
const EDITORCONFIG_CHECKER_WRAPPER = Path.join(ACTION_DIR, 'node_modules', '.bin', 'editorconfig-checker');
const EDITORCONFIG_CHECKER_VERSION = 'v4.0.2';
const EDITORCONFIG_CHECKER_DIR = Path.join(ACTION_DIR, 'node_modules', 'editorconfig-checker', 'bin', EDITORCONFIG_CHECKER_VERSION);
const EDITORCONFIG_CHECKER_CONFIG = Path.join(ACTION_DIR, 'editorconfig-checker.json');
const EDITORCONFIG_EXEMPT_CONFIG = Path.join(ACTION_DIR, 'editorconfig-exempt', 'sgconfig.yml');
const INDENTATION_ERROR = /^wrong (indentation type|indent style|amount of left-padding)/;

const loadConfig = () => {
    const defaults = Yaml.parse(Fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf8'));
    const config = {
        exclude: [...defaults.exclude, ...(process.env.EXCLUDE ?? '').split('\n')],
        rules: { ...defaults.rules, ...Yaml.parse(process.env.RULES ?? '') }
    };

    const invalid = Object.entries(config.rules).find(([rule, mode]) => !(rule in defaults.rules) || !MODES.includes(mode));
    if (invalid) {
        throw new Error(`Invalid rule setting: ${invalid.join(': ')}`);
    }

    return config;
};

const listFiles = (root, exclude) => {
    const patterns = exclude.join('\n');
    const tempDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'robinlint-'));
    const excludeFile = Path.join(tempDir, 'exclude');
    Fs.writeFileSync(excludeFile, patterns);

    try {
        const gitRepo = new GitRepo(root);
        const splitNul = (output) => output.split('\0').filter(Boolean);
        const excluded = new Set(splitNul(gitRepo.lsIgnoredFiles(excludeFile)));

        return splitNul(gitRepo.lsFiles())
            .filter((file) => !excluded.has(file))
            .filter((file) => {
                const stats = Fs.lstatSync(Path.join(root, file), { throwIfNoEntry: false });
                return stats !== undefined && stats.isFile();
            });
    } finally {
        Fs.rmSync(tempDir, { recursive: true, force: true });
    }
};

const runAstGrep = (root, files, rules, diff) => {
    const astGrepProcess = spawnSync(
        AST_GREP,
        [
            'scan',
            '--config', Path.join(ACTION_DIR, 'sgconfig.yml'),
            '--filter', `^(?:${rules.join('|')})-[a-z]+$`,
            '--json=stream',
            ...files
        ],
        {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 1024 ** 3
        }
    );

    if (astGrepProcess.error) {
        throw astGrepProcess.error;
    } else if (astGrepProcess.status !== 0 && astGrepProcess.status !== 1) {
        throw new Error(`${AST_GREP} exited with status ${astGrepProcess.status}:\n${astGrepProcess.stderr}`);
    }

    const findings = astGrepProcess.stdout.split('\n')
        .filter(x => !!x)
        .map(JSON.parse)
        .filter(match => {
            // ast-grep counts lines from 0, git from 1.
            const line = match.range.start.line + 1;

            return diff === undefined || diff.isLineNew(match.file, line);
        });
    findings.forEach(match => {
        const { line, column } = match.range.start;
        console.log(`${match.file}:${line + 1}:${column + 1}: ${match.severity}[${match.ruleId}]: ${match.message}`);
    });

    return findings.every(match => match.severity !== 'error');
};

const checkAstGrep = (root, files, modes, diff) => {
    const rulesEnabledForMode = mode => Object.keys(modes).filter(rule => modes[rule] === mode);
    const allLinesRules = rulesEnabledForMode(true);
    const newLinesRules = rulesEnabledForMode('only-new');
    const allLinesPassed = allLinesRules.length === 0 || runAstGrep(root, files, allLinesRules);
    const newLinesPassed = newLinesRules.length === 0 || runAstGrep(root, files, newLinesRules, diff);

    return allLinesPassed && newLinesPassed;
};

const linesInsideCommentsAndStrings = (files, root) => {
    const astGrepProcess = spawnSync(
        AST_GREP,
        ['scan', '--config', EDITORCONFIG_EXEMPT_CONFIG, '--json=compact', ...files],
        {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 1024 ** 3
        }
    );

    if (astGrepProcess.error) {
        throw astGrepProcess.error;
    } else if (astGrepProcess.status !== 0) {
        throw new Error(`${AST_GREP} exited with status ${astGrepProcess.status}`);
    }

    // Every line after the first; ast-grep counts lines from 0, editorconfig-checker from 1.
    return JSON.parse(astGrepProcess.stdout).map((match) => ({
        file: match.file,
        firstLine: match.range.start.line + 2,
        lastLine: match.range.end.line + 1
    }));
};

const isBlankLine = (root, file, line) => 
    Fs.readFileSync(Path.join(root, file), 'utf8').split('\n')[line - 1].trim() === '';

// The npm wrapper downloads the binary on first use, but exits 0 when it crashes, so it only does the download.
const setUpEditorconfigChecker = () => {
    const setup = spawnSync(
        EDITORCONFIG_CHECKER_WRAPPER,
        ['-version'],
        {
            encoding: 'utf8',
            env: {
                ...process.env,
                EC_VERSION: EDITORCONFIG_CHECKER_VERSION
            }
        }
    );

    // A fresh install prints "Downloading <version>" first.
    if (setup.error) {
        throw setup.error;
    } else if (setup.status !== 0 || setup.stdout.trim().split('\n').pop() !== EDITORCONFIG_CHECKER_VERSION) {
        throw new Error(`Could not set up editorconfig-checker ${EDITORCONFIG_CHECKER_VERSION}:\n${setup.stdout}${setup.stderr}`);
    }

    // As is, or as the only file in bin/ of the release it unpacked.
    const binary = Path.join(EDITORCONFIG_CHECKER_DIR, 'editorconfig-checker');
    if (Fs.existsSync(binary)) {
        return binary;
    }
    const [unpacked] = Fs.readdirSync(Path.join(EDITORCONFIG_CHECKER_DIR, 'bin'));

    return Path.join(EDITORCONFIG_CHECKER_DIR, 'bin', unpacked);
};

const checkEditorconfig = (files, root) => {
    const exemptRanges = linesInsideCommentsAndStrings(files, root);
    const editorconfigCheckerBinary = setUpEditorconfigChecker();
    const editorconfigProcess = spawnSync(
        editorconfigCheckerBinary,
        ['-config', EDITORCONFIG_CHECKER_CONFIG, '-no-color', '-format', 'gcc', ...files],
        {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 1024 ** 3,
            stdio: ['ignore', 'pipe', 'inherit']
        }
    );

    if (editorconfigProcess.error) {
        throw editorconfigProcess.error;
    } else if (editorconfigProcess.status !== 0 && editorconfigProcess.status !== 1) {
        throw new Error(`${editorconfigCheckerBinary} exited with status ${editorconfigProcess.status}`);
    }

    const reported = editorconfigProcess.stdout.split('\n')
        .map((line) => line.match(/^(.+):(\d+):\d+: error: (.*)$/))
        .filter(x => !!x);
    if (editorconfigProcess.status === 1 && reported.length === 0) {
        throw new Error(`Could not parse ${editorconfigCheckerBinary} output:\n${editorconfigProcess.stdout}`);
    }

    const errors = reported.filter(([, file, line, message]) => {
        const exempt = exemptRanges.some((range) => {
            return range.file === file && Number(line) >= range.firstLine && Number(line) <= range.lastLine;
        });

        return !(INDENTATION_ERROR.test(message) && (exempt || isBlankLine(root, file, line)));
    });
    errors.forEach(([output]) => console.log(output));

    return errors.length === 0;
};

const ensureEditorconfig = root => {
    const repoEditorconfig = Path.join(root, '.editorconfig');
    if (!Fs.existsSync(repoEditorconfig)) {
        Fs.copyFileSync(Path.join(ACTION_DIR, '.editorconfig'), repoEditorconfig);
    }
};

const main = () => {
    const { exclude, rules } = loadConfig();
    const root = new GitRepo(process.cwd()).showTopLevel();
    const files = listFiles(root, exclude);
    const pullRequest = PullRequest.load();
    console.log(`Checking ${files.length} files in ${root}...`);
    if (files.length === 0) {
        return 0;
    }

    const { editorconfig, ...astGrepModes } = rules;
    const usesOnlyNew = Object.values(rules).includes('only-new');
    // Outside pull requests nothing is new, so only-new rules find nothing.
    const diff = pullRequest !== null && usesOnlyNew ? pullRequest.diff(root) : new GitDiff('');

    console.log('\n');
    console.log('> Lint');
    const astGrepPassed = checkAstGrep(root, files, astGrepModes, diff);
    console.log('\n');
    console.log(astGrepPassed ? '✅' : '❌');

    console.log('\n');
    console.log('> EditorConfig');
    ensureEditorconfig(root);
    const editorconfigPassed = !editorconfig || checkEditorconfig(files, root);
    console.log('\n');
    console.log(editorconfigPassed ? '✅' : '❌');

    return astGrepPassed && editorconfigPassed ? 0 : 1;
};

process.exitCode = main();
