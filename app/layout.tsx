import type { Metadata } from "next"; import "./globals.css";
export const metadata: Metadata = { title:"JobHunter AI", description:"Search jobs, tailor documents, and track applications." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }