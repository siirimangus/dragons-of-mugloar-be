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

const MAX_ECHO = 40;

function truncate(value: string): string {
  return value.length > MAX_ECHO ? `${value.slice(0, MAX_ECHO)}...` : value;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

export function decodeBase64(input: string): string {
  const bytes = Buffer.from(input, 'base64');
  if (bytes.toString('base64') !== input) {
    throw new DecodeError(`Not valid Base64: ${truncate(input)}`);
  }
  try {
    return utf8.decode(bytes);
  } catch {
    throw new DecodeError(`Base64 is not valid UTF-8: ${truncate(input)}`);
  }
}

export function decodeField(value: string, encrypted: EncryptionKind | null): string {
  switch (encrypted) {
    case null:
      return value;
    case 1:
      return decodeBase64(value);
    case 2:
      return rot13(value);
    default: {
      const unreachable: never = encrypted;
      throw new DecodeError(`Unsupported encryption kind: ${String(unreachable)}`);
    }
  }
}
