const { spawnSync } = require('node:child_process');
const Fs = require('node:fs');

const FILE_DIFF_START_REGEX = /^diff --git /m;
const HUNK_START_REGEX = /^@@ /m;
// @@ -<old start>,<old count> +<new start>,<new count> @@
const HUNK_REGEX = /^@@ -\S+ \+(?<start>\d+)(?:,(?<count>\d+))? @@/gm;
const NEW_FILE_PATH_REGEX = /^\+\+\+ b\/(?<path>.*?)\t?$/m;
const ADDED_FILE_REGEX = /^--- \/dev\/null$/m;

class GitRepo {
    constructor(cwd) {
        this.cwd = cwd;
    }

    _cmd = args => {
        const gitProcess = spawnSync(
            'git',
            args,
            {
                cwd: this.cwd,
                encoding: 'utf8',
                maxBuffer: 1024 ** 3
            }
        );

        if (gitProcess.status !== 0) {
            throw new Error(`git ${args.join(' ')} failed: ${gitProcess.stderr}`);
        }

        return gitProcess.stdout;
    };

    showTopLevel = () => this._cmd(['rev-parse', '--show-toplevel']).trim();

    lsIgnoredFiles = excludeFile => this._cmd(['ls-files', '-z', '-c', '-i', `--exclude-from=${excludeFile}`]);

    lsFiles = () => this._cmd(['ls-files', '-z', '-c']);

    catFile = object => this._cmd(['cat-file', '-p', object]);

    diff = base => new GitDiff(this._cmd(['-c', 'core.quotePath=false', 'diff', '--unified=0', base]));
}

class GitDiff {
    constructor(output) {
        this.files = output.split(FILE_DIFF_START_REGEX)
        .slice(1)
        .map(fileDiff => {
            const fileHeader = fileDiff.split(HUNK_START_REGEX)[0];
            const filePath = fileHeader.match(NEW_FILE_PATH_REGEX)?.groups.path;
            const addedRanges = [...fileDiff.matchAll(HUNK_REGEX)]
                .map(({ groups: { start, count = 1 } }) => ({
                    start: Number(start),
                    count: Number(count),
                }))
                .map(({ start, count }) => ({
                    start,
                    end: start + count,
                }));

            return {
                filePath,
                isNew: ADDED_FILE_REGEX.test(fileHeader),
                addedRanges,
            };
        })
        // Deleted and binary files have no new path.
        .filter(({ filePath }) => filePath !== undefined)
        .reduce((files, { filePath, isNew, addedRanges }) => new Map([...files, [filePath, { isNew, addedRanges }]]), new Map());
    }

    isLineNew = (filePath, line) => {
        const file = this.files.get(filePath);
        if (file === undefined) {
            return false;
        } else if (line === 0) {
            // Line 0 is a file-wide error, which is only new in a new file.
            return file.isNew;
        }

        return file.addedRanges.some(({ start, end }) => line >= start && line < end);
    };
}

class PullRequest {
    constructor(event) {
        this.event = event;
    }

    static load = () => {
        if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
            return null;
        }

        const event = JSON.parse(Fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));

        return new PullRequest(event);
    };

    baseCommit = gitRepo => {
        /*
        tree 9b1c…
        parent 4f2e…         first parent; base branch
        parent a91c…         second parent; PR head
        author Robin Jacobs <…> 1760000000 +0000
        committer GitHub <…> 1760000000 +0000
        Merge a91c… into 4f2e…
        */
        const parents = gitRepo.catFile('HEAD').split('\n')
            .filter(line => line.startsWith('parent '))
            .map(line => line.slice('parent '.length));
        if (parents.length !== 2) {
            throw new Error('HEAD is not a merge commit');
        }

        const [baseBranch, prHead] = parents;

        if (prHead !== this.event.pull_request.head.sha) {
            throw new Error('HEAD is not a merge of PR head');
        }

        return baseBranch;
    };

    diff = root => {
        const gitRepo = new GitRepo(root);

        return gitRepo.diff(this.baseCommit(gitRepo));
    };
}

module.exports = { GitRepo, GitDiff, PullRequest };
