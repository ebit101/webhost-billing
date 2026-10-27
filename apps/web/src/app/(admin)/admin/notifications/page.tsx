import type { Metadata } from 'next';
import { NotificationManager } from '../../../../components/notifications/notification-manager';
export const metadata: Metadata = { title: 'Notifications' };
export default function Page() {
  return <NotificationManager />;
}
