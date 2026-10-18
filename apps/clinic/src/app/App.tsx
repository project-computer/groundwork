import { VetApp } from "@/features/vet/vet-app";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <>
      <VetApp />
      <Toaster position="bottom-right" />
    </>
  );
}
