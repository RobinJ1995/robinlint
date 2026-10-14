def load(gate, ok, items):
    if gate is not None:
        return gate.future
    if ok:  # expect: else-if
        connected = True

    for item in items:
        if item.skip:
            continue
        # comment
        if item.last:  # expect: else-if
            break
        if item.empty:  # expect: else-if
            log("empty")

    if not items:
        raise ValueError("empty")
    elif len(items) > 10:
        return None
    if ok:  # expect: else-if
        log("ok")
    if ok:
        return items
    else:  # expect: else-after-exit
        log("not ok")
    return items
