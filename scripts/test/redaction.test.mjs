// The sanitizer and the contact-info redaction (scripts/lib/html.mjs). Every row of the engineering
// review's probe (eng-review/probes/p4-sanitize.mjs) is an assertion here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHtml, redactContacts, hasContactInfo, REDACTED } from '../lib/html.mjs';

const text = (html) => cleanHtml(html).text;
const htmlOf = (html) => cleanHtml(html).html;

test('XSS attempts come out inert', () => {
  const attacks = [
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href="  javascript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<a href=\'https://ok.example/"onmouseover="alert(1)\'>x</a>',
    '<svg><script>alert(1)</script><a xlink:href="javascript:alert(1)">y</a></svg>after',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<p style="background:url(javascript:alert(1))">s</p>',
    '<!--<img src=x onerror=alert(1)>-->ok',
    '<![CDATA[<img src=x onerror=alert(1)>]]>ok',
    '&lt;img src=x onerror=alert(1)&gt; &amp;lt;b&amp;gt;',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
    '<A HREF="JAVASCRIPT:alert(1)">u</A><SCRIPT>alert(1)</SCRIPT>',
    '<a href="https://x.example/\n"><script>">n</a>',
    '<title><img src=x onerror=alert(1)></title><textarea><img src=x onerror=1></textarea>',
  ];
  for (const input of attacks) {
    const out = htmlOf(input);
    // Every tag is from the allowlist, and the only attribute is an http(s) href (escaped).
    for (const [tag] of out.matchAll(/<[^>]*>/g)) {
      assert.match(tag, /^<\/?(p|h3|ul|ol|li|strong|em|br)>$|^<a href="https?:\/\/[^"<>\s]+" rel="noopener nofollow">$|^<\/a>$/, `${input} -> ${out}`);
    }
  }
  // Typed text that looks like markup stays text.
  assert.equal(htmlOf('&lt;img src=x onerror=alert(1)&gt;'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});

test('phone numbers and emails are redacted, in every format the probe found leaking', () => {
  const leaks = [
    ['Call (425) 350-2792', 'Call ' + REDACTED],
    ['425.555.0100', REDACTED],
    ['+1 425 555 0100', REDACTED],
    ['Text Anna at 555-0100', 'Text Anna at ' + REDACTED], // 7-digit local
    ['Звоните +7 (925) 123-45-67', 'Звоните ' + REDACTED],
    ['+380 67 123 4567', REDACTED],
    ['+7 925 123 45 67', REDACTED],
    ['Звоните: 8 (925) 123-45-67', 'Звоните: ' + REDACTED],
    ['тел. 123-45-67', 'тел. ' + REDACTED],
    ['+1-425-555-0100 ext. 12', REDACTED + ' ext. 12'],
    ['1-800-555-0199', REDACTED],
    ['(425)555-0100', REDACTED],
    ['Call 4255550100', 'Call ' + REDACTED],
    ['Text JOIN to 555 0100', 'Text JOIN to ' + REDACTED],
    ['Viber +380671234567', 'Viber ' + REDACTED],
    ['Email a.b@example.org.', 'Email ' + REDACTED + '.'],
    ['name [at] gmail [dot] com', REDACTED],
  ];
  for (const [input, expected] of leaks) assert.equal(text(`<p>${input}</p>`), expected, input);
});

test('a number split across tags is caught on the joined text', () => {
  assert.equal(htmlOf('<p>Call <b>(425)</b> 555-0100</p>'), `<p>Call ${REDACTED}</p>`);
  assert.equal(htmlOf('<p>Call <b>425</b>-<i>555</i>-0100 today</p>'), `<p>Call ${REDACTED} today</p>`);
  assert.equal(htmlOf('<p>Call <b>425</b><i>555</i>0100</p>'), `<p>Call ${REDACTED}</p>`);
  // Formatting elsewhere survives when nothing is split.
  assert.equal(htmlOf('<p><b>Hi</b> call 425-555-0100</p>'), `<p><strong>Hi</strong> call ${REDACTED}</p>`);
});

test('things that only look like numbers are left alone (no false positives)', () => {
  for (const s of [
    'Zoom ID 812 3456 7890', 'Meeting ID: 845 1234 5678', 'Passcode 2026101234', 'Order #1234567890', 'ISBN 978-0310337508',
    'Romans 10:17 and 1 Corinthians 13:4-7', 'Romans 3:23-24', 'Psalm 23', 'Ages 3-12, 2026-2027 season', 'Ages 3–12',
    'Doors open 6:00-9:00 pm', 'June 5-7, 2026', 'Event on 2026-10-03', 'Room 101-B', 'Grades K-12', 'Prices $350-$450', '$1,200.00',
    'Follow @springoflife.youth on Instagram', 'Telegram @springoflife', 'call 12345678901234567',
  ]) {
    assert.equal(text(`<p>${s}</p>`), s, s);
    assert.equal(hasContactInfo(s), false, s);
  }
});

test('links: tel:, mailto:, WhatsApp/Viber and links carrying a phone or email are dropped, text kept', () => {
  assert.equal(htmlOf('<a href="tel:+14255550100">Call Anna</a>'), '<p>Call Anna</p>');
  assert.equal(htmlOf('<a href="mailto:anna@example.org">Email Anna</a>'), '<p>Email Anna</p>');
  assert.equal(htmlOf('<a href="https://wa.me/14255550100">WhatsApp me</a>'), '<p>WhatsApp me</p>');
  assert.equal(htmlOf('<a href="https://api.whatsapp.com/send?phone=14255550100">WhatsApp</a>'), '<p>WhatsApp</p>');
  assert.equal(htmlOf('<a href="https://example.org/contact?email=anna@example.org">form</a>'), '<p>form</p>');
  assert.equal(htmlOf('<a href="https://example.org/?phone=425-555-0100">x</a>'), '<p>x</p>');
  assert.equal(htmlOf('<a href="https://example.org/a?x=%2B1%20425%20555%200100">enc</a>'), '<p>enc</p>');
  assert.equal(htmlOf('<a href="https://zoom.us/j/84512345678?pwd=abc">Zoom</a>'), '<p>Zoom</p>');
  // Ordinary links stay.
  assert.equal(htmlOf('<a href="https://app.sli.do/event/tz2WwnXw4yCrHThnFst2tT">Poll</a>'), '<p><a href="https://app.sli.do/event/tz2WwnXw4yCrHThnFst2tT" rel="noopener nofollow">Poll</a></p>');
  assert.equal(htmlOf('<a href="https://www.facebook.com/events/1234567890123456/">FB</a>'), '<p><a href="https://www.facebook.com/events/1234567890123456/" rel="noopener nofollow">FB</a></p>');
});

test('mis-nested inline tags and nested lists still produce balanced, allowlisted HTML', () => {
  assert.equal(htmlOf('<p><b>bold <i>both</b> italic</i> plain</p>'), '<p><strong>bold <em>both</em></strong> italic plain</p>');
  const nested = htmlOf('<ul><li>One<ul><li>Inner</li></ul></li><li>Two</li></ul>');
  assert.equal(nested, '<ul><li>One<br>Inner</li><li>Two</li></ul>');
  for (const out of [nested, htmlOf('<ol><li><b>A<li>B</b></ol>')]) {
    const tags = [...out.matchAll(/<\/?(\w+)/g)].map((m) => m[1]);
    assert.ok(tags.every((t) => ['p', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br'].includes(t)), out);
    assert.equal((out.match(/<(strong|em|li|ul|ol|p)>/g) ?? []).length, (out.match(/<\/(strong|em|li|ul|ol|p)>/g) ?? []).length, out);
  }
});

test('redactContacts works on plain strings too (titles, place names)', () => {
  assert.equal(redactContacts("Anna's house, 425-555-0100"), `Anna's house, ${REDACTED}`);
  assert.equal(redactContacts('Spring of Life Church'), 'Spring of Life Church');
});
