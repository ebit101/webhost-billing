import {
  useSyncExternalStore,
  type FormEventHandler,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

const subscribeToReadiness = () => () => {};
const clientReady = () => true;
const serverNotReady = () => false;

// The server snapshot also runs during initial hydration. Controls become
// successful only after React has committed the form's submission handler.
export function AuthForm({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  const ready = useSyncExternalStore(
    subscribeToReadiness,
    clientReady,
    serverNotReady,
  );

  return (
    <form
      method="post"
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(event);
      }}
    >
      {!ready ? (
        <p role="status" className="text-sm text-slate-600">
          Preparing secure form. JavaScript is required to continue.
        </p>
      ) : null}
      <noscript>
        <p className="text-sm text-slate-600">
          Enable JavaScript and reload this page to use this secure form.
        </p>
      </noscript>
      <fieldset
        disabled={!ready}
        className="m-0 grid min-w-0 gap-5 border-0 p-0"
      >
        {children}
      </fieldset>
    </form>
  );
}

export function Field({
  label,
  name,
  ...input
}: { label: string; name: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        {...input}
      />
    </label>
  );
}

export function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="h-11 rounded-xl bg-brand-600 px-5 font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function FormNotice({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  if (!error && !message) return null;

  return (
    <p
      role={error ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm ${
        error
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      {error ?? message}
    </p>
  );
}
