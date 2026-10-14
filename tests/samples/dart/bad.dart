Future<void>? load(Gate? gate, bool ok, List<Item>? items) {
    if (items == null) return null;  // expect: braces

    log('loading');
    if (gate != null) {
        return gate.future;
    }
    if (ok) {  // expect: else-if
        connected = true;
    }

    for (final item in items) {
        if (item.skip) {
            continue;
        }
        /// comment
        if (item.last) {  // expect: else-if
            break;
        }
    }

    try {
        parse(items);
    } catch (e) {
        if (e is FormatException) {
            rethrow;
        }
        if (ok) {  // expect: else-if
            log('bad format');
        }
    }

    if (items.isEmpty) {
        throw StateError('empty');
    }
    if (ok) {  // expect: else-if, braces
        log('ok');
    } else log('not ok');
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
    if (ok) {
        return null;
    } else {  // expect: else-after-exit
        log('not ok');
    }
    return null;
}
