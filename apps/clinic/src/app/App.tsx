import { useEffect } from "react";
import { ClinicApp } from "@/features/vet/clinic-shell";
import { ClinicProvider } from "@/lib/vet/store";
import { applyTheme, watchSystemTheme } from "@/lib/theme";

export default function App() {
  useEffect(() => {
    applyTheme();
    return watchSystemTheme();
  }, []);

  return (
    <ClinicProvider>
      <ClinicApp />
    </ClinicProvider>
  );
}
