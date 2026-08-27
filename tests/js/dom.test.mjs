import assert from 'node:assert/strict';
import test from 'node:test';

import { avatarUrl } from '../../assets/board/dom.js';

test('selects the requested Jira avatar size', () => {
    assert.equal(avatarUrl({
        avatarUrls: {
            '24x24': 'avatar-24.png',
            '48x48': 'avatar-48.png'
        }
    }, 24), 'avatar-24.png');
});

test('selects the closest available Jira avatar size', () => {
    assert.equal(avatarUrl({
        avatarUrls: {
            '16x16': 'avatar-16.png',
            '48x48': 'avatar-48.png'
        }
    }, 32), 'avatar-48.png');
});

test('supports normalized users with one avatar URL', () => {
    assert.equal(avatarUrl({ avatarUrl: 'avatar.png' }, 24), 'avatar.png');
    assert.equal(avatarUrl({
        avatarUrl: 'avatar.png',
        avatarUrls: {}
    }, 24), 'avatar.png');
    assert.equal(avatarUrl(null, 24), null);
});
