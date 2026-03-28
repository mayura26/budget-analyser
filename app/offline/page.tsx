"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-5xl">📡</div>
        <h1 className="text-2xl font-bold">You&apos;re offline</h1>
        <p className="text-muted-foreground">
          Budget Analyser requires a network connection to work. Please check
          your internet and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
