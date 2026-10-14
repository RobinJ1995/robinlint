<?php

function load($gate, $ok, $items)
{
    if ($items === null) {
        return null;
    }

    log('loading');
    if ($gate !== null) {
        return $gate->future;
    } elseif ($ok) {
        $connected = true;
    }

    foreach ($items as $item) {
        if ($item->skip) {
            continue;
        } else if ($item->last) {
            break;
        }
    }

    if ($ok):
        log('ok');
    elseif ($gate):
        log('gate');
    else:
        log('not ok');
    endif;
    return $ok ? null : $gate;
}
