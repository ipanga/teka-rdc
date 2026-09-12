import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * A synonym group is a SET of interchangeable search terms, not a
 * from → to mapping: `BrowseService.expandSynonyms()` matches the query against
 * every term in the group and ORs in the rest. So two terms is the minimum that
 * can do anything, and order carries no meaning.
 *
 * Terms are stored as typed (the browse side folds accents and case itself via
 * `stripAccents`), but they are trimmed and de-duplicated here so the same
 * group cannot carry "GSM" and "gsm  " as two entries.
 */
const normalizeTerms = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return value; // let IsString report it
    const term = raw.trim().replace(/\s+/g, ' ');
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
};

export class CreateSearchSynonymDto {
  @IsArray()
  @Transform(({ value }) => normalizeTerms(value))
  @ArrayMinSize(2, {
    message:
      'Un groupe de synonymes doit contenir au moins 2 termes distincts.',
  })
  @ArrayMaxSize(25, { message: 'Un groupe ne peut pas dépasser 25 termes.' })
  @IsString({ each: true })
  @MinLength(2, { each: true, message: 'Chaque terme fait au moins 2 caractères.' })
  @MaxLength(60, { each: true, message: 'Chaque terme fait au plus 60 caractères.' })
  terms!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}

export class UpdateSearchSynonymDto {
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => normalizeTerms(value))
  @ArrayMinSize(2, {
    message:
      'Un groupe de synonymes doit contenir au moins 2 termes distincts.',
  })
  @ArrayMaxSize(25, { message: 'Un groupe ne peut pas dépasser 25 termes.' })
  @IsString({ each: true })
  @MinLength(2, { each: true, message: 'Chaque terme fait au moins 2 caractères.' })
  @MaxLength(60, { each: true, message: 'Chaque terme fait au plus 60 caractères.' })
  terms?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}
