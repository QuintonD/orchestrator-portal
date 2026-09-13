import test from 'node:test';
import assert from 'node:assert/strict';
import { statfs } from 'node:fs/promises';
import { hostStorageFacts, guestStorageFacts } from './android-emulator-storage.mjs';

const header = 'Filesystem     1K-blocks    Used Available Use% Mounted on';
const report = `${header}\n/dev/block/dm-46 1048576 262144 655360 29% /data\n`;

test('host statfs number and bigint fields produce only exact bounded byte counts', () => {
  const expected = { totalBytes: 40960000, availableBytes: 8192000 };
  for (const stats of [{ bsize: 4096, blocks: 10000, bavail: 2000 }, { bsize: 4096n, blocks: 10000n, bavail: 2000n }, { bsize: 4096n, blocks: 10000, bavail: 2000n }]) {
    assert.deepEqual(hostStorageFacts(stats), expected);
    assert.deepEqual(Object.keys(hostStorageFacts(stats)), ['totalBytes', 'availableBytes']);
  }
  assert.deepEqual(hostStorageFacts({ bsize: 1n, blocks: BigInt(Number.MAX_SAFE_INTEGER), bavail: 0n }), { totalBytes: Number.MAX_SAFE_INTEGER, availableBytes: 0 });
});

test('host invalid, imprecise, overflowing or inconsistent counts remain unavailable', () => {
  for (const invalid of [null, undefined, 1, 'private/path', [], {}, { bsize: 0, blocks: 1, bavail: 1 }, { bsize: 4096, blocks: 0, bavail: 0 }, { bsize: 1, blocks: 4, bavail: 5 }, { bsize: 4096n, blocks: BigInt(Number.MAX_SAFE_INTEGER), bavail: 1n }]) assert.equal(hostStorageFacts(invalid), null);
  for (const field of ['bsize', 'blocks', 'bavail']) {
    for (const value of [-1, -1n, 0.5, NaN, Infinity, '4096', true, null, undefined, Number.MAX_SAFE_INTEGER + 1, BigInt(Number.MAX_SAFE_INTEGER) + 1n]) {
      assert.equal(hostStorageFacts({ bsize: 4096, blocks: 10000, bavail: 2000, [field]: value }), null);
    }
  }
  assert.equal(hostStorageFacts({ get bsize() { throw new Error('private storage path'); } }), null);
});

test('host helper accepts actual Node statfs in both supported numeric modes', async () => {
  for (const bigint of [false, true]) {
    const stats = await statfs(new URL('.', import.meta.url), { bigint }); const facts = hostStorageFacts(stats);
    assert.ok(facts && Number.isSafeInteger(facts.totalBytes) && Number.isSafeInteger(facts.availableBytes));
    assert.ok(facts.availableBytes >= 0 && facts.availableBytes <= facts.totalBytes);
  }
});

test('guest report returns byte facts, including full disks, and accepts adb line endings', () => {
  const expected = { totalBytes: 1073741824, availableBytes: 671088640 };
  for (const value of [report, report.trimEnd(), report.replaceAll('\n', '\r\n'), report.replaceAll('\n', '\r\r\n'), report.replaceAll(' ', '\t')]) assert.deepEqual(guestStorageFacts(value), expected);
  assert.deepEqual(guestStorageFacts(`${header}\n/dev/block/vdc 1024 1024 0 100% /data\n`), { totalBytes: 1048576, availableBytes: 0 });
});

test('guest report rejects missing, ambiguous, wrapped, injected or wrong-mount output', () => {
  const privateText = 'synthetic-private-path-or-message';
  for (const value of [null, {}, '', 'x'.repeat(4097), report + report, '\n' + report, report + '\n', report.replace('\n', '\n\n'), report + privateText,
    report.replace('1K-blocks', '1024-blocks'), report.replace('Mounted on', 'Mounted'), report.replace('/data\n', '/data/private\n'), report.replace('/data\n', '/data ' + privateText + '\n'),
    report.replace('/dev/block/dm-46', privateText), report.replace('/dev/block/dm-46 ', '/dev/block/dm-46\n'), report.replace('1048576', '1048576\r'), report.replace('1048576', '1048576\u0000')]) {
    assert.equal(guestStorageFacts(value), null);
  }
  const facts = guestStorageFacts(report.replace('/dev/block/dm-46', '/dev/block/' + privateText));
  assert.deepEqual(facts, { totalBytes: 1073741824, availableBytes: 671088640 });
  assert.equal(JSON.stringify(facts).includes(privateText), false);
  assert.equal(facts.passed, undefined);
});

test('guest numeric overflow, coercion and impossible counts are unavailable', () => {
  for (const value of ['-1', '1.5', '1e6', '+1048576', '01048576', 'NaN', 'Infinity', '9007199254740992', '8796093022208']) assert.equal(guestStorageFacts(report.replace('1048576', value)), null);
  for (const value of ['-1%', '101%', '00%', '1.5%', 'one%']) assert.equal(guestStorageFacts(report.replace('29%', value)), null);
  assert.equal(guestStorageFacts(report.replace('655360', '1048577')), null);
  assert.equal(guestStorageFacts(report.replace('262144', '1048576')), null);
  assert.equal(guestStorageFacts(`${header}\n/dev/block/vdc 0 0 0 0% /data\n`), null);
  assert.deepEqual(guestStorageFacts(`${header}\n/dev/block/vdc 8796093022207 0 8796093022207 0% /data\n`), { totalBytes: 9007199254739968, availableBytes: 9007199254739968 });
});
