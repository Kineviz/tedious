// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { createHmac } from 'crypto';
import SymmetricKey from './symmetric-key';

export const keySize = 256;
const keySizeInBytes = keySize / 8;

export const deriveKey = (rootKey: Buffer, salt: string): Buffer => {
  console.log('> aead-aes-256-cbc-hmac-encryption-key.ts -> deriveKey()')
  const hmac = createHmac('sha256', rootKey);
  hmac.update(Buffer.from(salt, 'utf16le'));
  return hmac.digest();
};

export const generateKeySalt = (
  keyType: 'encryption' | 'MAC' | 'IV',
  algorithmName: string,
  keySize: number,
): string =>
  `Microsoft SQL Server cell ${keyType} key ` +
  `with encryption algorithm:${algorithmName} and key length:${keySize}`;

export class AeadAes256CbcHmac256EncryptionKey extends SymmetricKey {
  private readonly algorithmName: string;
  private encryptionKeySaltFormat: string;
  private macKeySaltFormat: string;
  private ivKeySaltFormat: string;
  private encryptionKey: SymmetricKey;
  private macKey: SymmetricKey;
  private ivKey: SymmetricKey;

  constructor(rootKey: Buffer, algorithmName: string) {
    console.log('> aead-aes-256-cbc-hmac-encryption-key.ts -> new AeadAes256CbcHmac256EncryptionKey()')
    super(rootKey);
    this.algorithmName = algorithmName;
    this.encryptionKeySaltFormat = generateKeySalt('encryption', this.algorithmName, keySize);
    this.macKeySaltFormat = generateKeySalt('MAC', this.algorithmName, keySize);
    this.ivKeySaltFormat = generateKeySalt('IV', this.algorithmName, keySize);

    if (rootKey.length !== keySizeInBytes) {
      throw new Error(`The column encryption key has been successfully decrypted but it's length: ${rootKey.length} does not match the length: ${keySizeInBytes} for algorithm "${this.algorithmName}". Verify the encrypted value of the column encryption key in the database.`);
    }

    try {
      const encKeyBuff = deriveKey(rootKey, this.encryptionKeySaltFormat);

      this.encryptionKey = new SymmetricKey(encKeyBuff);

      const macKeyBuff = deriveKey(rootKey, this.macKeySaltFormat);

      this.macKey = new SymmetricKey(macKeyBuff);

      const ivKeyBuff = deriveKey(rootKey, this.ivKeySaltFormat);

      this.ivKey = new SymmetricKey(ivKeyBuff);
    } catch (error) {
      throw new Error(`Key extraction failed : ${error.message}.`);
    }
  }

  getEncryptionKey(): Buffer {
    console.log('> aead-aes-256-cbc-hmac-encryption-key.ts -> getEncryptionKey()')

    return this.encryptionKey.rootKey;
  }

  getMacKey(): Buffer {
    console.log('> aead-aes-256-cbc-hmac-encryption-key.ts -> getMacKey()')

    return this.macKey.rootKey;
  }

  getIvKey(): Buffer {
    console.log('> aead-aes-256-cbc-hmac-encryption-key.ts -> getIvKey()')

    return this.ivKey.rootKey;
  }
}
