import type { EncryptionKind } from '../models/types.js';

export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeError';
  }
}

export function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export function decodeBase64(input: string): string {
  const withoutPadding = (value: string): string => value.replace(/=+$/, '');
  const decoded = Buffer.from(input, 'base64');
  if (withoutPadding(decoded.toString('base64')) !== withoutPadding(input)) {
    throw new DecodeError(`Not valid Base64: ${input}`);
  }
  return decoded.toString('utf8');
}

export function decodeField(value: string, encrypted: EncryptionKind | null): string {
  switch (encrypted) {
    case null:
      return value;
    case 1:
      return decodeBase64(value);
    case 2:
      return rot13(value);
  }
}
