import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_CONTEXT = 'motoboycity:public-delivery-tracking:v1:';

@Injectable()
export class PublicTrackingTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  createIdentifier(): string {
    return randomBytes(32).toString('base64url');
  }

  tokenFromIdentifier(identifier: string): string {
    return `${identifier}.${this.signature(identifier)}`;
  }

  identifierFromToken(token: string): string | null {
    const [identifier, suppliedSignature, extra] = token.split('.');
    if (
      extra !== undefined ||
      !identifier ||
      !suppliedSignature ||
      !TOKEN_PART_PATTERN.test(identifier) ||
      !TOKEN_PART_PATTERN.test(suppliedSignature)
    ) {
      return null;
    }

    const expectedSignature = this.signature(identifier);
    const supplied = Buffer.from(suppliedSignature, 'ascii');
    const expected = Buffer.from(expectedSignature, 'ascii');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected)
      ? identifier
      : null;
  }

  private signature(identifier: string): string {
    return createHmac('sha256', this.secret)
      .update(`${TOKEN_CONTEXT}${identifier}`)
      .digest('base64url');
  }
}
