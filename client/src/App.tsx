import type { ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { AddItemProvider } from './context/AddItemContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { VerifyEmail } from './pages/VerifyEmail';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { MyStuff } from './pages/MyStuff';
import { ItemDetail } from './pages/ItemDetail';
import { Locations } from './pages/Locations';
import { Borrowed } from './pages/Borrowed';
import { Warranties } from './pages/Warranties';
import { SearchResults } from './pages/SearchResults';
import { Settings } from './pages/Settings';
import { Insights } from './pages/Insights';
import { Reminders } from './pages/Reminders';
import { Tools } from './pages/Tools';
import { Household } from './pages/Household';
import { Labels } from './pages/Labels';
import { Scan } from './pages/Scan';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { NotFound } from './pages/NotFound';

function Authenticated({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AddItemProvider>
        <Layout>{children}</Layout>
      </AddItemProvider>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/" element={<Authenticated><Dashboard /></Authenticated>} />
      <Route path="/stuff" element={<Authenticated><MyStuff /></Authenticated>} />
      <Route path="/items/:id" element={<Authenticated><ItemDetail /></Authenticated>} />
      <Route path="/locations" element={<Authenticated><Locations /></Authenticated>} />
      <Route path="/borrowed" element={<Authenticated><Borrowed /></Authenticated>} />
      <Route path="/warranties" element={<Authenticated><Warranties /></Authenticated>} />
      <Route path="/search" element={<Authenticated><SearchResults /></Authenticated>} />
      <Route path="/tools" element={<Authenticated><Tools /></Authenticated>} />
      <Route path="/insights" element={<Authenticated><Insights /></Authenticated>} />
      <Route path="/reminders" element={<Authenticated><Reminders /></Authenticated>} />
      <Route path="/household" element={<Authenticated><Household /></Authenticated>} />
      <Route path="/labels" element={<Authenticated><Labels /></Authenticated>} />
      <Route path="/scan" element={<Authenticated><Scan /></Authenticated>} />
      <Route path="/settings" element={<Authenticated><Settings /></Authenticated>} />

      <Route path="*" element={<Authenticated><NotFound /></Authenticated>} />
    </Routes>
  );
}
