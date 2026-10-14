fun load(gate: Gate?, ok: Boolean, items: List<Item>?): Future? {
    if (items == null) {
        return null
    }

    log("loading")
    if (gate != null) {
        return gate.future
    } else if (ok) {
        connected = true
    }

    for (item in items) {
        if (item.skip) {
            continue
        } else if (item.last) {
            break
        }
    }

    val labels = items.map { if (it.visible) it.label else "-" }
    val count = if (ok) labels.size else 0
    log(if (ok) "ok" else "not ok")
    if (ok) {
        log("ok $count")
    } else {
        log("not ok")
    }
    return if (ok) null else gate?.future
}

fun label(ok: Boolean) = if (ok) "ok" else "not ok"
