import { Routes, Route, Navigate } from "react-router-dom";
import { GettingStarted } from "./pages/GettingStarted";
import { Architecture } from "./pages/Architecture";
import { ApiReference } from "./pages/ApiReference";
import { OntologyGuide } from "./pages/OntologyGuide";
import { SdkGuide } from "./pages/SdkGuide";
import { DeploymentGuide } from "./pages/DeploymentGuide";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/getting-started" replace />} />
      <Route path="/getting-started" element={<GettingStarted />} />
      <Route path="/architecture" element={<Architecture />} />
      <Route path="/api-reference" element={<ApiReference />} />
      <Route path="/ontology-guide" element={<OntologyGuide />} />
      <Route path="/sdk-guide" element={<SdkGuide />} />
      <Route path="/deployment" element={<DeploymentGuide />} />
    </Routes>
  );
}
