import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: 'sm' | 'md' = 'md',
) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:outline-brand-600',
    secondary:
      'border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-brand-600',
    danger:
      'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:outline-red-600',
    ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:outline-brand-600',
  };

  return `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55 ${
    size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-sm'
  } ${variants[variant]}`;
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: 'sm' | 'md';
  }
>(function Button(
  { variant = 'primary', size = 'md', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${buttonStyles(variant, size)} ${className}`}
      {...props}
    />
  );
});
