const { spawnSync } = require('node:child_process');
const Fs = require('node:fs');
const Path = require('node:path');

const ACTION_DIR = Path.join(__dirname, '..');
const AST_GREP = Path.join(ACTION_DIR, 'node_modules', '.bin', 'ast-grep');
const EDITORCONFIG_CHECKER_WRAPPER = Path.join(ACTION_DIR, 'node_modules', '.bin', 'editorconfig-checker');
const EDITORCONFIG_CHECKER_VERSION = 'v4.0.2';
const EDITORCONFIG_CHECKER_DIR = Path.join(ACTION_DIR, 'node_modules', 'editorconfig-checker', 'bin', EDITORCONFIG_CHECKER_VERSION);
const EDITORCONFIG_CHECKER_CONFIG = Path.join(ACTION_DIR, 'editorconfig-checker.json');
const EDITORCONFIG_EXEMPT_CONFIG = Path.join(ACTION_DIR, 'editorconfig-exempt', 'sgconfig.yml');
const INDENTATION_ERROR = /^wrong (indentation type|indent style|amount of left-padding)/;

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

const ensureEditorconfig = root => {
    const repoEditorconfig = Path.join(root, '.editorconfig');
    if (!Fs.existsSync(repoEditorconfig)) {
        Fs.copyFileSync(Path.join(ACTION_DIR, '.editorconfig'), repoEditorconfig);
    }
};

module.exports = ({ root, files }) => {
    ensureEditorconfig(root);
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

    return reported
        .filter(([, file, line, message]) => {
            const exempt = exemptRanges.some((range) => {
                return range.file === file && Number(line) >= range.firstLine && Number(line) <= range.lastLine;
            });

            return !(INDENTATION_ERROR.test(message) && (exempt || isBlankLine(root, file, line)));
        })
        .map(([output, file, line]) => ({
            file,
            // editorconfig-checker reports file-wide errors on line 0.
            line: line === '0' ? null : Number(line),
            output,
            isError: true
        }));
};
