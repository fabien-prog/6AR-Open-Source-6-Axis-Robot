import "./App.css";
import MainPage from "@/features/App/MainPage";
import FuturisticBackground from "@/components/fx/FuturisticBackground";

export default function App() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Global background */}
      <FuturisticBackground />

      {/* App content */}
      <div className="relative z-10 min-h-screen">
        <MainPage />
      </div>
    </div>
  );
}