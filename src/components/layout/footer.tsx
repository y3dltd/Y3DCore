export function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-border py-4">
      <div className="container mx-auto text-center text-sm text-muted-foreground">
        © {currentYear} Y3D Hub (Powered by Yorkshire3D). All rights reserved.
      </div>
    </footer>
  );
} 
