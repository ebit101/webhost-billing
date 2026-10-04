import { useLayoutEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthForm, Field, FormNotice, SubmitButton } from './form-controls';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';
import { ForgotPasswordForm } from './forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';
import Loading from '../../app/loading';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('authentication submission readiness', () => {
  it('explains the JavaScript requirement while streamed forms remain behind the loading shell', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Loading />);
    expect(container.querySelector('noscript')?.textContent).toContain(
      'Enable JavaScript',
    );
    expect(container.querySelector('form')).toBeNull();
  });
  it.each([
    ['customer login', <LoginForm key="customer" />],
    ['administrator login', <LoginForm key="admin" audience="admin" />],
    ['registration', <RegisterForm key="registration" />],
    ['reset request', <ForgotPasswordForm key="request" />],
    [
      'reset confirmation',
      <ResetPasswordForm key="reset" token="fictional-reset-token" />,
    ],
  ])(
    'server-renders %s without successful credential controls',
    (_, element) => {
      const container = document.createElement('div');
      container.innerHTML = renderToString(element);
      const form = container.querySelector('form')!;
      expect(form.method).toBe('post');
      expect(form.querySelector('fieldset')?.disabled).toBe(true);
      expect(form.querySelectorAll('input').length).toBeGreaterThan(0);
      // Includes implicit submission and browser autofill: disabled controls
      // cannot enter the submission payload even if a value is present.
      for (const input of form.querySelectorAll('input')) {
        input.value = 'fictional-autofill';
        expect(input.matches(':disabled')).toBe(true);
      }
      expect(
        form.querySelector('button[type="submit"]')?.matches(':disabled'),
      ).toBe(true);
      expect(Array.from(new FormData(form).entries())).toEqual([]);
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        'JavaScript is required',
      );
      expect(container.querySelector('noscript')?.textContent).toContain(
        'Enable JavaScript',
      );
    },
  );

  it('keeps the first hydration commit disabled and cancels early submission before enabling', async () => {
    const submit = vi.fn();
    const initialDisabled: boolean[] = [];
    const errors: unknown[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    function Probe() {
      useLayoutEffect(() => {
        const form = container.querySelector('form')!;
        initialDisabled.push(form.querySelector('fieldset')!.disabled);
        const event = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(submit).not.toHaveBeenCalled();
      }, []);
      return (
        <AuthForm onSubmit={submit}>
          <Field label="Email" name="email" />
          <SubmitButton busy={false}>Continue</SubmitButton>
        </AuthForm>
      );
    }
    container.innerHTML = renderToString(<Probe />);
    const root = hydrateRoot(container, <Probe />, {
      onRecoverableError: (error) => errors.push(error),
    });
    try {
      await act(async () => {});
      expect(initialDisabled).toEqual([true]);
      expect(errors).toEqual([]);
      expect(container.querySelector('fieldset')!.disabled).toBe(false);
      expect(container.querySelector('[role="status"]')).toBeNull();
      const event = new Event('submit', { bubbles: true, cancelable: true });
      await act(async () => {
        container.querySelector('form')!.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
      expect(submit).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('preserves shared button busy state, labels, autocomplete and notice roles', () => {
    const view = render(
      <form>
        <Field label="Code" name="code" autoComplete="one-time-code" required />
        <SubmitButton busy>Verify</SubmitButton>
        <FormNotice error="Try again" />
      </form>,
    );
    expect(screen.getByLabelText('Code').getAttribute('autocomplete')).toBe(
      'one-time-code',
    );
    expect(
      screen
        .getByRole('button', { name: 'Please wait…' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Try again');
    view.rerender(
      <form>
        <SubmitButton busy={false}>Verify</SubmitButton>
        <FormNotice message="Ready" />
      </form>,
    );
    expect(
      screen.getByRole('button', { name: 'Verify' }).hasAttribute('disabled'),
    ).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('Ready');
  });
});
