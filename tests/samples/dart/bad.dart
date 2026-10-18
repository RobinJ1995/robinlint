Future<void>? load(Gate? gate, bool ok, List<Item>? items) {
    if (items == null) return null;  // expect: braces

    log('loading');
    if (gate != null) {
        return gate.future;
    }
    if (ok) {  // expect: elseif
        connected = true;
    }

    for (final item in items) {
        if (item.skip) {
            continue;
        }
        /// comment
        if (item.last) {  // expect: elseif
            break;
        }
    }

    try {
        parse(items);
    } catch (e) {
        if (e is FormatException) {
            rethrow;
        }
        if (ok) {  // expect: elseif
            log('bad format');
        }
    }

    if (items.isEmpty) {
        throw StateError('empty');
    }
    if (ok) {  // expect: elseif, braces
        log('ok');
    } else log('not ok');
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
        return null;
    } else {  // expect: no-else-after-exit
        log('not ok');
    }
    return null;
}
