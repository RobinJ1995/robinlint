function load(gate, ok, items) {
    if (!items) return [];  // expect: braces

    log('loading');
    if (gate != null) {
        return gate.future;
    }
    if (ok) {  // expect: else-if
        connected = true;
    }

    for (const item of items) {
        if (item.skip) {
            continue;
        }
        // comment
        if (item.last) {  // expect: else-if
            done = true;
        }
    }

    if (items.length > 10) {
        throw new Error('too many');
    } else if (items.length === 0) {
        return [];
    }
    if (ok) {  // expect: else-if
        log('ok');
    } else log('not ok');  // expect: braces
    log('layout');
    if (ok) { log('crammed'); }  // expect: brace-style
    log('layout');
    if (ok)
    {  // expect: brace-style
        log('allman');
    } else
    {  // expect: brace-style
        log('allman');
    }
    return items;
}
