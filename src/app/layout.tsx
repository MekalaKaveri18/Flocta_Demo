import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flocta_Kiln — the context compiler for the AI you already use",
  description:
    "Flocta_Kiln compiles the window: ledger, pointers, tool views, crew slices.",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white text-zinc-950">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
