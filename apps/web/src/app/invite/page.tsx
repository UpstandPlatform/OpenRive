import { InviteController } from '@/components/InviteController';

export default async function InvitePage({ searchParams }: PageProps<'/invite'>) {
  const { id } = await searchParams;
  return <InviteController invitationId={Array.isArray(id) ? id[0] ?? '' : id ?? ''} />;
}
