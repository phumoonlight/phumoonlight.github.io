import World from './components/globe/World'

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0">
        <World />
      </div>

      {/* Keeps the wordmark and hint legible over the bright side of the globe. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-background/85 via-transparent to-background/90"
      />

      {/* Transparent to pointer events, so the scene underneath stays draggable. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-8 sm:p-12">
        <header>
          <h1 className="font-mono text-sm tracking-[0.35em] text-foreground/90 uppercase">
            Phumoonlight
          </h1>
        </header>
      </div>
    </main>
  )
}
