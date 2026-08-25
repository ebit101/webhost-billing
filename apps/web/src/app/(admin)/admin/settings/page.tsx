import type { Metadata } from 'next';
import { SettingsManager } from '../../../../components/settings/settings-manager';
export const metadata: Metadata = { title: 'Settings' };
export default function Page() {
  return <SettingsManager />;
}
