import { describe, expect, it } from 'vitest';
import { DecodeError, decodeBase64, decodeField, rot13 } from '../../../src/utils/decode.js';

describe('rot13', () => {
  it('decodes a known label', () => {
    expect(rot13('Vzcbffvoyr')).toBe('Impossible');
  });

  it('is its own inverse', () => {
    const text = 'Help Trudy Badcock to fix their house';
    expect(rot13(rot13(text))).toBe(text);
  });

  it('leaves digits and punctuation untouched', () => {
    expect(rot13('Hmmm....')).toBe('Uzzz....');
    expect(rot13('42!')).toBe('42!');
  });
});

describe('decodeBase64', () => {
  it.each([
    ['U3VpY2lkZSBtaXNzaW9u', 'Suicide mission'],
    ['Umlza3k=', 'Risky'],
    ['R2FtYmxl', 'Gamble'],
    ['SG1tbS4uLi4=', 'Hmmm....'],
  ])('decodes %s', (input, expected) => {
    expect(decodeBase64(input)).toBe(expected);
  });

  it('round-trips non-ASCII text', () => {
    const text = 'Krešimira Woodcock';
    expect(decodeBase64(Buffer.from(text).toString('base64'))).toBe(text);
  });

  it('rejects input that is not Base64', () => {
    expect(() => decodeBase64('not base64!')).toThrow(DecodeError);
  });
});

describe('decodeField', () => {
  it('passes plain values through', () => {
    expect(decodeField('Sure thing', null)).toBe('Sure thing');
  });

  it('treats encrypted=1 as Base64', () => {
    expect(decodeField('Umlza3k=', 1)).toBe('Risky');
  });

  it('treats encrypted=2 as ROT13', () => {
    expect(decodeField('Vzcbffvoyr', 2)).toBe('Impossible');
  });
});
