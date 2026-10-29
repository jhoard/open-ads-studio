// Step icons for the rail: one stroke weight, drawn on a 24 px grid, colored by currentColor.

const ICON_PATHS: Record<string, string> = {
  // A painter's palette: the brand kit.
  brand: "M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.6-.7 1.6-1.5 0-1.1-1-1.4-1-2.4 0-.9.7-1.5 1.6-1.5h1.9a4.4 4.4 0 0 0 4.4-4.4C20.5 6.8 16.7 3.5 12 3.5ZM7.5 12h.01M9.5 7.8h.01M14.5 7.8h.01",
  // A box with its lid seam: the product.
  product: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5l8 4.5 8-4.5M12 12v9",
  // A spark of four strokes: make something.
  create: "M12 3v5M12 16v5M3 12h5M16 12h5M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5",
  // An eye: look before shipping.
  review: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  // A tray with an outgoing arrow: export.
  export: "M12 15V3.5M8 7.5l4-4 4 4M4 13v5.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V13",
};

export function StepIcon({ name }: { name: keyof typeof ICON_PATHS | string }) {
  return (
    <svg className="step-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
