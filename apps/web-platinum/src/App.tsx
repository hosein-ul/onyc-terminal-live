import { Navigate, Route, Routes } from "react-router-dom";
import { ChartsGallery } from "./routes/ChartsGallery";

/** Phase 3 shell: only the chart gallery. Phase 4 adds the eleven pages and the sidebar. */
export function App() {
  return (
    <Routes>
      <Route path="/_charts" element={<ChartsGallery />} />
      <Route path="*" element={<Navigate to="/_charts" replace />} />
    </Routes>
  );
}
