import { useState, useEffect } from "react";
import { Station } from "@/types/employee";

export function useStations() {
  const [stations, setStations] = useState<Station[]>(() => {
    try {
      const saved = localStorage.getItem("stations");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("stations", JSON.stringify(stations));
  }, [stations]);

  const addStation = (name: string): Station => {
    const newId = stations.length > 0 ? Math.max(...stations.map(s => s.id)) + 1 : 1;
    const station: Station = { id: newId, name };
    setStations(prev => [...prev, station]);
    return station;
  };

  const editStation = (id: number, name: string) => {
    setStations(prev => prev.map(s => (s.id === id ? { ...s, name } : s)));
  };

  const deleteStation = (id: number) => {
    setStations(prev => prev.filter(s => s.id !== id));
  };

  return { stations, addStation, editStation, deleteStation };
}
