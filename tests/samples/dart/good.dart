Future<void>? load(Gate? gate, bool ok, List<Item>? items) {
    if (items == null) {
        return null;
    }

    log('loading');
    if (gate != null) {
        return gate.future;
    } else if (ok) {
        connected = true;
    }

    for (final item in items) {
        if (item.skip) {
            continue;
        } else if (item.last) {
            break;
        }
    }

    try {
        parse(items);
    } catch (e) {
        if (e is FormatException) {
            rethrow;
        } else if (ok) {
            log('bad format');
        }
    }

    final labels = [
        for (final item in items)
            if (item.visible) item.label else '-',
        if (ok) 'ok',
    ];
    if (ok) {
        log('ok');
    } else {
        log('not ok $labels');
    }
    return ok ? null : gate?.future;
}
