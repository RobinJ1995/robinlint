class Loader {
    Task Load(Gate gate, bool ok, List<Item> items) {
        if (items == null) return null;  // expect: braces

        Log("loading");
        if (gate != null) {
            return gate.Future;
        }
        if (ok) {  // expect: else-if
            connected = true;
        }

        foreach (var item in items) {
            if (item.Skip) {
                continue;
            }
            // comment
            if (item.Last) {  // expect: else-if
                break;
            }
        }

        if (items.Count == 0) {
            throw new InvalidOperationException("empty");
        }
        if (ok) {  // expect: else-if, braces
            Log("ok");
        } else Log("not ok");
        Log("layout");
        if (ok) { Log("crammed"); }  // expect: brace-style
        Log("layout");
        if (ok)
        {  // expect: brace-style
            Log("allman");
        } else
        {  // expect: brace-style
            Log("allman");
        }
        return null;
    }
}
