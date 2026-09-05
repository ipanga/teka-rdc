/// Client-side mirror of the API's city ↔ commune rule (D4), shared by the
/// seller application and the shop-profile screens so both behave alike.
///
/// The API (`CitiesService.resolveCommune` / `SellersService`) is the source
/// of truth: a commune must exist, be active and belong to the chosen city,
/// and it is REQUIRED whenever the city has an active commune library.
/// Cities without communes yet (no authoritative data — D2) accept the city
/// alone. These helpers only decide what the form shows/blocks before the
/// request; they never invent communes.
library;

/// Is a commune required for the selected city? Only once the library has
/// actually loaded: while loading (or after a load error) the form must not
/// claim the commune is optional.
bool communeRequired({required bool loaded, required int communeCount}) {
  return loaded && communeCount > 0;
}

/// The commune to keep after the library changed (city switched, list
/// reloaded): the current one if it still belongs to the list, else `null`
/// so an inconsistent city/commune pair can never be submitted.
String? retainedCommuneId(String? current, Iterable<String> availableIds) {
  if (current == null || current.isEmpty) return null;
  return availableIds.contains(current) ? current : null;
}

/// French helper text for the commune field given the load state.
String communeHint({
  required bool cityChosen,
  required bool loading,
  required bool loaded,
  required int communeCount,
}) {
  if (!cityChosen) return 'Sélectionnez d’abord une ville';
  if (loading) return 'Chargement des communes…';
  if (loaded && communeCount == 0) {
    return 'Aucune commune enregistrée pour cette ville pour le moment';
  }
  return 'Sélectionnez votre commune';
}
