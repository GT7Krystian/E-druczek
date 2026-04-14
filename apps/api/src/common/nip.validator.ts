import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidNip } from '@e-druczek/shared';

@ValidatorConstraint({ name: 'IsPolishNip', async: false })
export class IsPolishNipConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return isValidNip(value);
  }

  defaultMessage(): string {
    return 'Nieprawidłowy NIP — sprawdź czy numer jest poprawny (suma kontrolna)';
  }
}

/** Decorator: validates Polish NIP format + checksum. */
export function IsPolishNip(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsPolishNipConstraint,
    });
  };
}
