const { spawnSync } = require('node:child_process');
const Fs = require('node:fs');

const FILE_DIFF_START_REGEX = /^diff --git /m;
const HUNK_START_REGEX = /^@@ /m;
// @@ -<old start>,<old count> +<new start>,<new count> @@
const HUNK_REGEX = /^@@ -\S+ \+(?<start>\d+)(?:,(?<count>\d+))? @@/gm;
const NEW_FILE_PATH_REGEX = /^\+\+\+ b\/(?<path>.*?)\t?$/m;
const ADDED_FILE_REGEX = /^--- \/dev\/null$/m;
const ZERO_SHA_REGEX = /^0+$/;

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

    hasObject = sha => spawnSync('git', ['cat-file', '-e', sha], { cwd: this.cwd }).status === 0;

    parents = commit => this.catFile(commit).split('\n')
        .filter(line => line.startsWith('parent '))
        .map(line => line.slice('parent '.length));

    emptyTree = () => this._cmd(['hash-object', '-t', 'tree', '/dev/null']).trim();

    // Before the first commit, and for the first commit itself, everything is new.
    firstParent = commit => {
        if (!this.hasObject(commit)) {
            return this.emptyTree();
        }

        const [firstParent] = this.parents(commit);

        return firstParent ?? this.emptyTree();
    };

    fetchCommit = sha => this._cmd(['fetch', '--quiet', '--no-tags', '--depth=1', 'origin', sha]);

    isShallow = () => this._cmd(['rev-parse', '--is-shallow-repository']).trim() === 'true';

    unshallow = refspec => this._cmd(['fetch', '--quiet', '--no-tags', '--unshallow', 'origin', refspec]);

    mergeBase = (a, b) => this._cmd(['merge-base', a, b]).trim();

    head = () => this._cmd(['rev-parse', 'HEAD']).trim();

    // HEAD's whole history, newest first; none before the first commit.
    commits = () => {
        if (!this.hasObject('HEAD')) {
            return [];
        } else if (this.isShallow()) {
            this.unshallow(this.head());
        }

        // sha, author name, author email, committer name, committer email, then the message, each on its own line
        return this._cmd(['log', '-z', '--format=%H%n%an%n%ae%n%cn%n%ce%n%B', 'HEAD'])
            .split('\0')
            .filter(commit => commit !== '')
            .map(commit => {
                const [sha, authorName, authorEmail, committerName, committerEmail, ...messageLines] = commit.split('\n');

                return {
                    sha,
                    author: {
                        name: authorName,
                        email: authorEmail
                    },
                    committer: {
                        name: committerName,
                        email: committerEmail
                    },
                    message: messageLines.join('\n')
                };
            });
    };

    // The commits in HEAD's history that aren't in base's; all of them when base is the empty tree.
    commitsSince = base => {
        if (!this.hasObject('HEAD')) {
            return [];
        }

        const excluded = base === this.emptyTree() ? [] : ['--not', base];

        return this._cmd(['rev-list', 'HEAD', ...excluded])
            .split('\n')
            .filter(sha => sha !== '');
    };

    diff = base => {
        if (!this.hasObject(base)) {
            this.fetchCommit(base);
        }

        return new GitDiff(this._cmd(['-c', 'core.quotePath=false', 'diff', '--unified=0', base]));
    };
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
                isFileNew: ADDED_FILE_REGEX.test(fileHeader),
                addedRanges,
            };
        })
        // Deleted and binary files have no new path.
        .filter(({ filePath }) => filePath !== undefined)
        .reduce((files, { filePath, isFileNew, addedRanges }) => new Map([...files, [filePath, { isFileNew, addedRanges }]]), new Map());
    }

    isFileNew = filePath => this.files.get(filePath)?.isFileNew === true;

    isLineNew = (filePath, line) => this.files.get(filePath)
        ?.addedRanges.some(({ start, end }) => line >= start && line < end) === true;
}

const getGithubEvent = () => JSON.parse(Fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));

class PullRequest {
    constructor(event) {
        this.event = event;
    }

    static load = () => {
        if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
            return null;
        }

        const event = getGithubEvent();

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
        const parents = gitRepo.parents('HEAD');
        const [baseBranch, prHead] = parents;
        if (parents.length === 2 && prHead === this.event.pull_request.head.sha) {
            return baseBranch;
        }

        // Checked out without merging into the base branch, e.g. at the PR head.
        const { base } = this.event.pull_request;
        if (gitRepo.isShallow()) {
            gitRepo.unshallow(base.sha);
        }

        return gitRepo.mergeBase(base.sha, 'HEAD');
    };
}

class Push {
    constructor(event) {
        this.event = event;
    }

    static load = () => {
        if (process.env.GITHUB_EVENT_NAME !== 'push') {
            return null;
        }

        const event = getGithubEvent();
        // A push that deletes a branch adds nothing.
        if (ZERO_SHA_REGEX.test(event.after)) {
            return null;
        }

        return new Push(event);
    };

    baseCommit = gitRepo => {
        const { repository, before, after } = this.event;
        if (!ZERO_SHA_REGEX.test(before)) {
            return before;
        }

        // A new branch has no before; it's new from where it split off the default branch.
        const defaultBranch = `refs/remotes/origin/${repository.default_branch}`;
        if (gitRepo.isShallow()) {
            gitRepo.unshallow(`${repository.default_branch}:${defaultBranch}`);
        }

        return gitRepo.mergeBase(defaultBranch, after);
    };
}

module.exports = { GitRepo, GitDiff, PullRequest, Push };
