class Loader {
    Future<Void> load(Gate gate, boolean ok, List<Item> items) {
        if (items == null) {
            return null;
        }

        log("loading");
        if (gate != null) {
            return gate.future;
        } else if (ok) {
            connected = true;
        }

        for (Item item : items) {
            if (item.skip) {
                continue;
            } else if (item.last) {
                break;
            } else if (item.empty) {
                log("empty");
            }
        }

        if (items.isEmpty()) {
            log("empty");
        }
        if (ok) {
            log("ok");
        } else {
            log("not ok");
        }
        return ok ? null : gate.future;
    }
}
