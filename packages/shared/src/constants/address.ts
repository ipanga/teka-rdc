export const DRC_PROVINCES = [
  'Haut-Katanga',
  'Lualaba',
  'Haut-Lomami',
  'Tanganyika',
  'Kinshasa',
  'Kongo-Central',
  'Nord-Kivu',
  'Sud-Kivu',
  'Maniema',
  'Tshopo',
  'Équateur',
  'Mongala',
  'Nord-Ubangi',
  'Sud-Ubangi',
  'Tshuapa',
  'Sankuru',
  'Kasaï',
  'Kasaï-Central',
  'Kasaï-Oriental',
  'Lomami',
  'Kwango',
  'Kwilu',
  'Maï-Ndombe',
  'Ituri',
  'Bas-Uélé',
  'Haut-Uélé',
] as const;

export type DrcProvince = (typeof DRC_PROVINCES)[number];

export const LUBUMBASHI_COMMUNES = [
  'Lubumbashi',
  'Kampemba',
  'Kamalondo',
  'Kenya',
  'Katuba',
  'Rwashi',
  'Annexe',
] as const;

export type LubumbashiCommune = (typeof LUBUMBASHI_COMMUNES)[number];

export const HAUT_KATANGA_TOWNS = [
  'Lubumbashi',
  'Likasi',
  'Kipushi',
  'Kasumbalesa',
  'Kambove',
] as const;

export const LUALABA_TOWNS = [
  'Kolwezi',
  'Dilolo',
  'Fungurume',
] as const;
