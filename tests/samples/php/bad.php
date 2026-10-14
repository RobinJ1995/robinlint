<?php

function load($gate, $ok, $items)
{
    if ($items === null) return null;  // expect: braces

    log('loading');
    if ($gate !== null) {
        return $gate->future;
    }
    if ($ok) {  // expect: else-if
        $connected = true;
    }

    foreach ($items as $item) {
        if ($item->skip) {
            continue;
        }
        # comment
        if ($item->last) {  // expect: else-if
            break;
        }
    }

    if (count($items) === 0) {
        throw new RuntimeException('empty');
    } elseif (count($items) > 10) {
        return null;
    }
    if ($ok) {  // expect: else-if
        log('ok');
    } elseif ($gate) log('gate');  // expect: braces
    else log('not ok');  // expect: braces
    log('layout');
    if ($ok) { log('crammed'); }  // expect: brace-style
    log('layout');
    if ($ok)
    {  // expect: brace-style
        log('allman');
    } elseif ($gate)
    {  // expect: brace-style
        log('allman');
    }
    if ($ok) {
        return null;
    } else {  // expect: else-after-exit
        log('not ok');
    }
    return null;
}
