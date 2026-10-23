import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffDocumentType, safeDocumentName, attachmentHeader, isDocumentKind } from './files';

const pad = (b: number[]) => Buffer.concat([Buffer.from(b), Buffer.alloc(16)]);

test('document type is decided from the bytes, not the name', () => {
  assert.deepEqual(sniffDocumentType(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj')), { mime: 'application/pdf', isImage: false });
  assert.deepEqual(sniffDocumentType(pad([0xff, 0xd8, 0xff, 0xe0])), { mime: 'image/jpeg', isImage: true });
  assert.deepEqual(sniffDocumentType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), { mime: 'image/png', isImage: true });
  assert.deepEqual(sniffDocumentType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), { mime: 'image/webp', isImage: true });
});

test('everything else is refused: html, svg, scripts, office/zip, executables, tiny files', () => {
  for (const bad of [
    '<html><script>alert(1)</script></html>', '<svg xmlns="http://www.w3.org/2000/svg"></svg>', '#!/bin/sh\nrm -rf /\n',
    'PK\u0003\u0004 office document', 'MZ\u0090\u0000 executable header', 'GIF89a gif is not accepted here', 'short', '',
  ]) assert.equal(sniffDocumentType(Buffer.from(bad.padEnd(20, ' '), 'latin1')), null, bad.slice(0, 20));
  assert.equal(sniffDocumentType(Buffer.from('%PDF-')), null); // too short to be a real file
});

test('stored names are safe and carry the real extension', () => {
  assert.equal(safeDocumentName('Účtenka 2026.pdf', 'application/pdf'), 'Účtenka 2026.pdf');
  assert.equal(safeDocumentName('../../etc/passwd', 'application/pdf'), 'passwd.pdf');
  assert.equal(safeDocumentName('C:\\Users\\a\\receipt.exe', 'image/png'), 'receipt.png');
  assert.ok(!/[\r\n"]/.test(safeDocumentName('evil".pdf\r\nSet-Cookie: x=1', 'application/pdf')));
  assert.ok(!/[\r\n"]/.test(safeDocumentName('a"b\r\nc.pdf', 'application/pdf')));
  assert.equal(safeDocumentName('', 'image/jpeg'), 'document.jpg');
  assert.equal(safeDocumentName(undefined, 'image/webp'), 'document.webp');
  assert.equal(safeDocumentName('.hidden', 'application/pdf'), 'document.pdf'); // a dot-file is all extension, no name
  assert.ok(safeDocumentName('x'.repeat(500) + '.pdf', 'application/pdf').length <= 114);
});

test('download header: ASCII fallback plus UTF-8 name, nothing that can break out of the header', () => {
  const h = attachmentHeader('Účtenka "x".pdf');
  assert.match(h, /^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''/);
  assert.ok(!/[\r\n]/.test(h));
  assert.ok(h.includes("filename*=UTF-8''%C3%9A%C4%8Dtenka%20%22x%22.pdf") || h.includes('%C3%9A'));
  assert.equal(attachmentHeader('plain.pdf'), `attachment; filename="plain.pdf"; filename*=UTF-8''plain.pdf`);
});

test('document kinds', () => {
  for (const k of ['receipt', 'warranty', 'manual', 'other']) assert.ok(isDocumentKind(k));
  assert.ok(!isDocumentKind('invoice')); assert.ok(!isDocumentKind(undefined));
});
