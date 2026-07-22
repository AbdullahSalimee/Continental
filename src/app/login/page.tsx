import { loginAction } from "@/app/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-6 text-center">
        <span className="relative mx-auto mb-3 flex h-2 w-2 items-center justify-center">
          <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-live" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
        </span>
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Continental OS
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Sign in with your Continental account.
        </p>
      </div>

      <form
        action={loginAction}
        className="space-y-3 rounded-xl border border-border bg-panel p-5"
      >
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            Incorrect email or password.
          </p>
        )}
        <div>
          <label className="mb-1 block text-xs text-text-faint">Email</label>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-border bg-panel-2 px-3 py-2 text-sm outline-none focus:border-live/50"
            placeholder="sam@continental.internal"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-faint">Password</label>
          <input
            name="password"
            type="password"
            required
            className="w-full rounded-md border border-border bg-panel-2 px-3 py-2 text-sm outline-none focus:border-live/50"
            placeholder="••••••••••"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md border border-live/30 bg-live/10 py-2 text-sm font-medium text-live transition-colors hover:bg-live/20"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
