import assert from 'node:assert/strict';
import test from 'node:test';

import { issueViewUrl } from '../../assets/board/urls.js';

test('builds local issue view URLs', () => {
    assert.equal(issueViewUrl('INV-2566'), '/browse/INV-2566');
    assert.equal(issueViewUrl(' APP-1 '), '/browse/APP-1');
    assert.equal(issueViewUrl(''), null);
});
