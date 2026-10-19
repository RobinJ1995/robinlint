const { spawnSync } = require('node:child_process');

class Git {
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
}

module.exports = Git;
