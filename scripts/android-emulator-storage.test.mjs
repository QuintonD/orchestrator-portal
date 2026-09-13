import test from 'node:test';
import assert from 'node:assert/strict';
import { statfs } from 'node:fs/promises';
import { hostStorageFacts, guestStorageFacts } from './android-emulator-storage.mjs';

// Actual authorized API 34 stat output; df instead labeled /data/user/0.
const report = '4096:1520536:1234781\n';

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

test('actual guest stat returns byte facts and accepts only supported adb line endings', () => {
  const expected = { totalBytes: 6228115456, availableBytes: 5057662976 };
  for (const value of [report, report.trimEnd(), report.replaceAll('\n', '\r\n'), report.replaceAll('\n', '\r\r\n')]) assert.deepEqual(guestStorageFacts(value), expected);
  assert.deepEqual(guestStorageFacts('4096:262144:0\n'), { totalBytes: 1073741824, availableBytes: 0 });
  assert.deepEqual(Object.keys(guestStorageFacts(report)), ['totalBytes', 'availableBytes']);
});

test('guest stat rejects missing, extra, multiline, injected or legacy df output', () => {
  const privateText = 'synthetic-private-path-or-message';
  for (const value of [null, {}, 1, Buffer.from(report), '', 'x'.repeat(129), report + report, '\n' + report, report + '\n', report + privateText,
    privateText + report, report.trimEnd() + ':' + privateText, ' ' + report, report.replace(':', ': '), report.replace(':', '\t'), report.replace('\n', ' \n'),
    report.replace('\n', '\r'), report.replace('\n', '\r\r\r\n'), report.replace('\n', '\u2028'), report.replace('\n', '\u2029'), report.replace(':', '\r:'), report.replace(':', '\u0000:'),
    'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/dm-40 6082144 1000584 4939348 17% /data/user/0\n']) {
    assert.equal(guestStorageFacts(value), null);
  }
});

test('guest stat numeric overflow, coercion and impossible counts are unavailable', () => {
  for (let index = 0; index < 3; index++) {
    for (const value of ['-1', '-0', '1.5', '1e6', '+1', '01', 'NaN', 'Infinity', '9007199254740992', '10000000000000000']) {
      const fields = ['4096', '1520536', '1234781']; fields[index] = value;
      assert.equal(guestStorageFacts(fields.join(':')), null);
    }
  }
  for (const value of ['0:1:0', '1:0:0', '1:1:2', '1024:8796093022208:0']) assert.equal(guestStorageFacts(value), null);
  assert.deepEqual(guestStorageFacts('1:9007199254740991:9007199254740991'), { totalBytes: Number.MAX_SAFE_INTEGER, availableBytes: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(guestStorageFacts('1024:8796093022207:8796093022207'), { totalBytes: 9007199254739968, availableBytes: 9007199254739968 });
});
