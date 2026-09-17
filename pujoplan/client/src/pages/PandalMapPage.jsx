import React, { useState, useEffect } from 'react';
import AppLayout from '../layouts/AppLayout';
import PandalMapExplorer from '../components/PandalMapExplorer';
import { getSpots } from '../services/api';

export default function PandalMapPage() {
  const [pandals, setPandals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPandals() {
      try {
        const { data } = await getSpots({ limit: 500 });
        if (data?.spots && data.spots.length > 0) {
          setPandals(
            data.spots.map(s => ({
              id: s.id,
              name: s.name,
              address: s.address || s.area || 'Kolkata',
              lat: s.latitude,
              lng: s.longitude,
              category: s.category,
            }))
          );
        }
      } catch (err) {
        console.warn('Could not load pandals from API, fallback to default dataset', err);
      } finally {
        setLoading(false);
      }
    }
    loadPandals();
  }, []);

  return (
    <AppLayout title="Pandal & Amenities Map" back>
      <div style={{ width: '100%', height: 'calc(100vh - 60px)', position: 'relative' }}>
        <PandalMapExplorer pandals={pandals.length > 0 ? pandals : undefined} />
      </div>
    </AppLayout>
  );
}
