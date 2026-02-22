import { useState, useEffect } from "react";
import { Employee } from "@/types/employee";

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem("employees");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("employees", JSON.stringify(employees));
  }, [employees]);

  const addEmployee = (data: Omit<Employee, "id">): Employee => {
    const newEmployee: Employee = { ...data, id: Date.now().toString() };
    setEmployees(prev => [...prev, newEmployee]);
    return newEmployee;
  };

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
  };

  const deleteEmployee = (id: string) => {
    setEmployees(prev => prev.filter(e => e.id !== id));
  };

  const saveEmployee = (data: Omit<Employee, "id"> & { id?: string }) => {
    if (data.id) {
      updateEmployee(data.id, data as Employee);
    } else {
      addEmployee(data);
    }
  };

  return { employees, addEmployee, updateEmployee, deleteEmployee, saveEmployee };
}
