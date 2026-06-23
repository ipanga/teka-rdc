'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

const map: Record<string, string> = {
  "Common.loading": "Chargement...",
  "Common.edit": "Modifier",
  "Common.delete": "Supprimer",
  "Common.cancel": "Annuler",
  "Common.save": "Enregistrer",
  "Cities.title": "Gestion des villes",
  "Cities.newCity": "Nouvelle ville",
  "Cities.editCity": "Modifier la ville",
  "Cities.province": "Province",
  "Cities.active": "Active",
  "Cities.inactive": "Inactive",
  "Cities.sortOrder": "Ordre d'affichage",
  "Cities.communes": "Communes",
  "Cities.newCommune": "Nouvelle commune",
  "Cities.editCommune": "Modifier la commune",
  "Cities.deleteCommune": "Supprimer la commune",
  "Cities.confirmDeleteCommune": "Êtes-vous sûr de vouloir supprimer cette commune ?",
  "Cities.noCities": "Aucune ville configurée",
  "Cities.noCommunes": "Aucune commune pour cette ville",
  "Cities.saveSuccess": "Enregistré avec succès",
  "Cities.deleteSuccess": "Commune supprimée",
  "Cities.errorSaving": "Erreur lors de l'enregistrement",
  "Cities.errorDeleting": "Erreur lors de la suppression",
  "Cities.name": "Nom",
};

interface Commune {
  id: string;
  cityId: string;
  name: string;
  sortOrder: number;
}

interface City {
  id: string;
  name: string;
  province: string;
  isActive: boolean;
  sortOrder: number;
  _count?: { communes: number; products: number };
}

export default function CitiesPage() {
  // Data state
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // City modal state
  const [showCityModal, setShowCityModal] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [cityName, setCityName] = useState('');
  const [cityProvince, setCityProvince] = useState('');
  const [citySortOrder, setCitySortOrder] = useState(0);
  const [isSavingCity, setIsSavingCity] = useState(false);

  // Commune modal state
  const [showCommuneModal, setShowCommuneModal] = useState(false);
  const [editingCommune, setEditingCommune] = useState<Commune | null>(null);
  const [communeName, setCommuneName] = useState('');
  const [communeSortOrder, setCommuneSortOrder] = useState(0);
  const [isSavingCommune, setIsSavingCommune] = useState(false);
  const [deletingCommuneId, setDeletingCommuneId] = useState<string | null>(null);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Fetch cities
  const fetchCities = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<City[]>('/v1/admin/cities');
      setCities(res.data);
    } catch {
      showFeedback('error', map["Cities.errorSaving"]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch communes for selected city
  const fetchCommunes = useCallback(async (cityId: string) => {
    try {
      const res = await apiFetch<Commune[]>(`/v1/admin/cities/${cityId}/communes`);
      setCommunes(res.data);
    } catch {
      setCommunes([]);
    }
  }, []);

  useEffect(() => {
    fetchCities();
  }, [fetchCities]);

  useEffect(() => {
    if (selectedCity) {
      fetchCommunes(selectedCity.id);
    } else {
      setCommunes([]);
    }
  }, [selectedCity, fetchCommunes]);

  // Toggle city active status
  const toggleCityActive = async (city: City) => {
    try {
      await apiFetch(`/v1/admin/cities/${city.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !city.isActive }),
      });
      fetchCities();
      showFeedback('success', map["Cities.saveSuccess"]);
    } catch {
      showFeedback('error', map["Cities.errorSaving"]);
    }
  };

  // Open city modal for create
  const openCreateCity = () => {
    setEditingCity(null);
    setCityName('');
    setCityProvince('');
    setCitySortOrder(0);
    setShowCityModal(true);
  };

  // Open city modal for edit
  const openEditCity = (city: City) => {
    setEditingCity(city);
    setCityName(city.name);
    setCityProvince(city.province);
    setCitySortOrder(city.sortOrder);
    setShowCityModal(true);
  };

  // Save city
  const saveCity = async () => {
    if (!cityName.trim() || !cityProvince.trim()) return;
    setIsSavingCity(true);
    try {
      const body = {
        name: cityName.trim(),
        province: cityProvince.trim(),
        sortOrder: citySortOrder,
      };

      if (editingCity) {
        await apiFetch(`/v1/admin/cities/${editingCity.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/v1/admin/cities', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setShowCityModal(false);
      fetchCities();
      showFeedback('success', map["Cities.saveSuccess"]);
    } catch {
      showFeedback('error', map["Cities.errorSaving"]);
    } finally {
      setIsSavingCity(false);
    }
  };

  // Open commune modal for create
  const openCreateCommune = () => {
    setEditingCommune(null);
    setCommuneName('');
    setCommuneSortOrder(0);
    setShowCommuneModal(true);
  };

  // Open commune modal for edit
  const openEditCommune = (commune: Commune) => {
    setEditingCommune(commune);
    setCommuneName(commune.name);
    setCommuneSortOrder(commune.sortOrder);
    setShowCommuneModal(true);
  };

  // Save commune
  const saveCommune = async () => {
    if (!communeName.trim() || !selectedCity) return;
    setIsSavingCommune(true);
    try {
      const body = {
        name: communeName.trim(),
        sortOrder: communeSortOrder,
      };

      if (editingCommune) {
        await apiFetch(`/v1/admin/cities/communes/${editingCommune.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/v1/admin/cities/${selectedCity.id}/communes`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setShowCommuneModal(false);
      fetchCommunes(selectedCity.id);
      fetchCities(); // refresh commune counts
      showFeedback('success', map["Cities.saveSuccess"]);
    } catch {
      showFeedback('error', map["Cities.errorSaving"]);
    } finally {
      setIsSavingCommune(false);
    }
  };

  // Delete commune
  const deleteCommune = async (communeId: string) => {
    if (!selectedCity) return;
    try {
      await apiFetch(`/v1/admin/cities/communes/${communeId}`, { method: 'DELETE' });
      setDeletingCommuneId(null);
      fetchCommunes(selectedCity.id);
      fetchCities();
      showFeedback('success', map["Cities.deleteSuccess"]);
    } catch {
      showFeedback('error', map["Cities.errorDeleting"]);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">{map["Common.loading"]}</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Feedback banner */}
      {feedback && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{map["Cities.title"]}</h1>
        <button onClick={openCreateCity} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          + {map["Cities.newCity"]}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cities list */}
        <div className="bg-white rounded-xl border border-border shadow-sm">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">{map["Cities.title"]}</h2>
          </div>
          {cities.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground text-sm">{map["Cities.noCities"]}</p>
          ) : (
            <div className="divide-y divide-border">
              {cities.map((city) => (
                <div
                  key={city.id}
                  onClick={() => setSelectedCity(city)}
                  className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
                    selectedCity?.id === city.id ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{city.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{city.province}</span>
                      <span>{city._count?.communes ?? 0} communes</span>
                      <span>{city._count?.products ?? 0} produits</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCityActive(city); }}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        city.isActive
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {city.isActive ? map["Cities.active"] : map["Cities.inactive"]}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditCity(city); }}
                      className="px-2 py-1 text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      {map["Common.edit"]}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Communes panel */}
        <div className="bg-white rounded-xl border border-border shadow-sm">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">
              {map["Cities.communes"]} {selectedCity && <span className="font-normal text-muted-foreground">— {selectedCity.name}</span>}
            </h2>
            {selectedCity && (
              <button onClick={openCreateCommune} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
                + {map["Cities.newCommune"]}
              </button>
            )}
          </div>

          {!selectedCity ? (
            <p className="p-6 text-center text-muted-foreground text-sm">{map["Cities.noCities"]}</p>
          ) : communes.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground text-sm">{map["Cities.noCommunes"]}</p>
          ) : (
            <div className="divide-y divide-border">
              {communes.map((commune) => (
                <div key={commune.id} className="flex items-center justify-between p-4">
                  <div>
                    <span className="font-medium text-foreground">{commune.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditCommune(commune)} className="px-2 py-1 text-xs text-primary hover:text-primary/80 font-medium">
                      {map["Common.edit"]}
                    </button>
                    <button onClick={() => setDeletingCommuneId(commune.id)} className="px-2 py-1 text-xs text-red-600 hover:text-red-700 font-medium">
                      {map["Common.delete"]}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* City Modal */}
      {showCityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">{editingCity ? map["Cities.editCity"] : map["Cities.newCity"]}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{map["Cities.name"]} *</label>
                <input value={cityName} onChange={(e) => setCityName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{map["Cities.province"]} *</label>
                <input value={cityProvince} onChange={(e) => setCityProvince(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{map["Cities.sortOrder"]}</label>
                <input type="number" value={citySortOrder} onChange={(e) => setCitySortOrder(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCityModal(false)} className="px-4 py-2 text-sm rounded-lg border border-input hover:bg-muted transition-colors">{map["Common.cancel"]}</button>
              <button onClick={saveCity} disabled={isSavingCity || !cityName.trim() || !cityProvince.trim()} className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {isSavingCity ? map["Common.loading"] : map["Common.save"]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commune Modal */}
      {showCommuneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">{editingCommune ? map["Cities.editCommune"] : map["Cities.newCommune"]}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{map["Cities.name"]} *</label>
                <input value={communeName} onChange={(e) => setCommuneName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{map["Cities.sortOrder"]}</label>
                <input type="number" value={communeSortOrder} onChange={(e) => setCommuneSortOrder(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCommuneModal(false)} className="px-4 py-2 text-sm rounded-lg border border-input hover:bg-muted transition-colors">{map["Common.cancel"]}</button>
              <button onClick={saveCommune} disabled={isSavingCommune || !communeName.trim()} className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {isSavingCommune ? map["Common.loading"] : map["Common.save"]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Commune Confirmation */}
      {deletingCommuneId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">{map["Cities.deleteCommune"]}</h3>
            <p className="text-sm text-muted-foreground mb-6">{map["Cities.confirmDeleteCommune"]}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeletingCommuneId(null)} className="px-4 py-2 text-sm rounded-lg border border-input hover:bg-muted transition-colors">{map["Common.cancel"]}</button>
              <button onClick={() => deleteCommune(deletingCommuneId)} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
                {map["Common.delete"]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
