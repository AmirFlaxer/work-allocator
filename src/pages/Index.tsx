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

  const { employees, updateEmployee, deleteEmployee, saveEmploy
