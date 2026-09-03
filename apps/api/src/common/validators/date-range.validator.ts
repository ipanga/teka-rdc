import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Class-level guard for a `{ dateFrom, dateTo }` pair.
 *
 * Two failures it prevents, neither of which the field-level `@IsDateString`
 * checks could catch:
 *
 * - an inverted range, which silently returns zero rows and reads as "no
 *   sales" rather than "you typed the dates backwards";
 * - an unbounded range, which is how an admin report turns into a full table
 *   scan plus a multi-megabyte CSV.
 *
 * Both bounds are optional — an absent range means "everything", which the
 * report endpoints still cap by pagination and by CSV_MAX_ROWS.
 */
export function IsValidDateRange(
  opts: { maxDays: number },
  validationOptions?: ValidationOptions,
) {
  return function (constructor: Function) {
    registerDecorator({
      name: 'isValidDateRange',
      target: constructor,
      propertyName: undefined as unknown as string,
      constraints: [opts],
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as {
            dateFrom?: string;
            dateTo?: string;
          };
          if (!obj.dateFrom || !obj.dateTo) return true;

          const from = new Date(obj.dateFrom.slice(0, 10));
          const to = new Date(obj.dateTo.slice(0, 10));
          if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            // Field-level @IsDateString owns the "is it a date at all" message.
            return true;
          }
          if (from > to) return false;

          const spanDays = (to.getTime() - from.getTime()) / 86_400_000 + 1;
          return spanDays <= opts.maxDays;
        },
        defaultMessage(args: ValidationArguments) {
          const obj = args.object as { dateFrom?: string; dateTo?: string };
          const from = new Date((obj.dateFrom ?? '').slice(0, 10));
          const to = new Date((obj.dateTo ?? '').slice(0, 10));
          if (from > to) {
            return 'La date de début doit précéder la date de fin.';
          }
          return `La plage de dates ne peut pas dépasser ${opts.maxDays} jours.`;
        },
      },
    });
  };
}
