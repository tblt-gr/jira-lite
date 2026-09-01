import assert from 'node:assert/strict';
import test from 'node:test';

import { issueViewUrl } from '../../assets/board/urls.js';

test('builds local issue view URLs', () => {
    assert.equal(issueViewUrl('INV-2566'), '/browse/INV-2566');
    assert.equal(issueViewUrl('INV-2566', 42), '/browse/INV-2566?board=42');
    assert.equal(issueViewUrl(' APP-1 '), '/browse/APP-1');
    assert.equal(issueViewUrl('APP-1', 'invalid'), '/browse/APP-1');
    assert.equal(issueViewUrl(''), null);
});
