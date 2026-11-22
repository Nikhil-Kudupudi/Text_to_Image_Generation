import { Thumb } from "../../components/ui";

/** A Thumb when the image exists on disk, otherwise the same square frame left empty (no request made). */
export function ImageFrame({ src, alt, available, onClick }: { src: string; alt: string; available: boolean; onClick?: () => void }) {
  if (available) return <Thumb src={src} alt={alt} onClick={onClick} />;
  return <div className="thumb thumb-empty" role="img" aria-label={`${alt} (missing)`} />;
}
