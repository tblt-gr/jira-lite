import assert from 'node:assert/strict';
import test from 'node:test';

import {
    collectEpicGroups,
    createEpicJump,
    epicTitleStartsWith,
    findFirstEpicGroup,
    isEditableTarget,
    isJumpLetter,
    isOpenDialog,
    isOpenFilter,
    scrollBoardToEpic,
    shouldHandleEpicJumpKey
} from '../../assets/board/epic-jump.js';

test('matches epic titles from the first letter, ignoring case and accents', () => {
    assert.equal(epicTitleStartsWith('Infrastructure', 'i'), true);
    assert.equal(epicTitleStartsWith('infrastructure', 'I'), true);
    assert.equal(epicTitleStartsWith('Épic paiement', 'e'), true);
    assert.equal(epicTitleStartsWith('  Invoice flow', 'i'), true);
    assert.equal(epicTitleStartsWith('Board UI', 'b'), true);
    assert.equal(epicTitleStartsWith('Board UI', 'u'), false);
    assert.equal(epicTitleStartsWith('', 'i'), false);
    assert.equal(epicTitleStartsWith('Infrastructure', ''), false);
});

test('returns the first epic group whose title starts with the typed letter', () => {
    const groups = [
        { title: 'Checkout', element: 'checkout' },
        { title: 'Infrastructure', element: 'infra' },
        { title: 'Invoices', element: 'invoices' }
    ];

    assert.equal(findFirstEpicGroup(groups, 'i').element, 'infra');
    assert.equal(findFirstEpicGroup(groups, 'c').element, 'checkout');
    assert.equal(findFirstEpicGroup(groups, 'z'), null);
    assert.equal(findFirstEpicGroup([], 'i'), null);
});

test('treats only a single letter as a jump key', () => {
    assert.equal(isJumpLetter('i'), true);
    assert.equal(isJumpLetter('É'), true);
    assert.equal(isJumpLetter('1'), false);
    assert.equal(isJumpLetter('Enter'), false);
    assert.equal(isJumpLetter(' '), false);
    assert.equal(isJumpLetter('Tab'), false);
    assert.equal(isJumpLetter('Dead'), false);
});

function keyEvent(overrides = {}) {
    return {
        key: 'i',
        defaultPrevented: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        repeat: false,
        target: { closest: () => null },
        ...overrides
    };
}

test('handles a letter only on the idle epic board', () => {
    assert.equal(shouldHandleEpicJumpKey(keyEvent(), { view: 'epic' }), true);
    assert.equal(shouldHandleEpicJumpKey(keyEvent(), { view: 'board' }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent({ defaultPrevented: true }), {
        view: 'epic'
    }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent({ ctrlKey: true }), {
        view: 'epic'
    }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent({ metaKey: true }), {
        view: 'epic'
    }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent({ altKey: true }), {
        view: 'epic'
    }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent({ repeat: true }), {
        view: 'epic'
    }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent({ key: 'Enter' }), {
        view: 'epic'
    }), false);
});

test('ignores typing in search, tickets, filters and open dialogs', () => {
    const idle = { view: 'epic' };

    assert.equal(shouldHandleEpicJumpKey(keyEvent({
        target: { closest: selector => selector.includes('input') ? {} : null }
    }), idle), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent({
        target: { closest: selector => selector.includes('.card') ? {} : null }
    }), idle), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent({
        target: {
            closest: selector => selector.includes('#epic-filter') ? {} : null
        }
    }), idle), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent(), {
        ...idle,
        isIssueOpen: true
    }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent(), {
        ...idle,
        isCreateOpen: true
    }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent(), {
        ...idle,
        isImageViewerOpen: true
    }), false);
    assert.equal(shouldHandleEpicJumpKey(keyEvent(), {
        ...idle,
        isFilterOpen: true
    }), false);
});

test('detects editable targets, open dialogs and open filter menus', () => {
    assert.equal(isEditableTarget({
        closest: selector => selector.includes('textarea') ? {} : null
    }), true);
    assert.equal(isEditableTarget({ closest: () => null }), false);
    assert.equal(isOpenDialog({
        querySelector: selector => selector === '#issue-dialog' ? { open: true } : null
    }, '#issue-dialog'), true);
    assert.equal(isOpenDialog({
        querySelector: () => ({ open: false })
    }, '#issue-dialog'), false);
    assert.equal(isOpenFilter({
        querySelectorAll: () => [{ hidden: true }, { hidden: false }]
    }), true);
    assert.equal(isOpenFilter({
        querySelectorAll: () => [{ hidden: true }]
    }), false);
});

test('collects visible epic groups from the board DOM', () => {
    const groups = collectEpicGroups({
        querySelectorAll: () => [
            {
                querySelector: () => ({ textContent: ' Infrastructure ' })
            },
            {
                querySelector: () => ({ textContent: 'Checkout' })
            }
        ]
    });

    assert.deepEqual(groups.map(group => group.title), [
        ' Infrastructure ',
        'Checkout'
    ]);
});

test('scrolls the board so the matched epic sits at the top', () => {
    const scrolled = [];
    const board = {
        scrollTop: 80,
        scrollLeft: 40,
        getBoundingClientRect: () => ({ top: 100 }),
        scrollTo: options => scrolled.push(options)
    };
    const group = {
        getBoundingClientRect: () => ({ top: 420 })
    };

    scrollBoardToEpic(board, group);

    assert.deepEqual(scrolled, [{
        top: 400,
        left: 40,
        behavior: 'smooth'
    }]);
});

test('jumps to the first matching epic on a letter key', () => {
    const scrolled = [];
    const infra = {
        querySelector: () => ({ textContent: 'Infrastructure' }),
        getBoundingClientRect: () => ({ top: 300 })
    };
    const invoices = {
        querySelector: () => ({ textContent: 'Invoices' }),
        getBoundingClientRect: () => ({ top: 900 })
    };
    const board = {
        scrollTop: 0,
        scrollLeft: 0,
        querySelectorAll: () => [infra, invoices],
        getBoundingClientRect: () => ({ top: 80 }),
        scrollTo: options => scrolled.push({ target: options.top === 220 ? infra : invoices, options })
    };
    const listeners = [];
    let prevented = false;

    createEpicJump({
        board,
        root: {
            querySelector: () => ({ open: false }),
            querySelectorAll: () => [{ hidden: true }]
        },
        state: { view: 'epic' },
        listenOn: {
            addEventListener: (type, handler) => listeners.push({ type, handler })
        }
    });

    assert.equal(listeners.length, 1);
    listeners[0].handler({
        key: 'i',
        defaultPrevented: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        repeat: false,
        target: { closest: () => null },
        preventDefault: () => {
            prevented = true;
        }
    });

    assert.equal(prevented, true);
    assert.equal(scrolled.length, 1);
    assert.equal(scrolled[0].target, infra);
});
