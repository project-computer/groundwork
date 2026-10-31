import { useEffect } from "react";
import { ClinicApp } from "@/features/vet/shell";
import { ErrorBoundary } from "@/app/error-boundary";
import { ClinicProvider } from "@/lib/vet/store";
import { LocaleProvider } from "@/lib/i18n";
import { applyTheme, watchSystemTheme } from "@/lib/theme";

export const App = () => {
  useEffect(() => {
    applyTheme();
    return watchSystemTheme();
  }, []);

  return (
    <LocaleProvider>
      <ClinicProvider>
        <ErrorBoundary>
          <ClinicApp />
        </ErrorBoundary>
      </ClinicProvider>
    </LocaleProvider>
  );
}
