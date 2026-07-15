'use client';

import { useRouter } from 'next/navigation';
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';
import UserRoleActionList, { type RoleUser } from './UserRoleActionList';

export default function PromoteToAdminSection({ users }: { users: RoleUser[] }) {
  const { authFetch } = useAuth();
  const router = useRouter();

  const promote = async (userId: number) => {
    const res = await authFetch(`/api/admin/approvals/${userId}`, { method: 'POST' });
    if (res.ok) router.refresh();
  };

  return (
    <UserRoleActionList
      users={users}
      emptyMessage="No employee accounts yet."
      actionLabel="Promote"
      actionBusyLabel="Promoting…"
      actionIcon={faArrowUp}
      actionColor="#16A34A"
      onAction={promote}
    />
  );
}
