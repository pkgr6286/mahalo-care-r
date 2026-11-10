const BASE = import.meta.env.BASE_URL;

/** Approved artwork only; preserve aspect ratio and the 140px minimum lockup width. */
export function Logo({ light, height = 28 }: { light?: boolean; height?: number }) {
  return (
    <img
      src={`${BASE}brand/${light ? "mahalo-care-white.svg" : "mahalo-care-color.svg"}`}
      alt="Mahalo Care"
      style={{ height: Math.max(height, 28), width: "auto" }}
      className="block select-none"
      draggable={false}
      data-testid="img-logo"
    />
  );
}

export function Mark({ light, size = 28 }: { light?: boolean; size?: number }) {
  const dimension = Math.max(size, 24);
  return <img src={`${BASE}brand/${light ? "mahalo-mark-white.svg" : "mahalo-mark-color.svg"}`} alt="" aria-hidden style={{ width: dimension, height: dimension }} className="block object-contain" draggable={false} />;
}
