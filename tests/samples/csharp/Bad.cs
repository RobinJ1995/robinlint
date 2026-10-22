class Loader {
    Task Load(Gate gate, bool ok, List<Item> items) {
        if (items == null) return null;  // expect: braces

        Log("loading");
        if (gate != null) {
            return gate.Future;
        }
        if (ok) {  // expect: elseif
            connected = true;
        }

        foreach (var item in items) {
            if (item.Skip) {
                continue;
            }
            // comment
            if (item.Last) {  // expect: elseif
                break;
            }
        }

        if (items.Count == 0) {
            throw new InvalidOperationException("empty");
        }
        if (ok) {  // expect: elseif, braces
            Log("ok");
        } else Log("not ok");
        Log("layout");
        if (ok) { Log("crammed"); }  // expect: braces-placement
        Log("layout");
        if (ok)
        {  // expect: braces-placement
            Log("allman");
        } else
        {  // expect: braces-placement
            Log("allman");
        }
        if (ok) {
            return null;
        } else {  // expect: no-else-after-exit
            Log("not ok");
        }
        items.ForEach(item => Log(item));  // expect: function-reference
        return null;
    }
}
