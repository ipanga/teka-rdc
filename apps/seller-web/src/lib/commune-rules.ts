/**
 * Client-side mirror of the API's city ↔ commune rule (D4), shared by the
 * seller application (/devenir-vendeur) and the shop profile so both behave
 * alike. The API (`CitiesService.resolveCommune` / `SellersService`) is the
 * source of truth: a commune must exist, be active and belong to the chosen
 * city, and it is REQUIRED whenever the city has an active commune library.
 * Cities without communes yet (no authoritative data — D2) accept the city
 * alone. These helpers only decide what the form shows/blocks before the
 * request; they never invent communes. Mirrors seller-mobile
 * `core/utils/commune_rules.dart`.
 */

export interface CommuneLibraryState {
  /** The library for the selected city has been fetched (success). */
  loaded: boolean;
  loading: boolean;
  communeCount: number;
}

/** Only once a non-empty library has loaded — never "optional" while loading. */
export function communeRequired(state: Pick<CommuneLibraryState, 'loaded' | 'communeCount'>): boolean {
  return state.loaded && state.communeCount > 0;
}

/**
 * The commune to keep after the library changed (city switched, list
 * reloaded): the current one if it still belongs to the list, else '' so an
 * inconsistent city/commune pair can never be submitted.
 */
export function retainedCommuneId(current: string, availableIds: readonly string[]): string {
  if (!current) return '';
  return availableIds.includes(current) ? current : '';
}

/** French placeholder/helper for the commune field given the load state. */
export function communeHint(cityChosen: boolean, state: CommuneLibraryState): string {
  if (!cityChosen) return 'Sélectionnez d’abord une ville';
  if (state.loading) return 'Chargement des communes…';
  if (state.loaded && state.communeCount === 0) {
    return 'Aucune commune enregistrée pour cette ville pour le moment';
  }
  return 'Sélectionnez votre commune';
}
