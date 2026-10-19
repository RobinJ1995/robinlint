export function parse<T>(input: string | null, fallback: T): T {
    if (input === null) return fallback;  // expect: braces

    log('loading');
    if (input.length === 0) {
        throw new Error('empty');
    }
    if (input.startsWith('#')) {  // expect: elseif
        input = input.slice(1);
    }

    if (input === 'x') {
        log('x');
    } else  // expect: braces
        log('other');
    log('layout');
    if (input) { log('crammed'); }  // expect: braces-placement
    log('layout');
    if (input)
    {  // expect: braces-placement
        log('allman');
    } else
    {  // expect: braces-placement
        log('allman');
    }
    if (input) {
        return fallback;
    } else {  // expect: no-else-after-exit
        log('not ok');
    }
    [input].map(text => parse(text));  // expect: function-reference
    return JSON.parse(input) as T;
}
