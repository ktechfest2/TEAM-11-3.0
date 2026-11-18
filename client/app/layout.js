import "./globals.css";
import AppProvider from "@/components/layout/AppProvider";
import AppShell from "@/components/layout/AppShell";

export const metadata = {
  title: { default: "AwaVote", template: "%s · AwaVote" },
  description: "Every Vote. Every Count. Every Voice. Offline-first election information, evidence capture and result verification for Nigeria.",
  manifest: "/manifest.webmanifest",
  applicationName: "AwaVote",
  appleWebApp: { capable: true, title: "AwaVote", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }], shortcut: "/favicon.ico", apple: "/icons/apple-touch-icon.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1310" },
  ],
};

// Apply accessibility settings before first paint (no flash of small / low-contrast text).
const PRE_PAINT = `try{var s=JSON.parse(localStorage.getItem("awavote.settings")||"{}"),h=document.documentElement;
h.dataset.textSize=s.textSize||"lg";h.dataset.contrast=s.highContrast?"high":"normal";h.dataset.theme=s.theme||"system";h.dataset.reduceMotion=String(!!s.reduceMotion);
if(s.language)h.lang=s.language}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-text-size="lg" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
      </head>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
