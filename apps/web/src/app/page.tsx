import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-16 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center">
        <section className="grid w-full gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-400">
              Webhost Billing
            </p>
            <h1 className="mt-5 max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
              Hosting accounts and billing, without the clutter.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              A private customer and administrator system for one focused
              web-hosting business.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/login"
                className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-xl border border-slate-600 px-6 py-3 font-semibold transition hover:border-cyan-400 hover:text-cyan-300"
              >
                Create customer account
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl shadow-cyan-950/30 backdrop-blur sm:p-9">
            <p className="text-sm font-semibold text-cyan-300">
              Secure authentication baseline
            </p>
            <ul className="mt-6 grid gap-4 text-sm leading-6 text-slate-300">
              <li>Argon2id password hashing</li>
              <li>Revocable HttpOnly cookie sessions</li>
              <li>Signed CSRF protection</li>
              <li>Single-use email and reset tokens</li>
              <li>Customer ownership and administrator role checks</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
