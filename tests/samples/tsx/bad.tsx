export function Item({ item, onOpen }: Props) {
    if (!item) return null;  // expect: braces

    log('loading');
    if (item.hidden) {
        return <Hidden />;
    }
    if (item.open) {  // expect: else-if
        onOpen(item);
    }
    log('layout');
    if (item.open) { log('crammed'); }  // expect: brace-style
    log('layout');
    if (item.open)
    {  // expect: brace-style
        log('allman');
    } else
    {  // expect: brace-style
        log('allman');
    }
    if (item.open) {
        return null;
    } else {  // expect: else-after-exit
        log('not ok');
    }
    return <div>{item.name}</div>;
}
