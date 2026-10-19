export function Item({ item, onOpen }: Props) {
    if (!item) return null;  // expect: braces

    log('loading');
    if (item.hidden) {
        return <Hidden />;
    }
    if (item.open) {  // expect: elseif
        onOpen(item);
    }
    log('layout');
    if (item.open) { log('crammed'); }  // expect: braces-placement
    log('layout');
    if (item.open)
    {  // expect: braces-placement
        log('allman');
    } else
    {  // expect: braces-placement
        log('allman');
    }
    if (item.open) {
        return null;
    } else {  // expect: no-else-after-exit
        log('not ok');
    }
    [item].map(entry => render(entry));  // expect: function-reference
    return <div>{item.name}</div>;
}
