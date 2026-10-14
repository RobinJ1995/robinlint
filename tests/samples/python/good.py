def load(gate, ok, items):
    if gate is not None:
        return gate.future
    elif ok:
        connected = True

    for item in items:
        if item.skip:
            continue
        elif item.last:
            break
        elif item.empty:
            log("empty")

    if not items:
        log("empty")
    if ok:
        log("ok")
    names = [item.name for item in items if item.visible]
    return names if ok else items
