import { Injectable } from '@nestjs/common';

/** Ponto único de tempo para regras financeiras e testes determinísticos. */
@Injectable()
export class FinancialClock {
  now(): Date {
    return new Date();
  }
}
