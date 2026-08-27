import assert from 'node:assert/strict';
import test from 'node:test';

import {
    activeSprintNames,
    adfMentions,
    adfToSegments,
    adfToText,
    canonicalEpicId,
    epicColor,
    epicLabel,
    isActiveIssue,
    issueBelongsToEpic
} from '../../assets/board/jira.js';

test('ADF helpers tolerate incomplete Jira documents', () => {
    assert.equal(adfToText(null), '');
    assert.deepEqual(adfToSegments({ type: 'unknown' }), []);
    assert.deepEqual(adfMentions({ content: [{ type: 'mention', attrs: { id: 7, text: '@Ana' } }] }), [
        { accountId: '7', text: '@Ana' }
    ]);
});

test('epic helpers have safe fallbacks for incomplete issues', () => {
    assert.equal(canonicalEpicId({ key: 'APP-10' }), 'APP-10');
    assert.equal(epicColor({ color: { key: 'color_1' } }), '#6757d8');
    assert.equal(epicColor({}), '#6757d8');
    assert.equal(epicLabel({}, 'Sans epic'), 'Sans epic');
    assert.equal(issueBelongsToEpic({ fields: {} }, '10'), false);
    assert.equal(issueBelongsToEpic({ fields: { epic: { id: 10 } } }, '10'), true);
});

test('issue state and sprint helpers support Jira legacy values', () => {
    assert.equal(isActiveIssue({}), true);
    assert.equal(isActiveIssue({ fields: { status: { statusCategory: { key: 'done' } } } }), false);
    assert.equal(activeSprintNames('[id=3,name=Sprint A,state=ACTIVE]'), 'Sprint A');
    assert.equal(activeSprintNames([{ name: 'Sprint B', state: 'active' }, { name: 'Sprint B', state: 'active' }]), 'Sprint B');
});
