const AD_ERROR = 'Commit messages and PR descriptions should not contain tool-injected advertising';

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

const isPRAd = text => PR_AD_RULES.some(rule => rule(text));

const adsInText = (rule, where, text) => {
    if (!isPRAd(text ?? '')) {
        return [];
    }

    return [{
        rule,
        file: null,
        line: null,
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
        ...adsInText('no-ads-in-prs', 'PR title', title),
        ...adsInText('no-ads-in-prs', 'PR description', body)
    ];
};

module.exports = { isPRAd, adsInPRBody };
