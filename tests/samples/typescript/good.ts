export function parse<T>(input: string | null, fallback: T): T {
    if (input === null) {
        return fallback;
    }

    log('loading');
    if (input.length === 0) {
        throw new Error('empty');
    } else if (input.startsWith('#')) {
        input = input.slice(1);
    }

    if (input === 'x') {
        log('x');
    } else {
        log('other');
    }
    return JSON.parse(input) as T;
}
