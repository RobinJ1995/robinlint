const { test } = require('node:test');
const Assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');
const Yaml = require('yaml');

const LINT_SCRIPT_PATH = Path.join(__dirname, '..', 'lint.js');
const SAMPLES_DIR = Path.join(__dirname, 'samples');

const gibRepo = (files) => {
    const repo = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'robinlint-test-'));
    
    Object.entries(files).forEach(([name, content]) => {
        Fs.mkdirSync(
            Path.dirname(Path.join(repo, name)),
            { recursive: true }
        );
        Fs.writeFileSync(
            Path.join(repo, name),
            content
        );
    });
    
    spawnSync('git', ['init', '-q'], { cwd: repo });
    spawnSync('git', ['add', '-A'], { cwd: repo });
    
    return repo;
};

const lintRepo = (repo, exclude = '', rules = '') => {
    const proc = spawnSync(
        'node',
        [LINT_SCRIPT_PATH],
        {
            cwd: repo,
            encoding: 'utf8', 
            env: {
                ...process.env,
                EXCLUDE: exclude,
                RULES: rules,
                // CI runs these tests in its own pull_request event.
                GITHUB_EVENT_NAME: ''
            }
        }
    );
    
    return {
        status: proc.status,
        output: proc.stdout + proc.stderr
    };
};

const findings = (output) => {
    return [...output.matchAll(/^(.+?):(\d+):\d+: error\[([\w-]+)\]/gm)]
        .map((m) => `${m[1]}:${m[2]} ${m[3]}`)
        .sort();
};

const expected = (name, content, lang) => {
    return content.split('\n')
        .flatMap((line, i) => {
            const m = line.match(/expect: ([\w, -]+)/);
            return m
                ? m[1].split(',').map((rule) => `${name}:${i + 1} ${rule.trim()}-${lang}`)
                : [];
        }
    ).sort();
};

const sample = (lang, name) => Fs.readFileSync(Path.join(SAMPLES_DIR, lang, name), 'utf8');

Fs.readdirSync(SAMPLES_DIR).forEach((lang) => {
    Fs.readdirSync(Path.join(SAMPLES_DIR, lang)).forEach((name) => {
        const content = sample(lang, name);
        
        if (/^bad\./i.test(name)) {
            test(`${lang}: ${name} is flagged on exactly the marked lines`, () => {
                const want = expected(name, content, lang);
                Assert.ok(want.length > 0);
                
                const result = lintRepo(gibRepo({
                    [name]: content
                }));
                Assert.deepEqual(findings(result.output), want, result.output);
                Assert.equal(result.status, 1, result.output);
            });
            return;
        }
        
        test(`${lang}: ${name} passes`, () => {
            const result = lintRepo(gibRepo({
                [name]: content
            }));
            Assert.deepEqual(findings(result.output), [], result.output);
            Assert.equal(result.status, 0, result.output);
        });
    });
});

test('excluded files, folders and wildcards are not checked', () => {
    const bad = sample('javascript', 'bad.js');
    const files = {
        'one.js': bad,
        'vendor/lib/two.js': bad,
        'src/three.gen.js': bad,
        'src/four.js': bad
    };
    Assert.equal(lintRepo(gibRepo(files)).status, 1);
    
    const result = lintRepo(gibRepo(files), 'one.js\nvendor/\n*.gen.js\n/src/four.js\n');
    Assert.deepEqual(findings(result.output), [], result.output);
    Assert.equal(result.status, 0, result.output);
});

test('files excluded by default are not checked', () => {
    const result = lintRepo(gibRepo({
        'lib/model.g.dart': sample('dart', 'bad.dart'),
        'pubspec.lock': 'a:\n\tb: 1'
    }));
    Assert.equal(result.status, 0, result.output);
});

test('untracked files are not checked', () => {
    const repo = gibRepo({
        'good.js': sample('javascript', 'good.js')
    });
    Fs.writeFileSync(Path.join(repo, 'untracked.js'), sample('javascript', 'bad.js'));
    Assert.equal(lintRepo(repo).status, 0);
});

test('the default .editorconfig is enforced when the repo has none', () => {
    const repo = gibRepo({
        'tabs.txt': 'a\n\tb\n',
        'no-newline.txt': 'a',
        'crlf.txt': 'a\r\nb\r\n'
    });
    const result = lintRepo(repo);
    Assert.equal(result.status, 1, result.output);
    Assert.match(result.output, /tabs\.txt/);
    Assert.match(result.output, /no-newline\.txt/);
    Assert.match(result.output, /crlf\.txt/);
});

test('files that follow the default .editorconfig pass', () => {
    const result = lintRepo(gibRepo({
        'ok.txt': 'a\n    b\n',
        'trailing.md': 'a  \n'
    }));
    Assert.equal(result.status, 0, result.output);
});

test("the repo's own .editorconfig replaces the default entirely", () => {
    const repo = gibRepo({
        '.editorconfig': '[*]\nindent_style = tab\n',
        'tabs.txt': 'a\n\tb\n',
        'no-newline.txt': 'a'
    });
    const result = lintRepo(repo);
    Assert.equal(result.status, 0, result.output);
    
    Fs.writeFileSync(Path.join(repo, 'spaces.txt'), 'a\n    b\n');
    spawnSync('git', ['add', 'spaces.txt'], { cwd: repo });
    
    const resultWithSpaces = lintRepo(repo);
    Assert.equal(resultWithSpaces.status, 1, resultWithSpaces.output);
    Assert.match(resultWithSpaces.output, /spaces\.txt/);
});

test('files are never modified', () => {
    const files = {
        'bad.js': sample('javascript', 'bad.js'),
        'tabs.txt': 'a\n\tb  \r\n',
        'no-newline.txt': 'a'
    };
    const repo = gibRepo(files);
    Assert.equal(lintRepo(repo).status, 1);
    Object.entries(files).forEach(([name, content]) => {
        Assert.equal(Fs.readFileSync(Path.join(repo, name), 'utf8'), content, name);
    });
});

test('a repo with no supported languages and clean files passes', () => {
    Assert.equal(lintRepo(gibRepo({
        'main.go': 'package main\n',
        'README.md': 'hi\n'
    })).status, 0);
});

test('paths with spaces work', () => {
    const result = lintRepo(gibRepo({
        'my dir/bad file.js': sample('javascript', 'bad.js')
    }));
    Assert.equal(result.status, 1);
    Assert.ok(findings(result.output).every((f) => f.startsWith('my dir/bad file.js:')), result.output);
});

test('indentation inside comments and strings is not checked', () => {
    const result = lintRepo(gibRepo({
        '.editorconfig': `root = true
[*]
indent_style = tab
`,
        'generate.py': `"""Colours.

  dock surface        #38383B
  overview backdrop   #222226
"""


def template():
	return f"""
  <a>
    <b/>
  </a>
"""
`,
        'icon.xml': `<?xml version="1.0" encoding="utf-8"?>
<vector>
	<!-- The swirl: 12 blades, standing in for the orange
	     wedges of the colour icon -->
	<path/>
</vector>
`,
        'Fixture.kt': `class Fixture {
	val json = """
        {"a": 1}
    """.trimIndent()
}
`
    }));
    Assert.equal(result.status, 0, result.output);
});

test('indentation of code next to comments and strings is still checked', () => {
    const result = lintRepo(gibRepo({
        '.editorconfig': `root = true
[*]
indent_style = tab
`,
        'generate.py': `"""Docstring.

  table
"""


def f():
  return 1
`
    }));
    Assert.equal(result.status, 1, result.output);
    Assert.match(result.output, /generate\.py:8:0: error: wrong indentation type/);
    Assert.doesNotMatch(result.output, /generate\.py:3:/);
});

test('alignment spaces after tabs are allowed', () => {
    const result = lintRepo(gibRepo({
        '.editorconfig': `root = true
[*]
indent_style = tab
`,
        'align.py': `def f():
	return call(first,
	            second)
`
    }));
    Assert.equal(result.status, 0, result.output);
});

test('lines with only tabs are allowed', () => {
    const result = lintRepo(gibRepo({
        '.editorconfig': `root = true
[*]
indent_style = tab
`,
        'blank.py': `def f():
	x = 1
	
	return x
`
    }));
    Assert.equal(result.status, 0, result.output);
});

test('markdown files are left alone by the default .editorconfig', () => {
    const result = lintRepo(gibRepo({
        'notes.md': '# Title\r\n\n\tTabs\n   three spaces\nno final newline'
    }));
    Assert.equal(result.status, 0, result.output);
});

test('indentation inside CSS and SCSS comments is not checked', () => {
    const result = lintRepo(gibRepo({
        '.editorconfig': `root = true
[*]
indent_style = tab
`,
        'theme.scss': `/* Colour mode.
   \`media-query\` makes Bootstrap emit its dark colour mode as
   \`@media (prefers-color-scheme: dark)\` rather than \`[data-bs-theme="dark"]\`, */
.card {
	color: $primary;
}
`,
        'theme.css': `/* Colour mode.
   second line */
body {
	color: red;
}
`
    }));
    Assert.equal(result.status, 0, result.output);
});

test('feature files may use any indentation under the default .editorconfig', () => {
    const result = lintRepo(gibRepo({
        'login.feature': `Feature: Login
	Scenario: wrong password
   Given a user
     When they log in with the wrong password
`
    }));
    Assert.equal(result.status, 0, result.output);
});

test('feature files still get line ending and final newline checks', () => {
    const result = lintRepo(gibRepo({
        'login.feature': `Feature: Login\r
  Scenario: wrong password`
    }));
    Assert.equal(result.status, 1, result.output);
    Assert.match(result.output, /login\.feature:0:0: error: wrong line endings or no final newline/);
});

test('rules can be turned off in the config', () => {
    const content = sample('javascript', 'bad.js');
    const result = lintRepo(gibRepo({ 'bad.js': content }), '', 'braces: false\n');
    const want = expected('bad.js', content, 'javascript').filter((finding) => !finding.endsWith(' braces-javascript'));
    Assert.deepEqual(findings(result.output), want, result.output);

    const editorconfigOff = lintRepo(gibRepo({ 'tabs.txt': 'a\n\tb\n' }), '', 'editorconfig: false\n');
    Assert.equal(editorconfigOff.status, 0, editorconfigOff.output);
});

test('unknown rules and modes are refused', () => {
    [
        ['brace-style: true\n', /Invalid rule setting: brace-style: true/],
        ['braces: maybe\n', /Invalid rule setting: braces: maybe/]
    ].forEach(([rules, message]) => {
        const result = lintRepo(gibRepo({ 'ok.txt': 'a\n' }), '', rules);
        Assert.notEqual(result.status, 0, result.output);
        Assert.match(result.output, message);
    });
});

test('every ast-grep rule can be configured', () => {
    const defaults = Yaml.parse(Fs.readFileSync(Path.join(__dirname, '..', 'config.yml'), 'utf8')).rules;
    const rulesDir = Path.join(__dirname, '..', 'rules');
    Fs.readdirSync(rulesDir).forEach((file) => {
        Yaml.parseAllDocuments(Fs.readFileSync(Path.join(rulesDir, file), 'utf8')).forEach((document) => {
            const rule = document.get('id').replace(/-[a-z]+$/, '');
            Assert.ok(rule in defaults, `${rule} (${file}) is missing from config.yml`);
        });
    });
});

const GIT_IDENTITY = {
    GIT_AUTHOR_NAME: 'Robin Jacobs',
    GIT_AUTHOR_EMAIL: 'dummy@pingwing.be',
    GIT_COMMITTER_NAME: 'Robin Jacobs',
    GIT_COMMITTER_EMAIL: 'dummy@pingwing.be'
};

const gitIn = (repo, args) => {
    const gitProcess = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, ...GIT_IDENTITY }
    });
    Assert.equal(gitProcess.status, 0, gitProcess.stderr);

    return gitProcess.stdout.trim();
};

const commitFiles = (repo, files, message = 'change') => {
    Object.entries(files).forEach(([name, content]) =>
        Fs.writeFileSync(Path.join(repo, name), content)
    );
    gitIn(repo, ['add', '-A']);
    gitIn(repo, ['commit', '-q', '-m', message]);

    return gitIn(repo, ['rev-parse', 'HEAD']);
};

const lintEvent = ({ repo, eventName, event, rules }) => {
    const eventPath = Path.join(repo, '..', `${Path.basename(repo)}-event.json`);
    Fs.writeFileSync(eventPath, JSON.stringify(event));

    const lintProcess = spawnSync('node', [LINT_SCRIPT_PATH], {
        cwd: repo,
        encoding: 'utf8',
        env: {
            ...process.env,
            RULES: rules,
            GITHUB_EVENT_NAME: eventName,
            GITHUB_EVENT_PATH: eventPath
        }
    });

    return {
        status: lintProcess.status,
        output: lintProcess.stdout + lintProcess.stderr
    };
};

const BASE_FILES = {
    'code.js': `function f(x) {
    if (x) return 1;
    return 2;
}
`
};
const PR_FILES = {
    'code.js': `${BASE_FILES['code.js']}
function g(y) {
    if (y) return 3;
    return 4;
}
`
};

test('only-new rules check only the lines a pull request adds', () => {
    const repo = gibRepo({});
    const base = commitFiles(repo, BASE_FILES);
    gitIn(repo, ['switch', '-q', '-c', 'pr']);
    const head = commitFiles(repo, PR_FILES);
    gitIn(repo, ['switch', '-q', '-']);
    gitIn(repo, ['merge', '-q', '--no-ff', '-m', 'merge', 'pr']);

    const result = lintEvent({
        repo,
        eventName: 'pull_request',
        event: {
            pull_request: {
                base: {
                    sha: base
                },
                head: {
                    sha: head,
                    ref: 'pr'
                }
            }
        },
        rules: 'braces: only-new\n'
    });
    Assert.equal(result.status, 1, result.output);
    Assert.deepEqual(findings(result.output), ['code.js:7 braces-javascript'], result.output);
});

test('only-new rules check only the lines a pull request checked out at its head adds', () => {
    const repo = gibRepo({});
    const base = commitFiles(repo, BASE_FILES);
    gitIn(repo, ['switch', '-q', '-c', 'pr']);
    const head = commitFiles(repo, PR_FILES);

    const result = lintEvent({
        repo,
        eventName: 'pull_request',
        event: {
            pull_request: {
                base: {
                    sha: base
                },
                head: {
                    sha: head,
                    ref: 'pr'
                }
            }
        },
        rules: 'braces: only-new\n'
    });
    Assert.equal(result.status, 1, result.output);
    Assert.deepEqual(findings(result.output), ['code.js:7 braces-javascript'], result.output);
});

test('only-new rules check only the lines a push adds', () => {
    const repo = gibRepo({});
    const before = commitFiles(repo, BASE_FILES);
    const after = commitFiles(repo, PR_FILES);

    const result = lintEvent({
        repo,
        eventName: 'push',
        event: {
            ref: 'refs/heads/master',
            before,
            after
        },
        rules: 'braces: only-new\n'
    });
    Assert.equal(result.status, 1, result.output);
    Assert.deepEqual(findings(result.output), ['code.js:7 braces-javascript'], result.output);
});

test('only-new rules check only the lines a new branch adds', () => {
    const repo = gibRepo({});
    const base = commitFiles(repo, BASE_FILES);
    gitIn(repo, ['update-ref', 'refs/remotes/origin/master', base]);
    gitIn(repo, ['switch', '-q', '-c', 'new']);
    const after = commitFiles(repo, PR_FILES);

    const result = lintEvent({
        repo,
        eventName: 'push',
        event: {
            repository: {
                default_branch: 'master'
            },
            ref: 'refs/heads/new',
            before: '0'.repeat(40),
            after
        },
        rules: 'braces: only-new\n'
    });
    Assert.equal(result.status, 1, result.output);
    Assert.deepEqual(findings(result.output), ['code.js:7 braces-javascript'], result.output);
});

test('only-new rules check only the lines the latest commit adds outside pull requests and pushes', () => {
    const repo = gibRepo({});
    commitFiles(repo, BASE_FILES);
    commitFiles(repo, PR_FILES);

    const result = lintRepo(repo, '', 'braces: only-new\n');
    Assert.equal(result.status, 1, result.output);
    Assert.deepEqual(findings(result.output), ['code.js:7 braces-javascript'], result.output);
});

test('only-new rules check every line before the first commit', () => {
    const result = lintRepo(gibRepo(PR_FILES), '', 'braces: only-new\n');
    Assert.equal(result.status, 1, result.output);
    Assert.deepEqual(findings(result.output), ['code.js:2 braces-javascript', 'code.js:7 braces-javascript'], result.output);
});

test('only-new editorconfig counts file-wide errors as new only in new files', () => {
    const repo = gibRepo({});
    commitFiles(repo, {
        'tabs.txt': `a
\tb
`,
        'crlf.txt': `a\r
b\r
`
    });
    commitFiles(repo, {
        'tabs.txt': `a
\tb
\tc
`,
        'crlf.txt': `a\r
b\r
c\r
`,
        'new.txt': 'no final newline'
    });

    const result = lintRepo(repo, '', 'editorconfig: only-new\n');
    Assert.equal(result.status, 1, result.output);
    Assert.match(result.output, /^tabs\.txt:3:0: error: wrong indent style/m);
    Assert.doesNotMatch(result.output, /^tabs\.txt:2:/m);
    Assert.doesNotMatch(result.output, /^crlf\.txt:/m);
    Assert.match(result.output, /^new\.txt:0:0: error: wrong line endings or no final newline/m);
});

const AD_ERROR = 'Commit messages and PR descriptions should not contain tool-injected advertising';

const lintPullRequest = ({ eventName = 'pull_request', title = 'fix thing', body = 'it was broken' }) => {
    const repo = gibRepo({});
    const base = commitFiles(repo, { 'a.txt': 'a\n' });
    gitIn(repo, ['switch', '-q', '-c', 'pr']);
    const head = commitFiles(repo, { 'a.txt': 'a\nb\n' });

    return lintEvent({
        repo,
        eventName,
        event: {
            pull_request: {
                title,
                body,
                base: {
                    sha: base
                },
                head: {
                    sha: head,
                    ref: 'pr'
                }
            }
        },
        rules: ''
    });
};

test('pull requests without ads pass', () => {
    const result = lintPullRequest({
        body: `Summaries are generated by Gemini now, see \`claude/stripe-1-schema\` and \`source_session_id\`.

A Claude Code on the web container has Docker installed (Codex P2 on #34).`
    });
    Assert.equal(result.status, 0, result.output);
});

test('a "Generated with Claude Code" footer in a PR description fails', () => {
    const result = lintPullRequest({
        body: `Fixes it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)`
    });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(`PR description: error: ${AD_ERROR}`), result.output);
});

test('a "Generated by Claude Code" session footer in a PR description fails', () => {
    const result = lintPullRequest({
        body: `Fixes it.

---
_Generated by [Claude Code](https://claude.ai/code/session_01ABC)_`
    });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(AD_ERROR), result.output);
});

test('a session link in a PR description fails', () => {
    const result = lintPullRequest({
        body: `Fixes it.

https://claude.ai/code/session_01ABC`
    });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(AD_ERROR), result.output);
});

test('a Claude-Session trailer in a PR description fails', () => {
    const result = lintPullRequest({
        body: `Fixes it.

Claude-Session: https://claude.ai/code/session_01ABC`
    });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(AD_ERROR), result.output);
});

test('a Codex task link in a PR description fails', () => {
    const result = lintPullRequest({
        body: `Fixes it.
------
[Codex Task](https://chatgpt.com/codex/cloud/tasks/task_e_123)`
    });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(AD_ERROR), result.output);
});

test('Copilot coding agent tips in a PR description fail', () => {
    const result = lintPullRequest({
        body: `Fixes it.

<!-- START COPILOT CODING AGENT TIPS -->`
    });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(AD_ERROR), result.output);
});

test('a tool as Co-Authored-By in a PR description fails', () => {
    const result = lintPullRequest({ body: 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>' });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(AD_ERROR), result.output);
});

test('pull_request_target events are not checked as a pull request', () => {
    const result = lintPullRequest({
        eventName: 'pull_request_target',
        body: '🤖 Generated with [Claude Code](https://claude.com/claude-code)'
    });
    Assert.equal(result.status, 0, result.output);
});

const AD_COMMIT_MESSAGE = `fix thing

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;

test('commits without ads pass', () => {
    const repo = gibRepo({});
    commitFiles(repo, { 'a.txt': 'a\n' }, `fix thing

Co-authored-by: Alice <alice@example.com>`);

    const result = lintRepo(repo);
    Assert.equal(result.status, 0, result.output);
});

test('an ad in the latest commit message fails', () => {
    const repo = gibRepo({});
    commitFiles(repo, { 'a.txt': 'a\n' });
    const sha = commitFiles(repo, { 'b.txt': 'b\n' }, AD_COMMIT_MESSAGE);

    const result = lintRepo(repo);
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(`commit ${sha.slice(0, 7)} message: error: ${AD_ERROR}`), result.output);
});

test('only-new commit checks skip ads in older commits', () => {
    const repo = gibRepo({});
    commitFiles(repo, { 'a.txt': 'a\n' }, AD_COMMIT_MESSAGE);
    commitFiles(repo, { 'b.txt': 'b\n' });

    const result = lintRepo(repo);
    Assert.equal(result.status, 0, result.output);
});

test('no-ads-in-commits: true checks every commit', () => {
    const repo = gibRepo({});
    const sha = commitFiles(repo, { 'a.txt': 'a\n' }, AD_COMMIT_MESSAGE);
    commitFiles(repo, { 'b.txt': 'b\n' });

    const result = lintRepo(repo, '', 'no-ads-in-commits: true\n');
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(`commit ${sha.slice(0, 7)} message: error: ${AD_ERROR}`), result.output);
});

test('an ad in a pull request commit fails', () => {
    const repo = gibRepo({});
    const base = commitFiles(repo, { 'a.txt': 'a\n' });
    gitIn(repo, ['switch', '-q', '-c', 'pr']);
    commitFiles(repo, { 'b.txt': 'b\n' }, AD_COMMIT_MESSAGE);
    const head = commitFiles(repo, { 'c.txt': 'c\n' });

    const result = lintEvent({
        repo,
        eventName: 'pull_request',
        event: {
            pull_request: {
                base: {
                    sha: base
                },
                head: {
                    sha: head,
                    ref: 'pr'
                }
            }
        },
        rules: ''
    });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(AD_ERROR), result.output);
});

const TOOL_AUTHOR_ERROR = 'The commit author indicates who is responsible for a given piece of code. Tools cannot be held accountable, so cannot be commit authors.';

const commitAsClaude = repo => {
    gitIn(repo, ['commit', '-q', '--allow-empty', '-m', 'fix thing', '--author=Claude <noreply@anthropic.com>']);

    return gitIn(repo, ['rev-parse', 'HEAD']);
};

test('a tool as the latest commit author fails', () => {
    const repo = gibRepo({});
    commitFiles(repo, { 'a.txt': 'a\n' });
    const sha = commitAsClaude(repo);

    const result = lintRepo(repo);
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(`commit ${sha.slice(0, 7)} author: error: ${TOOL_AUTHOR_ERROR}`), result.output);
});

test('only-new commit author checks skip older commits', () => {
    const repo = gibRepo({});
    commitFiles(repo, { 'a.txt': 'a\n' });
    commitAsClaude(repo);
    commitFiles(repo, { 'b.txt': 'b\n' });

    const result = lintRepo(repo);
    Assert.equal(result.status, 0, result.output);
});

test('no-tools-as-commit-author: true checks every commit', () => {
    const repo = gibRepo({});
    commitFiles(repo, { 'a.txt': 'a\n' });
    const sha = commitAsClaude(repo);
    commitFiles(repo, { 'b.txt': 'b\n' });

    const result = lintRepo(repo, '', 'no-tools-as-commit-author: true\n');
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(`commit ${sha.slice(0, 7)} author: error: ${TOOL_AUTHOR_ERROR}`), result.output);
});

const BRANCH_AD_ERROR = 'Branch names should not contain tool-injected advertising';

test('tool branch names are not checked by default', () => {
    const repo = gibRepo({});
    gitIn(repo, ['switch', '-q', '-c', 'claude/fix-thing']);
    commitFiles(repo, { 'a.txt': 'a\n' });

    const result = lintRepo(repo);
    Assert.equal(result.status, 0, result.output);
});

test('a tool name for the checked out branch fails', () => {
    const repo = gibRepo({});
    gitIn(repo, ['switch', '-q', '-c', 'claude/fix-thing']);
    commitFiles(repo, { 'a.txt': 'a\n' });

    const result = lintRepo(repo, '', 'no-ads-in-branch-names: only-new\n');
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(`branch claude/fix-thing: error: ${BRANCH_AD_ERROR}`), result.output);
});

test('only-new branch checks skip other branches', () => {
    const repo = gibRepo({});
    commitFiles(repo, { 'a.txt': 'a\n' });
    gitIn(repo, ['branch', 'claude/fix-thing']);
    gitIn(repo, ['update-ref', 'refs/remotes/origin/codex/fix-thing', 'HEAD']);

    const result = lintRepo(repo, '', 'no-ads-in-branch-names: only-new\n');
    Assert.equal(result.status, 0, result.output);
});

test('no-ads-in-branch-names: true checks every branch', () => {
    const repo = gibRepo({});
    commitFiles(repo, { 'a.txt': 'a\n' });
    gitIn(repo, ['branch', 'claude/fix-thing']);
    gitIn(repo, ['update-ref', 'refs/remotes/origin/codex/fix-thing', 'HEAD']);

    const result = lintRepo(repo, '', 'no-ads-in-branch-names: true\n');
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(`branch claude/fix-thing: error: ${BRANCH_AD_ERROR}`), result.output);
    Assert.ok(result.output.includes(`branch codex/fix-thing: error: ${BRANCH_AD_ERROR}`), result.output);
});

test('a tool name for a pull request branch fails', () => {
    const repo = gibRepo({});
    const base = commitFiles(repo, { 'a.txt': 'a\n' });
    gitIn(repo, ['switch', '-q', '-c', 'pr']);
    const head = commitFiles(repo, { 'b.txt': 'b\n' });

    const result = lintEvent({
        repo,
        eventName: 'pull_request',
        event: {
            pull_request: {
                base: {
                    sha: base
                },
                head: {
                    sha: head,
                    ref: 'copilot/fix-thing'
                }
            }
        },
        rules: 'no-ads-in-branch-names: only-new\n'
    });
    Assert.equal(result.status, 1, result.output);
    Assert.ok(result.output.includes(`branch copilot/fix-thing: error: ${BRANCH_AD_ERROR}`), result.output);
});
