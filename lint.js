#!/usr/bin/env node
// Usage: EXCLUDE='<.gitignore-style patterns>' node lint.js, from inside the repo to check.

const { spawnSync } = require('node:child_process');
const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');

const ACTION_DIR = __dirname;
const AST_GREP = Path.join(ACTION_DIR, 'node_modules', '.bin', 'ast-grep');
const EDITORCONFIG_CHECKER = Path.join(ACTION_DIR, 'node_modules', '.bin', 'editorconfig-checker');
const EDITORCONFIG_CHECKER_VERSION = 'v4.0.2';
const EDITORCONFIG_EXEMPT_CONFIG = Path.join(ACTION_DIR, 'editorconfig-exempt', 'sgconfig.yml');
const INDENTATION_ERROR = /^wrong (indentation type|indent style|amount of left-padding)/;

const git = (cwd, args) => {
    const gitProcess = spawnSync(
        'git',
        args,
        {
            cwd,
            encoding: 'utf8',
            maxBuffer: 1024 ** 3
        }
    );

    if (gitProcess.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${gitProcess.stderr}`);
    }

    return gitProcess.stdout;
};

const listFiles = root => {
    const patterns = Fs.readFileSync(Path.join(ACTION_DIR, 'default-excludes'), 'utf8')
        + '\n' + (process.env.EXCLUDE || '') + '\n';
    const tempDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'robinlint-'));
    const excludeFile = Path.join(tempDir, 'exclude');
    Fs.writeFileSync(excludeFile, patterns);

    try {
        const splitNul = (output) => output.split('\0').filter(Boolean);
        const excluded = new Set(splitNul(git(root, ['ls-files', '-z', '-c', '-i', `--exclude-from=${excludeFile}`])));

        return splitNul(git(root, ['ls-files', '-z', '-c']))
            .filter((file) => !excluded.has(file))
            .filter((file) => {
                const stats = Fs.lstatSync(Path.join(root, file), { throwIfNoEntry: false });
                return stats !== undefined && stats.isFile();
            });
    } finally {
        Fs.rmSync(tempDir, { recursive: true, force: true });
    }
};

const runTool = (cmd, args, files, root) => {
    const toolProcess = spawnSync(
        cmd,
        [...args, ...files],
        {
            cwd: root,
            stdio: 'inherit'
        }
    );

    if (toolProcess.error) {
        throw toolProcess.error;
    } else if (toolProcess.status === 1) {
        return false;
    } else if (toolProcess.status !== 0) {
        throw new Error(`${cmd} exited with status ${toolProcess.status}`);
    }

    return true;
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

const checkEditorconfig = (files, root) => {
    const exemptRanges = linesInsideCommentsAndStrings(files, root);
    const editorconfigProcess = spawnSync(
        EDITORCONFIG_CHECKER,
        ['-no-color', '-format', 'gcc', ...files],
        {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 1024 ** 3,
            stdio: ['ignore', 'pipe', 'inherit'],
            env: {
                ...process.env,
                EC_VERSION: EDITORCONFIG_CHECKER_VERSION
            }
        }
    );

    if (editorconfigProcess.error) {
        throw editorconfigProcess.error;
    } else if (editorconfigProcess.status !== 0 && editorconfigProcess.status !== 1) {
        throw new Error(`${EDITORCONFIG_CHECKER} exited with status ${editorconfigProcess.status}`);
    }

    const reported = editorconfigProcess.stdout.split('\n')
        .map((line) => line.match(/^(.+):(\d+):\d+: error: (.*)$/))
        .filter(x => !!x);
    if (editorconfigProcess.status === 1 && reported.length === 0) {
        throw new Error(`Could not parse ${EDITORCONFIG_CHECKER} output:\n${editorconfigProcess.stdout}`);
    }

    const errors = reported.filter(([, file, line, message]) => {
        const exempt = exemptRanges.some((range) => {
            return range.file === file && Number(line) >= range.firstLine && Number(line) <= range.lastLine;
        });

        return !(INDENTATION_ERROR.test(message) && exempt);
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
    const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const files = listFiles(root);
    console.log(`Checking ${files.length} files in ${root}...`);
    if (files.length === 0) {
        return 0;
    }

    console.log('\n');
    console.log('> Lint');
    const astGrepPassed = runTool(
        AST_GREP,
        ['scan', '--config', Path.join(ACTION_DIR, 'sgconfig.yml'), '--report-style', 'short'],
        files,
        root
    );
    console.log('\n');
    console.log(astGrepPassed ? '✅' : '❌');

    console.log('\n');
    console.log('> EditorConfig');
    ensureEditorconfig(root);
    const editorconfigPassed = checkEditorconfig(files, root);
    console.log('\n');
    console.log(editorconfigPassed ? '✅' : '❌');

    return astGrepPassed && editorconfigPassed ? 0 : 1;
};

process.exitCode = main();
