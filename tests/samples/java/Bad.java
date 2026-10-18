class Loader {
    Future<Void> load(Gate gate, boolean ok, List<Item> items) {
        if (items == null) return null;  // expect: braces

        log("loading");
        if (gate != null) {
            return gate.future;
        }
        if (ok) {  // expect: elseif
            connected = true;
        }

        for (Item item : items) {
            if (item.skip) {
                continue;
            }
            /* comment */
            if (item.last) {  // expect: elseif
                break;
            }
            if (item.empty) {  // expect: elseif
                log("empty");
            }
        }

        if (items.isEmpty()) {
            throw new IllegalStateException("empty");
        }
        if (ok) {  // expect: elseif, braces
            log("ok");
        } else log("not ok");
        log("layout");
        if (ok) { log("crammed"); }  // expect: braces-placement
        log("layout");
        if (ok)
        {  // expect: braces-placement
            log("allman");
        } else
        {  // expect: braces-placement
            log("allman");
        }
        if (ok) {
            return null;
        } else {  // expect: no-else-after-exit
            log("not ok");
        }
        return null;
    }
}
