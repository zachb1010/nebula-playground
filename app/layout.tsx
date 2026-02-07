import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nebula Playground | Interactive Cosmic Force Field",
  description: "An immersive, interactive experience combining force fields, autonomous nebulae, and evolving colors. Move your cursor to shape the cosmos.",
  keywords: ["interactive", "force field", "particles", "WebGL", "canvas", "animation"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
