// [Placeholder] text never reaches a normal build (src/lib/placeholders.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholder, stripPlaceholders, hidePlaceholders, remarkPlaceholders, showPlaceholders } from '../../src/lib/placeholders.mjs';

test('placeholder strings are recognised and cut', () => {
  assert.equal(isPlaceholder('[Placeholder: rehearsal day and time]'), true);
  assert.equal(isPlaceholder('Fridays, 5:30–7:00 pm'), false);
  assert.equal(stripPlaceholders('[Placeholder: grades]'), null);
  assert.equal(stripPlaceholders('Drop a check off at the mailbox. [Placeholder: confirm mailing.]'), 'Drop a check off at the mailbox.');
  assert.equal(stripPlaceholders('Plain text (no brackets)'), 'Plain text (no brackets)');
  assert.equal(stripPlaceholders(''), '', 'an empty CMS field is not a placeholder');
  assert.equal(showPlaceholders({ SHOW_PLACEHOLDERS: 'true' }), true);
  assert.equal(showPlaceholders({}), false);
});

test('YAML: placeholder list items and whole cards are left out, real text stays', () => {
  const data = {
    ministries: [
      { id: 'awana', summary: 'A club for kids.', details: ['Wednesdays', '[Placeholder: cost]'], link: '' },
      { id: 'youth', summary: '[Placeholder: a short description]', details: ['[Placeholder: day]'] },
      { id: 'missions', summary: 'We support missionaries. [Placeholder: add the trips]' },
    ],
    title: 'Ministries',
  };
  assert.deepEqual(hidePlaceholders(data), {
    ministries: [
      { id: 'awana', summary: 'A club for kids.', details: ['Wednesdays'], link: '' },
      { id: 'missions', summary: 'We support missionaries.' },
    ],
    title: 'Ministries',
  });
  assert.deepEqual(hidePlaceholders({ tagline: '[Placeholder]' }), {}, 'a required field disappears, so the schema reports it');
});

const md = (...children) => ({ type: 'root', children });
const p = (...children) => ({ type: 'paragraph', children });
const t = (value) => ({ type: 'text', value });
const h = (depth, value) => ({ type: 'heading', depth, children: [t(value)] });

test('Markdown: placeholder paragraphs, list items and emptied headings are removed', () => {
  const tree = md(
    h(2, 'Our story'),
    p(t('[Placeholder: the story of the church]')),
    h(2, 'Kids'),
    p(t('Kids are welcome. [Placeholder: check-in details.]')),
    { type: 'list', children: [{ type: 'listItem', children: [p(t('[Placeholder: ages]'))] }, { type: 'listItem', children: [p(t('Childcare for all ages'))] }] },
    h(2, 'Russian service'),
    p({ type: 'link', url: 'https://example.org', children: [t('Russian website')] }, t(' for details.')),
  );
  remarkPlaceholders()(tree);
  assert.deepEqual(tree.children.map((n) => n.type === 'heading' ? `h:${n.children[0].value}` : n.type), ['h:Kids', 'paragraph', 'list', 'h:Russian service', 'paragraph']);
  assert.equal(tree.children[1].children[0].value.trim(), 'Kids are welcome.');
  assert.equal(tree.children[2].children.length, 1, 'only the real list item is left');
  assert.equal(tree.children[4].children[0].type, 'link', 'a Markdown link is not a placeholder');
});

test('Markdown draft build keeps placeholders and marks them "needs-text"', () => {
  const tree = md(h(2, 'Our story'), p(t('[Placeholder: the story]')));
  remarkPlaceholders({ show: true })(tree);
  assert.equal(tree.children.length, 2);
  assert.deepEqual(tree.children[1].data.hProperties.className, ['needs-text']);
});
