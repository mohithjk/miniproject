import Link from "next/link";

type BrandProps = {
  light?: boolean;
};

export function Brand({ light = false }: BrandProps) {
  return (
    <Link aria-label="CodeCanopy home" className={`brand${light ? " brand-light" : ""}`} href="/">
      <svg aria-hidden="true" className="brand-mark" viewBox="0 0 42 46">
        <circle cx="13" cy="14" r="9" />
        <circle cx="27" cy="14" r="9" />
        <circle cx="20" cy="8" r="8" />
        <path d="M20 21v19M12 40h16" />
      </svg>
      <span className="brand-word">
        Code<span>Canopy</span>
      </span>
    </Link>
  );
}
