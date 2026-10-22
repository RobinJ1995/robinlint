function load(gate, ok, items) {
    if (!items) return [];  // expect: braces

    log('loading');
    if (gate != null) {
        return gate.future;
    }
    if (ok) {  // expect: elseif
        connected = true;
    }

    for (const item of items) {
        if (item.skip) {
            continue;
        }
        // comment
        if (item.last) {  // expect: elseif
            done = true;
        }
    }

    if (items.length > 10) {
        throw new Error('too many');
    } else if (items.length === 0) {
        return [];
    }
    if (ok) {  // expect: elseif
        log('ok');
    } else log('not ok');  // expect: braces
    log('layout');
    if (ok) { log('crammed'); }  // expect: braces-placement
    log('layout');
    if (ok)
    {  // expect: braces-placement
        log('allman');
    } else
    {  // expect: braces-placement
        log('allman');
    }
    if (ok) {
        return items;
    } else {  // expect: no-else-after-exit
        log('not ok');
    }
    items.forEach((item) => log(item.name));  // expect: no-single-parameter-brackets
    return items;
}
