'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { ConfirmationDialog } from '../ui/confirmation-dialog';
import { Icon } from '../ui/icon';
import { useToast } from '../ui/toast';

export function DemoActions({ mode }: { mode: 'portal' | 'admin' }) {
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          notify({
            title: 'Reference copied',
            description: 'Fictional account reference DEMO-2026 is ready.',
            tone: 'success',
          })
        }
      >
        <Icon name="activity" className="size-4" />
        Copy reference
      </Button>
      <Button type="button" onClick={() => setOpen(true)}>
        <Icon
          name={mode === 'admin' ? 'users' : 'support'}
          className="size-4"
        />
        {mode === 'admin' ? 'Create customer' : 'Open ticket'}
      </Button>
      <ConfirmationDialog
        open={open}
        title={
          mode === 'admin'
            ? 'Create a fictional customer?'
            : 'Start a support ticket?'
        }
        description="This confirms the interaction pattern only. Command 6 does not write business data."
        confirmLabel="Continue preview"
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          notify({
            title: 'Preview confirmed',
            description: 'No data was created or changed.',
            tone: 'info',
          });
        }}
      />
    </>
  );
}
