import { useTheme } from "./hooks/useTheme";
import { LandingPage } from "./pages/LandingPage";
import { StudioPage } from "./pages/StudioPage";

function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <LandingPage theme={theme} toggleTheme={toggleTheme} />
      <main>
        <StudioPage theme={theme} toggleTheme={toggleTheme} />
      </main>
    </>
  );
}

export default App;
