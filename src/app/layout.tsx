import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/app/actions";
import TopNav from "@/components/TopNav";

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["500", "600", "700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Continental OS",
  description: "Internal operations command center for Continental and its branches.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        {session?.user && <TopNav session={session} signOutAction={signOutAction} />}
        <main className="mx-auto max-w-7xl px-6 pb-24 pt-8">{children}</main>
      </body>
    </html>
  );
}
