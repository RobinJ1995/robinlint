module.exports = ({ astGrepFindings }) => astGrepFindings.filter(finding => finding.rule === 'no-else-after-exit');
