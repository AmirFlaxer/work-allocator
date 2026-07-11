import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-background px-6" dir="rtl">
    <div className="text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
        <Compass className="h-8 w-8" />
      </div>
      <h1 className="text-5xl font-extrabold text-foreground">404</h1>
      <p className="text-muted-foreground">הדף שחיפשת לא נמצא</p>
      <Button asChild>
        <Link to="/">חזרה לדף הבית</Link>
      </Button>
    </div>
  </div>
);

export default NotFound;
