import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = {
    querySelector() {
        return {
            textContent: JSON.stringify({
                greeting: 'Bonjour {name}',
                count: '%count% tickets'
            })
        };
    }
};

const { trans } = await import('../../assets/board/i18n.js');

test('translates frontend messages and interpolates parameters', () => {
    assert.equal(trans('greeting', { name: 'Ada' }), 'Bonjour Ada');
    assert.equal(trans('count', { count: 3 }), '3 tickets');
    assert.equal(trans('missing.key'), 'missing.key');
});
