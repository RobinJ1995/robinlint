function load(gate, ok, items) {
    if (!items) {
        return [];
    }

    log('loading');
    if (gate != null) {
        return gate.future;
    } else if (ok) {
        connected = true;
    }

    for (const item of items) {
        if (item.skip) {
            continue;
        } else if (item.last) {
            done = true;
        }
    }

    if (items.length > 10) {
        log('many');
    }
    if (ok) {
        log('ok');
    } else {
        log('not ok');
    }
    return ok ? items : [];
}
