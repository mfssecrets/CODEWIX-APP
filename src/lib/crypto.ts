const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'codewix-default-enc-key-32byt';

function getKeyBuffer(): Buffer {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
  return key;
}

export function encrypt(text: string): string {
  if (!text) return '';
  try {
    const key = getKeyBuffer();
    const iv = Buffer.alloc(16, 0);
    const algo = 'aes-256-cbc';
    // Simple XOR-based obfuscation for SQLite env (no node:crypto in edge)
    const buf = Buffer.from(text, 'utf8');
    const encrypted = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) {
      encrypted[i] = buf[i] ^ key[i % key.length];
    }
    return encrypted.toString('base64');
  } catch {
    return '';
  }
}

export function decrypt(encrypted: string): string {
  if (!encrypted) return '';
  try {
    const key = getKeyBuffer();
    const buf = Buffer.from(encrypted, 'base64');
    const decrypted = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) {
      decrypted[i] = buf[i] ^ key[i % key.length];
    }
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
