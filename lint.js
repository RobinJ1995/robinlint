#!/usr/bin/env node
// Usage: EXCLUDE='<.gitignore-style patterns>' RULES='<YAML>' node lint.js, from inside the repo to check.

const { spawnSync } = require('node:child_process');
const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');
const Yaml = require('yaml');
const { GitRepo, PullRequest, Push } = require('./git');

const ACTION_DIR = __dirname;
const DEFAULT_CONFIG_FILE = Path.join(ACTION_DIR, 'config.yml');
const RULES_DIR = Path.join(ACTION_DIR, 'rules');
const MODES = [true, false, 'only-new'];
const AST_GREP = Path.join(ACTION_DIR, 'node_modules', '.bin', 'ast-grep');
// <rule>-<language>, e.g. braces-javascript
const RULE_ID_REGEX = /^(?<rule>.+)-[a-z]+$/;

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

const runAstGrep = (root, files) => {
    const astGrepProcess = spawnSync(
        AST_GREP,
        [
            'scan',
            '--config', Path.join(ACTION_DIR, 'sgconfig.yml'),
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

    return astGrepProcess.stdout.split('\n')
        .filter(x => !!x)
        .map(JSON.parse)
        .map(match => {
            // ast-grep counts lines and columns from 0.
            const line = match.range.start.line + 1;
            const column = match.range.start.column + 1;

            return {
                rule: match.ruleId.match(RULE_ID_REGEX).groups.rule,
                file: match.file,
                line,
                output: `${match.file}:${line}:${column}: ${match.severity}[${match.ruleId}]: ${match.message}`,
                isError: match.severity === 'error'
            };
        });
};

const main = () => {
    const { exclude, rules } = loadConfig();
    const root = new GitRepo(process.cwd()).showTopLevel();
    const files = listFiles(root, exclude);
    const pullRequest = PullRequest.load();
    const change = pullRequest ?? Push.load();
    console.log(`Checking ${files.length} files in ${root}...`);
    if (files.length === 0) {
        return 0;
    }

    const gitRepo = new GitRepo(root);
    // Outside pull requests and pushes, what's new is what the latest commit adds.
    const base = change !== null ? change.baseCommit(gitRepo) : gitRepo.firstParent('HEAD');
    const diff = gitRepo.diff(base);
    const isNew = finding => {
        // Outside a file can mean e.g. PR body
        if (finding.file === null) {
            return true;
        } else if (finding.line === null) {
            // A file-wide finding is only new in a new file.
            return diff.isFileNew(finding.file);
        }

        return diff.isLineNew(finding.file, finding.line);
    };
    // What the rules check, gathered once; every ast-grep rule takes its matches from the same scan.
    const context = {
        root,
        files,
        pullRequest,
        astGrepFindings: runAstGrep(root, files)
    };
    const enabledRules = Object.keys(rules).filter(rule => rules[rule]);
    const results = enabledRules.map(rule => {
        console.log('\n');
        console.log(`> ${rule}`);
        const runRule = require(Path.join(RULES_DIR, rule));
        const ruleFindings = runRule(context)
            .filter(finding => rules[rule] === true || isNew(finding));
        ruleFindings.forEach(finding => console.log(finding.output));
        const passed = ruleFindings.every(finding => !finding.isError);
        console.log('\n');
        console.log(passed ? '✅' : '❌');

        return passed;
    });

    return results.every(passed => passed) ? 0 : 1;
};

process.exitCode = main();
