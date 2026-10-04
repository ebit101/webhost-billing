import { LoadingState } from '../components/ui/feedback-state';

export default function Loading() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
    >
      <LoadingState label="Loading page" />
      <noscript>
        <p className="mt-4 text-sm text-slate-600">
          Enable JavaScript and reload this page to use this secure form.
        </p>
      </noscript>
    </main>
  );
}
