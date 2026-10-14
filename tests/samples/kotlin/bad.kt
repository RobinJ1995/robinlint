fun load(gate: Gate?, ok: Boolean, items: List<Item>?): Future? {
    if (items == null) return null  // expect: braces

    log("loading")
    if (gate != null) {
        return gate.future
    }
    if (ok) {  // expect: else-if
        connected = true
    }

    for (item in items) {
        if (item.skip) {
            continue
        }
        // comment
        if (item.last) {  // expect: else-if
            break
        }
    }

    items.forEach {
        if (it.hidden) println(it)  // expect: braces
    }

    if (items.isEmpty()) {
        throw IllegalStateException("empty")
    }
    if (ok) {  // expect: else-if
        log("ok")
    } else log("not ok")  // expect: braces
    log("layout")
    if (ok) { log("crammed") }  // expect: brace-style
    log("layout")
    if (ok)
    {  // expect: brace-style
        log("allman")
    } else
    {  // expect: brace-style
        log("allman")
    }
    if (ok) {
        return null
    } else {  // expect: else-after-exit
        log("not ok")
    }
    return null
}
