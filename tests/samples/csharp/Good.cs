class Loader {
    Task Load(Gate gate, bool ok, List<Item> items) {
        if (items == null) {
            return null;
        }

        Log("loading");
        if (gate != null) {
            return gate.Future;
        } else if (ok) {
            connected = true;
        }

        foreach (var item in items) {
            if (item.Skip) {
                continue;
            } else if (item.Last) {
                break;
            }
        }

        if (items.Count == 0) {
            Log("empty");
        }
        if (ok) {
            Log("ok");
        }
        else {
            Log("not ok");
        }
        return ok ? null : gate.Future;
    }

    string OnThisMachine(string[] windows, string prefix) {
        if (windows.Length < 3) {
            return null;
        }
        if (Drive(prefix) is not {} drive) {
            return null;
        }

        return Path.Combine([drive, prefix]);
    }
}
