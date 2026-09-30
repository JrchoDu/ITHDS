import "./globals.css";

export const metadata = {
  title: "IT Helpdesk Simulator",
  description: "Diagnose and resolve a shift of fictional IT support tickets.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
