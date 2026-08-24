'use client';

import { Button } from '../components/ui/button';
import { ErrorState } from '../components/ui/feedback-state';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
    >
      <ErrorState
        description="The page could not be loaded. Your account and billing data were not changed."
        action={
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        }
      />
    </main>
  );
}
