import { useState } from "react";
import { Station } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Edit2, Check, X } from "lucide-react";

interface StationManagerProps {
  stations: Station[];
  onAdd: (name: string) => void;
  onEdit: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}

export function StationManager({ stations, onAdd, onEdit, onDelete }: StationManagerProps) {
  const [newStationName, setNewStationName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName.trim()) return;
    onAdd(newStationName.trim());
    setNewStationName("");
  };

  const startEdit = (station: Station) => {
    setEditingId(station.id);
    setEditingName(station.name);
  };

  const saveEdit = () => {
    if (editingId !== null && editingName.trim()) {
      onEdit(editingId, editingName.trim());
      setEditingId(null);
      setEditingName("");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={newStationName}
          onChange={(e) => setNewStationName(e.target.value)}
          placeholder="שם העמדה"
        />
        <Button type="submit">
          <Plus className="h-4 w-4 ml-2" />
          הוסף עמדה
        </Button>
      </form>

      {stations.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">לא נמצאו עמדות. הוסף עמדה חדשה.</p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="space-y-2">
            {stations.map((station) => (
              <div
                key={station.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary"
              >
                {editingId === station.id ? (
                  <>
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant="outline">{station.id}</Badge>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="max-w-xs"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={saveEdit}
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={cancelEdit}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{station.id}</Badge>
                      <span className="font-medium">{station.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(station)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(station.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
