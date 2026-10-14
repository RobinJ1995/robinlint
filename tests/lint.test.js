const { test } = require('node:test');
const Assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');

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

const lintRepo = (repo, exclude = '') => {
    const proc = spawnSync(
        'node',
        [LINT_SCRIPT_PATH],
        {
            cwd: repo,
            encoding: 'utf8', 
            env: {
                ...process.env,
                EXCLUDE: exclude
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

test('files in default-excludes are not checked', () => {
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
