export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeDatabase } = await import("./lib/db/init");
    initializeDatabase();
  }
}
