const github = async path => {
    const response = await fetch(
        `${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`,
        {
            headers: {
                Accept: 'application/vnd.github+json',
                ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
            }
        }
    );

    if (!response.ok) {
        throw new Error(`GET ${path} failed with status ${response.status}: ${await response.text()}`);
    }

    return response.json();
};

module.exports = { github };
