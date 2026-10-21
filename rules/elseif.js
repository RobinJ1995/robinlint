module.exports = ({ astGrepFindings }) => astGrepFindings.filter(finding => finding.rule === 'elseif');
