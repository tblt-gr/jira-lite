import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdfRenderTree, adfToEditableText, hasRichTextContent } from '../../assets/board/dialog/rich-text.js';

test('buildAdfRenderTree preserves paragraphs and line breaks from plain text', () => {
    assert.deepEqual(buildAdfRenderTree('Première ligne\nDeuxième ligne'), [
        { tag: 'p', children: [{ type: 'text', value: 'Première ligne' }] },
        { tag: 'p', children: [{ type: 'text', value: 'Deuxième ligne' }] }
    ]);
});

test('buildAdfRenderTree renders bullet and ordered lists', () => {
    const tree = buildAdfRenderTree({
        type: 'doc',
        content: [
            {
                type: 'bulletList',
                content: [
                    {
                        type: 'listItem',
                        content: [{
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Premier point' }]
                        }]
                    },
                    {
                        type: 'listItem',
                        content: [{
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Second point' }]
                        }]
                    }
                ]
            },
            {
                type: 'orderedList',
                content: [{
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Étape 1' }]
                    }]
                }]
            }
        ]
    });

    assert.equal(tree[0].tag, 'ul');
    assert.equal(tree[0].children[0].tag, 'li');
    assert.equal(tree[0].children[0].children[0].tag, 'p');
    assert.equal(tree[0].children[0].children[0].children[0].value, 'Premier point');
    assert.equal(tree[1].tag, 'ol');
});

test('buildAdfRenderTree keeps inline marks and mentions', () => {
    const tree = buildAdfRenderTree({
        type: 'doc',
        content: [{
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Texte ', marks: [{ type: 'strong' }] },
                { type: 'mention', attrs: { id: 'abc', text: '@Ana' } },
                { type: 'text', text: ' lien', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }
            ]
        }]
    });

    assert.equal(tree[0].children[0].tag, 'strong');
    assert.equal(tree[0].children[1].tag, 'span');
    assert.equal(tree[0].children[1].className, 'comment-mention');
    assert.equal(tree[0].children[2].tag, 'a');
    assert.equal(tree[0].children[2].attrs.href, 'https://example.com');
});

test('adfToEditableText matches rendered ADF structure', () => {
    const document = {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Ligne 1' },
                    { type: 'hardBreak' },
                    { type: 'text', text: 'Ligne 2' }
                ]
            },
            {
                type: 'bulletList',
                content: [{
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Point A' }]
                    }]
                }]
            },
            {
                type: 'paragraph',
                content: [{ type: 'emoji', attrs: { text: '🙂' } }]
            }
        ]
    };

    assert.equal(
        adfToEditableText(document),
        'Ligne 1\nLigne 2\n- Point A\n🙂'
    );
});

test('hasRichTextContent detects non-text ADF blocks', () => {
    assert.equal(hasRichTextContent({ type: 'doc', content: [{ type: 'rule' }] }), true);
    assert.equal(hasRichTextContent({ type: 'doc', content: [{ type: 'paragraph', content: [] }] }), false);
});
