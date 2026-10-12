import VerifyEmailForm from './VerifyEmailForm';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const { email } = await searchParams;
  return <VerifyEmailForm initialEmail={typeof email === 'string' ? email : ''} />;
}
