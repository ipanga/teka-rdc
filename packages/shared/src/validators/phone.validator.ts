import { z } from 'zod';
import { DRC_PHONE_REGEX } from '../constants/phone';

export const phoneSchema = z
  .string()
  .regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide. Format: +243XXXXXXXXX');

export const phoneOptionalSchema = z
  .string()
  .regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide. Format: +243XXXXXXXXX')
  .optional();
