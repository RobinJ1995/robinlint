<?php

function load($gate, $ok, $items)
{
    if ($items === null) return null;  // expect: braces

    log('loading');
    if ($gate !== null) {
        return $gate->future;
    }
    if ($ok) {  // expect: elseif
        $connected = true;
    }

    foreach ($items as $item) {
        if ($item->skip) {
            continue;
        }
        # comment
        if ($item->last) {  // expect: elseif
            break;
        }
    }

    if (count($items) === 0) {
        throw new RuntimeException('empty');
    } elseif (count($items) > 10) {
        return null;
    }
    if ($ok) {  // expect: elseif
        log('ok');
    } elseif ($gate) log('gate');  // expect: braces
    else log('not ok');  // expect: braces
    log('layout');
    if ($ok) { log('crammed'); }  // expect: braces-placement
    log('layout');
    if ($ok)
    {  // expect: braces-placement
        log('allman');
    } elseif ($gate)
    {  // expect: braces-placement
        log('allman');
    }
    if ($ok) {
        return null;
    } else {  // expect: no-else-after-exit
        log('not ok');
    }
    array_map(fn($item) => log($item), $items);  // expect: function-reference
    return null;
}
