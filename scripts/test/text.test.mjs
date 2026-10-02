// keepTimes (src/lib/text.mjs): a time never breaks before its am/pm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepTimes, keepTimesDeep } from '../../src/lib/text.mjs';

const NBSP = ' ';

test('keepTimes joins a time and its am/pm with a no-break space', () => {
  assert.equal(keepTimes('during the 12:00 pm service'), `during the 12:00${NBSP}pm service`);
  assert.equal(keepTimes('Wednesdays, 7:00–8:45 pm'), `Wednesdays, 7:00–8:45${NBSP}pm`);
  assert.equal(keepTimes('10 AM and 6 pm'), `10${NBSP}AM and 6${NBSP}pm`);
});

test('keepTimes leaves other text, words starting with am/pm and non-strings alone', () => {
  assert.equal(keepTimes('Psalm 23 amen, 4 pmx'), 'Psalm 23 amen, 4 pmx');
  assert.equal(keepTimes('https://example.com/?t=12:00'), 'https://example.com/?t=12:00');
  assert.equal(keepTimes(null), null);
  assert.equal(keepTimes(5), 5);
});

test('keepTimesDeep copies nested YAML data', () => {
  const src = { a: ['at 9:30 am', { b: 'Sundays 12:00 pm' }], n: 1, t: true };
  const out = keepTimesDeep(src);
  assert.deepEqual(out, { a: [`at 9:30${NBSP}am`, { b: `Sundays 12:00${NBSP}pm` }], n: 1, t: true });
  assert.equal(src.a[0], 'at 9:30 am', 'the input is not changed');
});
