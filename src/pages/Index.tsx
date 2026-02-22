import { useState } from "react";
import { Employee } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

import { EmployeeList } from "@/components/EmployeeList";
import { EmployeeForm } from "@/components/EmployeeForm";
import { StationManager } from "@/components/StationManager";
import { WeeklyPreferences } from "@/components/WeeklyPreferences";
import { ScheduleTable } from "@/components/ScheduleTable";
import { ScheduleChanges } from "@/components/ScheduleChanges";
import { Dashboard } from "@/components/Dashboard";

import { useEmployees } from "@/hooks/useEmployees";
import { useStations } from "@/hooks/useStations";
import { useSchedule } from "@/hooks/useSchedule";
import { useToast } from "@/hooks/use-toast";

import {
  Plus,
  Calendar,
  Users,
  MapPin,
  Save,
  FolderOpen,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Image,
  FileSpreadsheet,
  Eye,
  EyeOff,
  LayoutDashboard,
} from "lucide-react";

const Index = () => {
  const { toast } = useToast();

  const { employees, updateEmployee, deleteEmployee, saveEmployee } = useEmployees();
  const { stations, addStation, editStation, deleteStation } = useStations();
  const {
    schedule,
    weekStart,
    savedSchedules,
    previousSchedule,
    generate,
    saveSchedule,
    loadSchedule,
    deleteSavedSchedule,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    exportToExcel,
    exportToImage,
  } = useSchedule();

  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [showChanges, setShowChanges] = useState(true);

  const handleSaveEmployee = (data: Omit<Employee, "id"> & { id?: string }) => {
    const isEdit = Boolean(data.id);
    saveEmployee(data);
    toast({ title: isEdit ? "העובד עודכן בהצלחה" : "העובד נוסף בהצלחה" });
    setShowEmployeeForm(false);
    setEditingEmployee(null);
  };

  const handleDeleteEmployee = (id: string) => {
    deleteEmployee(id);
    toast({ title: "העובד נמחק" });
  };

  const handleAddStation = (name: string) => {
    addStation(name);
    toast({ title: "העמדה נוספה בהצלחה" });
  };

  const handleEditStation = (id: number, name: string) => {
    editStation(id, name);
    toast({ title: "העמדה עודכנה" });
  };

  const handleDeleteStation = (id: number) => {
    deleteStation(id);
    toast({ title: "העמדה נמחקה" });
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
    generate(employees, stations);
    toast({ title: "השיבוץ נוצר בהצלחה! ✅" });
  };

  const handleSaveSchedule = () => {
    if (!scheduleName.trim()) {
      toast({ title: "שגיאה", description: "יש להזין שם לשיבוץ", variant: "destructive" });
      return;
    }
    const ok = saveSchedule(scheduleName);
    if (ok) {
      toast({ title: `השיבוץ "${scheduleName}" נשמר בהצלחה` });
      setScheduleName("");
      setSaveDialogOpen(false);
    }
  };

  const handleExportExcel = () => {
    const ok = exportToExcel(stations);
    if (ok) toast({ title: "קובץ Excel הורד בהצלחה 📊" });
    else toast({ title: "שגיאה בייצוא", variant: "destructive" });
  };

  const handleExportImage = async () => {
    const ok = await exportToImage();
    if (ok) toast({ title: "התמונה הורדה בהצלחה 🖼️" });
    else toast({ title: "שגיאה בייצוא תמונה", variant: "destructive" });
  };

  const weekLabel = weekStart.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">מערכת שיבוץ עובדים</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {employees.length} עובדים · {stations.length} עמדות
                {schedule && (
                  <span className="mr-2 text-xs">· שבוע {weekLabel}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Dashboard */}
        <div className="mb-6">
          <Dashboard employees={employees} stations={stations} schedule={schedule} />
        </div>

        <Tabs defaultValue="stations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-grid">
            <TabsTrigger value="stations" className="gap-1.5 text-xs sm:text-sm">
              <MapPin className="h-3.5 w-3.5" />
              עמדות
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" />
              עובדים
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5" />
              העדפות
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1.5 text-xs sm:text-sm">
              <LayoutDashboard className="h-3.5 w-3.5" />
              שיבוץ
            </TabsTrigger>
          </TabsList>

          {/* Stations */}
          <TabsContent value="stations" className="space-y-6">
            <h2 className="text-xl font-semibold">ניהול עמדות</h2>
            <StationManager
              stations={stations}
              onAdd={handleAddStation}
              onEdit={handleEditStation}
              onDelete={handleDeleteStation}
            />
          </TabsContent>

          {/* Employees */}
          <TabsContent value="employees" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">ניהול עובדים</h2>
              {!showEmployeeForm && (
                <Button size="sm" onClick={() => setShowEmployeeForm(true)}>
                  <Plus className="h-4 w-4 ml-1.5" />
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
                stations={stations}
                schedule={schedule}
                onEdit={emp => {
                  setEditingEmployee(emp);
                  setShowEmployeeForm(true);
                }}
                onDelete={handleDeleteEmployee}
              />
            )}
          </TabsContent>

          {/* Preferences */}
          <TabsContent value="preferences" className="space-y-6">
            <h2 className="text-xl font-semibold">העדפות שבועיות</h2>
            <WeeklyPreferences
              employees={employees}
              stations={stations}
              weekStart={weekStart}
              onUpdate={updateEmployee}
            />
          </TabsContent>

          {/* Schedule */}
          <TabsContent value="schedule" className="space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">שיבוץ שבועי</h2>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleGenerateSchedule}>
                  <Calendar className="h-4 w-4 ml-1.5" />
                  צור שיבוץ
                </Button>
                {schedule && (
                  <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Save className="h-4 w-4 ml-1.5" />
                        שמור
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
                            onChange={e => setScheduleName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSaveSchedule()}
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

            {/* Week navigator */}
            <Card className="bg-accent/10 border-accent/30">
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
                    <ChevronRight className="h-4 w-4 ml-1" />
                    <span className="hidden sm:inline">שבוע קודם</span>
                  </Button>
                  <div className="flex flex-col items-center gap-0.5 text-center">
                    <p className="text-xs text-muted-foreground">שבוע מתחיל ב:</p>
                    <p className="font-semibold text-sm sm:text-base">{weekLabel}</p>
                    <button
                      onClick={goToCurrentWeek}
                      className="text-xs text-primary hover:underline"
                    >
                      חזור לשבוע הנוכחי
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={goToNextWeek}>
                    <span className="hidden sm:inline">שבוע הבא</span>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {schedule ? (
              <>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={handleExportImage}>
                    <Image className="h-4 w-4 ml-1.5" />
                    <span className="hidden sm:inline">ייצא כתמונה</span>
                    <span className="sm:hidden">PNG</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportExcel}>
                    <FileSpreadsheet className="h-4 w-4 ml-1.5" />
                    <span className="hidden sm:inline">ייצא לאקסל</span>
                    <span className="sm:hidden">Excel</span>
                  </Button>
                </div>

                <div id="schedule-table">
                  <ScheduleTable
                    schedule={schedule}
                    stations={stations}
                    weekStart={weekStart}
                  />
                </div>

                <div className="flex items-center gap-3 p-3 border rounded-lg bg-accent/10">
                  <Switch
                    id="show-changes"
                    checked={showChanges}
                    onCheckedChange={setShowChanges}
                  />
                  <Label
                    htmlFor="show-changes"
                    className="cursor-pointer flex items-center gap-2 text-sm"
                  >
                    {showChanges ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                    הצג השוואה לשבוע הקודם
                  </Label>
                </div>

                {showChanges && (
                  <ScheduleChanges
                    currentSchedule={schedule}
                    previousSchedule={previousSchedule}
                    stations={stations}
                    currentWeekStart={weekStart}
                  />
                )}
              </>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Calendar className="h-14 w-14 mx-auto mb-4 opacity-30" />
                <p className="text-base">
                  לחץ על "צור שיבוץ" כדי ליצור טבלת שיבוץ שבועית
                </p>
                <p className="text-sm mt-1">
                  {employees.length === 0 && "נדרש להוסיף עובדים תחילה · "}
                  {stations.length === 0 && "נדרש להוסיף עמדות תחילה"}
                </p>
              </div>
            )}

            {/* Archive */}
            {savedSchedules.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderOpen className="h-5 w-5" />
                    ארכיון שיבוצים
                  </CardTitle>
                  <CardDescription>
                    שיבוצים שמורים — ניתן לטעון בכל עת
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {savedSchedules.map(saved => (
                      <div
                        key={saved.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{saved.name}</p>
                          <p className="text-xs text-muted-foreground">
                            נשמר {new Date(saved.savedAt).toLocaleDateString("he-IL")} ·{" "}
                            שבוע מ-{new Date(saved.weekStart).toLocaleDateString("he-IL")}
                          </p>
                        </div>
                        <div className="flex gap-1.5 mr-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => {
                              loadSchedule(saved);
                              toast({ title: `"${saved.name}" נטען` });
                            }}
                          >
                            <FolderOpen className="h-3.5 w-3.5 ml-1" />
                            טען
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              deleteSavedSchedule(saved.id);
                              toast({ title: "השיבוץ נמחק מהארכיון" });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
