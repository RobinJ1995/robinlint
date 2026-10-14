class Loader {
    Future<Void> load(Gate gate, boolean ok, List<Item> items) {
        if (items == null) return null;  // expect: braces

        log("loading");
        if (gate != null) {
            return gate.future;
        }
        if (ok) {  // expect: else-if
            connected = true;
        }

        for (Item item : items) {
            if (item.skip) {
                continue;
            }
            /* comment */
            if (item.last) {  // expect: else-if
                break;
            }
            if (item.empty) {  // expect: else-if
                log("empty");
            }
        }

        if (items.isEmpty()) {
            throw new IllegalStateException("empty");
        }
        if (ok) {  // expect: else-if, braces
            log("ok");
        } else log("not ok");
        log("layout");
        if (ok) { log("crammed"); }  // expect: brace-style
        log("layout");
        if (ok)
        {  // expect: brace-style
            log("allman");
        } else
        {  // expect: brace-style
            log("allman");
        }
        if (ok) {
            return null;
        } else {  // expect: else-after-exit
            log("not ok");
        }
        return null;
    }
}
