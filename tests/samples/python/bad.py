def load(gate, ok, items):
    if gate is not None:
        return gate.future
    if ok:  # expect: elseif
        connected = True

    for item in items:
        if item.skip:
            continue
        # comment
        if item.last:  # expect: elseif
            break
        if item.empty:  # expect: elseif
            log("empty")

    if not items:
        raise ValueError("empty")
    elif len(items) > 10:
        return None
    if ok:  # expect: elseif
        log("ok")
    if ok:
        return items
    else:  # expect: no-else-after-exit
        log("not ok")
    names = map(lambda item: str(item), items)  # expect: function-reference
    return items
