const PAGE_SIZE = 100;

// Every page of a GitHub API list.
const githubList = async (path, page = 1) => {
    const response = await fetch(
        `${process.env.GITHUB_API_URL}${path}?per_page=${PAGE_SIZE}&page=${page}`,
        {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(`GET ${path} failed with status ${response.status}: ${await response.text()}`);
    }

    const items = await response.json();
    if (items.length < PAGE_SIZE) {
        return items;
    }

    return [...items, ...await githubList(path, page + 1)];
};

module.exports = { githubList };
