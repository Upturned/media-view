import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** SHA-256 of a file, streamed, as hex (technical doc §8.2). */
export function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}
