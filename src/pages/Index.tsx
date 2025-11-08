import { useState, useEffect } from "react";
import { Employee, Station, WeeklySchedule, SavedSchedule } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeList } from "@/components/EmployeeList";
import { EmployeeForm } from "@/components/EmployeeForm";
import { StationManager } from "@/components/StationManager";
import { WeeklyPreferences } from "@/components/WeeklyPreferences";
import { ScheduleTable } from "@/components/ScheduleTable";
import { generateWeeklySchedule } from "@/lib/scheduler";
import { Plus, Calendar, Users, MapPin, Save, FolderOpen, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem("employees");
    return saved ? JSON.parse(saved) : [];
  });
  const [stations, setStations] = useState<Station[]>(() => {
    const saved = localStorage.getItem("stations");
    return saved ? JSON.parse(saved) : [];
  });
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(() => {
    const saved = localStorage.getItem("schedule");
    return saved ? JSON.parse(saved) : null;
  });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const saved = localStorage.getItem("weekStart");
    return saved ? new Date(saved) : getNextSunday(new Date());
  });
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>(() => {
    const saved = localStorage.getItem("savedSchedules");
    return saved ? JSON.parse(saved) : [];
  });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");

  function getNextSunday(date: Date) {
    const result = new Date(date);
    result.setDate(result.getDate() + ((7 - result.getDay()) % 7));
    return result;
  }

  // Auto-save employees to localStorage
  useEffect(() => {
    localStorage.setItem("employees", JSON.stringify(employees));
  }, [employees]);

  // Auto-save stations to localStorage
  useEffect(() => {
    localStorage.setItem("stations", JSON.stringify(stations));
  }, [stations]);

  // Auto-save schedule to localStorage
  useEffect(() => {
    if (schedule) {
      localStorage.setItem("schedule", JSON.stringify(schedule));
    }
  }, [schedule]);

  // Auto-save weekStart to localStorage
  useEffect(() => {
    localStorage.setItem("weekStart", weekStart.toISOString());
  }, [weekStart]);

  // Auto-save savedSchedules to localStorage
  useEffect(() => {
    localStorage.setItem("savedSchedules", JSON.stringify(savedSchedules));
  }, [savedSchedules]);

  const handleSaveSchedule = () => {
    if (!schedule || !scheduleName.trim()) {
      toast({
        title: "שגיאה",
        description: "יש להזין שם לשיבוץ",
        variant: "destructive",
      });
      return;
    }

    const newSavedSchedule: SavedSchedule = {
      id: Date.now().toString(),
      name: scheduleName.trim(),
      schedule,
      weekStart: weekStart.toISOString(),
      savedAt: new Date().toISOString(),
    };

    setSavedSchedules([...savedSchedules, newSavedSchedule]);
    toast({ title: `השיבוץ "${scheduleName}" נשמר בהצלחה` });
    setScheduleName("");
    setSaveDialogOpen(false);
  };

  const handleLoadSchedule = (savedSchedule: SavedSchedule) => {
    setSchedule(savedSchedule.schedule);
    setWeekStart(new Date(savedSchedule.weekStart));
    toast({ title: `השיבוץ "${savedSchedule.name}" נטען` });
  };

  const handleDeleteSavedSchedule = (id: string) => {
    setSavedSchedules(savedSchedules.filter(s => s.id !== id));
    toast({ title: "השיבוץ נמחק מהארכיון" });
  };

  const handleAddStation = (name: string) => {
    const newId = stations.length > 0 ? Math.max(...stations.map(s => s.id)) + 1 : 1;
    setStations([...stations, { id: newId, name }]);
    toast({ title: "העמדה נוספה בהצלחה" });
  };

  const handleDeleteStation = (id: number) => {
    setStations(stations.filter(s => s.id !== id));
    toast({ title: "העמדה נמחקה" });
  };

  const handleSaveEmployee = (employeeData: Omit<Employee, "id"> & { id?: string }) => {
    if (employeeData.id) {
      setEmployees(employees.map(e => e.id === employeeData.id ? employeeData as Employee : e));
      toast({ title: "העובד עודכן בהצלחה" });
    } else {
      const newEmployee: Employee = {
        ...employeeData,
        id: Date.now().toString(),
      };
      setEmployees([...employees, newEmployee]);
      toast({ title: "העובד נוסף בהצלחה" });
    }
    setShowEmployeeForm(false);
    setEditingEmployee(null);
  };

  const handleDeleteEmployee = (id: string) => {
    setEmployees(employees.filter(e => e.id !== id));
    toast({ title: "העובד נמחק" });
  };

  const handleUpdateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees(employees.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const handleGenerateSchedule = () => {
    if (employees.length === 0 || stations.length === 0) {
      toast({
        title: "שגיאה",
        description: "יש להוסיף עובדים ועמדות לפני יצירת שיבוץ",
        variant: "destructive",
      });
      return;
    }

    const newSchedule = generateWeeklySchedule(employees, stations, weekStart);
    setSchedule(newSchedule);
    toast({ title: "השיבוץ נוצר בהצלחה!" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-primary">מערכת שיבוץ עובדים</h1>
          <p className="text-muted-foreground mt-2">ניהול ושיבוץ עובדים לעמדות עבודה</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="stations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="stations" className="gap-2">
              <MapPin className="h-4 w-4" />
              עמדות
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-2">
              <Users className="h-4 w-4" />
              עובדים
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2">
              <Calendar className="h-4 w-4" />
              העדפות
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-2">
              <Calendar className="h-4 w-4" />
              שיבוץ
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stations" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">ניהול עמדות</h2>
            </div>
            <StationManager
              stations={stations}
              onAdd={handleAddStation}
              onDelete={handleDeleteStation}
            />
          </TabsContent>

          <TabsContent value="employees" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">ניהול עובדים</h2>
              {!showEmployeeForm && (
                <Button onClick={() => setShowEmployeeForm(true)}>
                  <Plus className="h-4 w-4 ml-2" />
                  הוסף עובד
                </Button>
              )}
            </div>

            {showEmployeeForm ? (
              <EmployeeForm
                employee={editingEmployee || undefined}
                stations={stations}
                onSave={handleSaveEmployee}
                onCancel={() => {
                  setShowEmployeeForm(false);
                  setEditingEmployee(null);
                }}
              />
            ) : (
              <EmployeeList
                employees={employees}
                onEdit={(emp) => {
                  setEditingEmployee(emp);
                  setShowEmployeeForm(true);
                }}
                onDelete={handleDeleteEmployee}
              />
            )}
          </TabsContent>

          <TabsContent value="preferences" className="space-y-6">
            <h2 className="text-2xl font-semibold">העדפות שבועיות</h2>
            <WeeklyPreferences
              employees={employees}
              stations={stations}
              weekStart={weekStart}
              onUpdate={handleUpdateEmployee}
            />
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">שיבוץ שבועי</h2>
              <div className="flex gap-2">
                <Button onClick={handleGenerateSchedule} size="lg">
                  <Calendar className="h-4 w-4 ml-2" />
                  צור שיבוץ
                </Button>
                {schedule && (
                  <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="lg" variant="outline">
                        <Save className="h-4 w-4 ml-2" />
                        שמור שיבוץ
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>שמור שיבוץ לארכיון</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="scheduleName">שם השיבוץ</Label>
                          <Input
                            id="scheduleName"
                            placeholder="לדוגמה: שיבוץ דצמבר 2024"
                            value={scheduleName}
                            onChange={(e) => setScheduleName(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleSaveSchedule}>שמור</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            {schedule ? (
              <>
                <ScheduleTable
                  schedule={schedule}
                  stations={stations}
                  weekStart={weekStart}
                />
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">לחץ על "צור שיבוץ" ליצירת טבלת שיבוץ שבועית</p>
              </div>
            )}

            {savedSchedules.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5" />
                    ארכיון שיבוצים
                  </CardTitle>
                  <CardDescription>
                    שיבוצים שמורים שניתן לטעון בכל עת
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {savedSchedules.map((saved) => (
                      <div
                        key={saved.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{saved.name}</p>
                          <p className="text-sm text-muted-foreground">
                            נשמר ב-{new Date(saved.savedAt).toLocaleDateString('he-IL')} | 
                            שבוע מתאריך {new Date(saved.weekStart).toLocaleDateString('he-IL')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLoadSchedule(saved)}
                          >
                            <FolderOpen className="h-4 w-4 ml-2" />
                            טען
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteSavedSchedule(saved.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
