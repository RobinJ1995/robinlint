const { adsInText } = require('../ads');

module.exports = ({ pullRequest }) => {
    if (pullRequest === null) {
        return [];
    }

    const { title, body } = pullRequest.event.pull_request;

    return [
        ...adsInText('PR title', title),
        ...adsInText('PR description', body)
    ];
};
