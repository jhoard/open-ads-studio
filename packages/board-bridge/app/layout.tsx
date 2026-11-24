import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Board Bridge | Move the work forward",description:"Transfer editable FigJam boards to Miro with a clear compatibility report."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
