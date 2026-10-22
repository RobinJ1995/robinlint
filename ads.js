const AD_ERROR = 'Commit messages and PR descriptions should not contain tool-injected advertising';
const TOOL_AUTHOR_ERROR = 'The commit author indicates who is responsible for a given piece of code. Tools cannot be held accountable, so cannot be commit authors.';
const BRANCH_AD_ERROR = 'Branch names should not contain tool-injected advertising';
const COMMENT_AD_ERROR = 'PR comments should not contain tool-injected advertising';

const TOOL_CO_AUTHOR_EMAILS = [
    // Claude Code
    'noreply@anthropic.com',
    // Codex
    'noreply@openai.com',
    // Gemini
    'noreply@google.com',
    // Copilot CLI
    '223556219+copilot@users.noreply.github.com',
    // Copilot in VS Code
    'copilot@github.com',
    // Cursor
    'cursoragent@cursor.com',
    // Junie
    'junie@jetbrains.com',
    // Amp
    'amp@ampcode.com',
    // OpenCode
    'noreply@opencode.ai'
];
const CO_AUTHOR_REGEX = /^co-authored-by: .*<(?<email>[^>]+)>$/gim;

const TOOL_AUTHOR_EMAILS = [
    // Claude Code on the web
    'noreply@anthropic.com',
    // Claude GitHub app
    '209825114+claude[bot]@users.noreply.github.com',
    // Claude Code GitHub Action, by default; 41898282 is actually github-actions' id.
    '41898282+claude[bot]@users.noreply.github.com',
    // Copilot coding agent
    '198982749+copilot@users.noreply.github.com',
    // Cursor cloud agent
    'cursoragent@cursor.com',
    // Jules
    '161369871+google-labs-jules[bot]@users.noreply.github.com',
    // Amazon Q Developer
    '208079219+amazon-q-developer[bot]@users.noreply.github.com'
];

const PR_AD_RULES = [
    // Claude Code
    text => /^🤖 Generated with (\[Claude Code\]\(https:\/\/(claude\.com\/claude-code|claude\.ai\/code)\)|Claude Code)$/m.test(text),
    text => /^_?Generated (with|by) \[Claude Code\]\(https:\/\/claude\.ai\/code(\/session_\w+)?\)_?$/m.test(text),
    text => /^https:\/\/claude\.ai\/code\/session_\w+$/m.test(text),
    text => /^Claude-Session: https:\/\/claude\.ai\/code\/session_\w+$/m.test(text),
    // Codex
    text => /^https:\/\/chatgpt\.com\/codex\/(cloud\/)?tasks\/task_[a-z]_[0-9a-f]+$/m.test(text),
    text => /^\[Codex Task\]\(https:\/\/chatgpt\.com\/codex\/(cloud\/)?tasks\/task_[a-z]_[0-9a-f]+\)$/m.test(text),
    // Copilot coding agent
    text => /^<!-- START COPILOT (CODING AGENT TIPS|CODING AGENT SUFFIX|ORIGINAL PROMPT) -->$/m.test(text),
    // Cursor
    text => /^Made-with: Cursor$/m.test(text),
    text => /^Made with \[Cursor\]\(https:\/\/cursor\.com\)$/m.test(text),
    text => /^<!-- (CURSOR_AGENT_PR_BODY_BEGIN|CURSOR_SUMMARY) -->$/m.test(text),
    // Jules
    text => /^\*PR created automatically by Jules for task \[\d+\]\(https:\/\/jules\.google\.com\/task\/\d+\) started by @[\w-]+\*$/m.test(text),
    // Devin
    text => /^Link to Devin (session|run): https:\/\/app\.devin\.ai\/sessions\/[0-9a-f]+$/m.test(text),
    // Amp
    text => /^Amp-Thread-ID: https:\/\/ampcode\.com\/threads\/T-[0-9a-f-]+$/m.test(text),
    text => [...text.matchAll(CO_AUTHOR_REGEX)].some(({ groups }) => TOOL_CO_AUTHOR_EMAILS.includes(groups.email.toLowerCase()))
];

// No Claude-Session or Amp-Thread-ID; in a commit message those trailers are genuine metadata.
const COMMIT_AD_RULES = [
    // Claude Code
    text => /^🤖 Generated with (\[Claude Code\]\(https:\/\/(claude\.com\/claude-code|claude\.ai\/code)\)|Claude Code)$/m.test(text),
    text => /^https:\/\/claude\.ai\/code\/session_\w+$/m.test(text),
    // Cursor
    text => /^Made-with: Cursor$/m.test(text),
    text => [...text.matchAll(CO_AUTHOR_REGEX)].some(({ groups }) => TOOL_CO_AUTHOR_EMAILS.includes(groups.email.toLowerCase()))
];

const BRANCH_AD_RULES = [
    // Claude Code
    branch => branch.startsWith('claude/'),
    // Codex, sometimes behind a random prefix like d92ewq-codex/
    branch => /^([a-z0-9]{6}-)?codex\//.test(branch),
    // Copilot coding agent
    branch => branch.startsWith('copilot/'),
    // Cursor cloud agents
    branch => branch.startsWith('cursor/'),
    // Junie
    branch => branch.startsWith('junie/'),
    // Gemini CLI's issue fixer workflow
    branch => /^gemini-fix-\d+$/.test(branch)
];

const isPRAd = text => PR_AD_RULES.some(rule => rule(text));

const isCommitAd = text => COMMIT_AD_RULES.some(rule => rule(text));

const isToolAuthor = author => TOOL_AUTHOR_EMAILS.includes(author.email.toLowerCase());

const isToolBranch = branch => BRANCH_AD_RULES.some(rule => rule(branch));

const adsInText = (isAd, rule, where, text) => {
    if (!isAd(text ?? '')) {
        return [];
    }

    return [{
        rule,
        file: null,
        line: null,
        commit: null,
        branch: null,
        output: `${where}: error: ${AD_ERROR}`,
        isError: true
    }];
};

const adsInPRBody = pullRequest => {
    if (pullRequest === null) {
        return [];
    }

    const { title, body } = pullRequest.event.pull_request;

    return [
        ...adsInText(isPRAd, 'no-ads-in-prs', 'PR title', title),
        ...adsInText(isPRAd, 'no-ads-in-prs', 'PR description', body)
    ];
};

const adsInCommits = commits => commits.flatMap(commit =>
    adsInText(isCommitAd, 'no-ads-in-commits', `commit ${commit.sha.slice(0, 7)} message`, commit.message)
        .map(finding => ({
            ...finding,
            commit: commit.sha
        }))
);

const toolCommitAuthors = commits => commits
    .filter(commit => isToolAuthor(commit.author))
    .map(commit => ({
        rule: 'no-tools-as-commit-author',
        file: null,
        line: null,
        commit: commit.sha,
        branch: null,
        output: `commit ${commit.sha.slice(0, 7)} author: error: ${TOOL_AUTHOR_ERROR}`,
        isError: true
    }));

const adsInBranchNames = branches => branches
    .filter(isToolBranch)
    .map(branch => ({
        rule: 'no-ads-in-branch-names',
        file: null,
        line: null,
        commit: null,
        branch,
        output: `branch ${branch}: error: ${BRANCH_AD_ERROR}`,
        isError: true
    }));

// A bot's comment is the tool's own, not an ad injected into a person's.
const adsInPRComments = comments => comments
    .filter(comment => comment.user.type !== 'Bot')
    // A review left only as line comments has an empty body.
    .filter(comment => isPRAd(comment.body ?? ''))
    .map(comment => ({
        rule: 'no-ads-in-pr-comments',
        file: null,
        line: null,
        commit: null,
        branch: null,
        output: `${comment.html_url}: error: ${COMMENT_AD_ERROR}`,
        isError: true
    }));

module.exports = { isPRAd, isCommitAd, isToolAuthor, isToolBranch, adsInPRBody, adsInPRComments, adsInCommits, toolCommitAuthors, adsInBranchNames };
