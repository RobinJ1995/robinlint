export function Item({ item, onOpen }: Props) {
    if (!item) {
        return null;
    }

    log('loading');
    if (item.hidden) {
        return <Hidden />;
    } else if (item.open) {
        onOpen(item);
    }
    return <div>{item.open ? <Open /> : item.name}</div>;
}
