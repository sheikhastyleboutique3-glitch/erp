import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

/**
 * Qatar mobile/landline validation per CRA: 8 digits starting with 2-7.
 * Lenient on input formatting — strips spaces, dashes and an optional +974 /
 * 00974 country prefix before checking the 8-digit core.
 */
export function isQatarPhone(value: string): boolean {
  if (!value) return false;
  let v = String(value).replace(/[\s-()]/g, '');
  v = v.replace(/^\+974/, '').replace(/^00974/, '').replace(/^974/, '');
  return /^[2-7]\d{7}$/.test(v);
}

@ValidatorConstraint({ name: 'isQatarPhone', async: false })
export class IsQatarPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    return value == null || value === '' || isQatarPhone(value);
  }
  defaultMessage() {
    return 'Invalid Qatari phone. Must be 8 digits starting with 2-7 (e.g. 33123456).';
  }
}

export function IsQatarPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsQatarPhoneConstraint,
    });
  };
}
