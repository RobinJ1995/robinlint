fun load(gate: Gate?, ok: Boolean, items: List<Item>?): Future? {
    if (items == null) return null  // expect: braces

    log("loading")
    if (gate != null) {
        return gate.future
    }
    if (ok) {  // expect: elseif
        connected = true
    }

    for (item in items) {
        if (item.skip) {
            continue
        }
        // comment
        if (item.last) {  // expect: elseif
            break
        }
    }

    items.forEach {
        if (it.hidden) println(it)  // expect: braces
    }

    if (items.isEmpty()) {
        throw IllegalStateException("empty")
    }
    if (ok) {  // expect: elseif
        log("ok")
    } else log("not ok")  // expect: braces
    log("layout")
    if (ok) { log("crammed") }  // expect: braces-placement
    log("layout")
    if (ok)
    {  // expect: braces-placement
        log("allman")
    } else
    {  // expect: braces-placement
        log("allman")
    }
    if (ok) {
        return null
    } else {  // expect: no-else-after-exit
        log("not ok")
    }
    items.forEach { log(it) }  // expect: function-reference
    return null
}
