// src/components/fx/FuturisticBackground.tsx
type Props = {
  className?: string;
};

export default function FuturisticBackground({ className }: Props) {
  return (
    <div
      aria-hidden
      className={[
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Color blobs */}
      <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-primary/10 dark:bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-blue-400/10 dark:bg-blue-400/20 blur-3xl" />

      {/* Spotlight – brighter and more “Apple” in light mode */}
      <div
        className="
          absolute inset-0
          bg-[radial-gradient(1100px_540px_at_50%_-18%,rgba(255,255,255,0.9),transparent_60%),radial-gradient(1200px_900px_at_50%_120%,rgba(148,163,184,0.28),transparent_72%)]
          dark:bg-[radial-gradient(1200px_600px_at_50%_-20%,rgba(255,255,255,0.18),transparent)]
        "
      />

      {/* Dotted grid – softer & cooler in light mode */}
      <div
        className="
          absolute inset-0
          bg-[radial-gradient(rgba(148,163,184,0.28)_1px,transparent_1px)]
          dark:bg-[radial-gradient(rgba(255,255,255,0.10)_1px,transparent_1px)]
          bg-[length:24px_24px]
          opacity-35 dark:opacity-70
          mix-blend-soft-light
        "
      />
    </div>
  );
}
