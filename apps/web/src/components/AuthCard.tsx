'use client';
// The frame shared by the sign-in and sign-up pages.
import Link from 'next/link';
import { AppIcon } from './AppHeader';

export function AuthCard({
  title,
  subtitle,
  error,
  busy,
  submit,
  action,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  error?: string | null;
  busy?: boolean;
  submit: (e: React.FormEvent) => void;
  action: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-[360px] bg-bg1 border border-line rounded-xl p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <AppIcon size={28} />
          <div>
            <div className="text-[15px] font-semibold">OpenRive</div>
            <div className="text-t2 text-[11px]">{subtitle}</div>
          </div>
        </div>
        <h1 className="sr-only">{title}</h1>

        {children}

        {error && (
          <div role="alert" className="text-[#ffb4b4] text-[11px]">
            {error}
          </div>
        )}

        <button className="btn btn-primary h-9 justify-center mt-1" disabled={busy}>
          {busy ? 'Working…' : action}
        </button>

        {footer && <div className="text-t3 text-[11px] leading-snug">{footer}</div>}
      </form>
    </div>
  );
}

export function AuthField({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <input className="field h-9" {...input} />
      {hint && <span className="text-t3 text-[10px]">{hint}</span>}
    </label>
  );
}

export const AuthLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-accent hover:underline">
    {children}
  </Link>
);
