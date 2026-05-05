import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SITE_NAME, SITE_URL } from "@/lib/metadata";
import SWRegister from "@/components/pwa/sw-register";
import InstallPrompt from "@/components/pwa/install-prompt";
const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});
const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});
export const metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: SITE_NAME,
        template: `%s | ${SITE_NAME}`,
    },
    description: "Shop the best products at Vendure Store. Quality products, competitive prices, and fast delivery.",
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "AVS ECOM POS",
    },
    icons: {
        icon: "/icons/icon-192.png",
        apple: "/icons/icon-192.png",
    },
    openGraph: {
        type: "website",
        siteName: SITE_NAME,
        locale: "en_US",
    },
    twitter: {
        card: "summary_large_image",
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
};
export const viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#000000" },
    ],
};
export default function RootLayout({ children }) {
    return (<html lang="en" suppressHydrationWarning>
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}>
                <ThemeProvider>
                    {children}
                    <Toaster />
                    <SWRegister />
                    <InstallPrompt />
                </ThemeProvider>
            </body>
        </html>);
}
