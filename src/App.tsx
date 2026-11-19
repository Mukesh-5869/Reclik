import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { RazorpayCheckoutModal } from './components/RazorpayCheckoutModal';
import { CookieBanner } from './components/CookieBanner';
import { LandingPage } from './pages/LandingPage';
import { BoothPage } from './pages/BoothPage';
import { PricingPage } from './pages/PricingPage';
import { AuthPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { ContactPage, FaqPage, PrivacyPage, TermsPage } from './pages/LegalAndSupportPages';

function AppShell() {
  const { route, settings, user } = useApp();
  const path = route.split('?')[0];

  const renderPage = () => {
    switch (path) {
      case '/':
        return <LandingPage />;
      case '/booth':
        return <BoothPage />;
      case '/pricing':
        return <PricingPage />;
      case '/login':
        return <AuthPage mode="login" />;
      case '/signup':
        return <AuthPage mode="signup" />;
      case '/reset-password':
        return <AuthPage mode="reset" />;
      case '/admin/login':
        return <AuthPage mode="admin_login" />;
      case '/dashboard':
        return <DashboardPage />;
      case '/admin':
        return <AdminPage />;
      case '/privacy':
        return <PrivacyPage />;
      case '/terms':
        return <TermsPage />;
      case '/faq':
        return <FaqPage />;
      case '/contact':
        return <ContactPage />;
      default:
        return <LandingPage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F5EF] dark:bg-[#0A0908] text-[#171412] dark:text-[#F5F2EC] transition-colors">
      <Navbar />
      {settings.maintenanceMode && user?.role !== 'super_admin' && (
        <div className="bg-[#D4AF37]/20 border-b border-[#D4AF37]/40 px-4 py-2 text-center text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
          Reclik is undergoing scheduled maintenance. Generation will resume shortly.
        </div>
      )}
      <main className="flex-1">{renderPage()}</main>
      <Footer />
      <RazorpayCheckoutModal />
      <CookieBanner />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
