export function parse<T>(input: string | null, fallback: T): T {
    if (input === null) return fallback;  // expect: braces

    log('loading');
    if (input.length === 0) {
        throw new Error('empty');
    }
    if (input.startsWith('#')) {  // expect: else-if
        input = input.slice(1);
    }

    if (input === 'x') {
        log('x');
    } else  // expect: braces
        log('other');
    log('layout');
    if (input) { log('crammed'); }  // expect: brace-style
    log('layout');
    if (input)
    {  // expect: brace-style
        log('allman');
    } else
    {  // expect: brace-style
        log('allman');
    }
    return JSON.parse(input) as T;
}
